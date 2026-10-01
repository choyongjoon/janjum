import { createClerkClient, type UserJSON } from "@clerk/backend";
import { type Validator, v } from "convex/values";
import { nanoid } from "nanoid";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import {
  claimStorageIds,
  recordStorageOwner,
  releaseStorageIds,
} from "./storageOwnership";
import { verifyUploadSecret } from "./uploadSecret";

// Move regex to top level for performance
const HANDLE_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_NAME_LENGTH = 30;
const MAX_HANDLE_LENGTH = 30;

/**
 * The fields of a user that anyone may see. The full document also holds the
 * Clerk user id (externalId), which only the user themselves gets (`current`).
 */
async function toPublicUser(ctx: QueryCtx, user: Doc<"users">) {
  return {
    _id: user._id,
    _creationTime: user._creationTime,
    name: user.name,
    handle: user.handle,
    imageUrl: user.imageStorageId
      ? (await ctx.storage.getUrl(user.imageStorageId)) || undefined
      : undefined,
  };
}

/**
 * Delete a user and everything they own: reviews, review photos and profile
 * image. Refreshes the rating caches of the products they reviewed.
 */
async function deleteUserAndData(ctx: MutationCtx, user: Doc<"users">) {
  // Reviews store the Convex users._id in their userId field (not the Clerk
  // externalId), so query by _id.
  const userReviews = await ctx.db
    .query("reviews")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();

  // Products whose cached rating stats must be recomputed once this user's
  // reviews are removed.
  const affectedProductIds = new Set(userReviews.map((r) => r.productId));

  for (const review of userReviews) {
    // Best-effort: a missing file must not roll back the account deletion.
    await releaseStorageIds(ctx, review.imageStorageIds ?? []);
    await ctx.db.delete(review._id);
  }

  // Refresh averageRating/totalReviews for each affected product so the
  // caches don't keep counting the now-deleted reviews. Scheduled (rather
  // than runMutation) so each recompute runs after this deletion commits,
  // matching how the codebase triggers follow-up work from a mutation.
  for (const productId of affectedProductIds) {
    await ctx.scheduler.runAfter(0, internal.reviews.updateProductStats, {
      productId,
    });
  }

  if (user.imageStorageId) {
    await releaseStorageIds(ctx, [user.imageStorageId]);
  }

  await ctx.db.delete(user._id);
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return null;
    }

    return {
      ...user,
      imageUrl: user.imageStorageId
        ? (await ctx.storage.getUrl(user.imageStorageId)) || undefined
        : undefined,
    };
  },
});

export const upsertFromClerk = internalMutation({
  args: { data: v.any() as Validator<UserJSON> }, // no runtime validation, trust Clerk
  async handler(ctx, { data }) {
    const initialName = nanoid(8);
    const userAttributes = {
      name: initialName,
      handle: initialName,
      hasCompletedSetup: false, // New users need to complete setup
      externalId: data.id,
    };

    const user = await userByExternalId(ctx, data.id);
    if (user === null) {
      // New user - create with hasCompletedSetup = false
      await ctx.db.insert("users", userAttributes);
    }
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  async handler(ctx, { clerkUserId }) {
    const user = await userByExternalId(ctx, clerkUserId);

    // Expected when deleteAccount already removed the user before Clerk's
    // user.deleted webhook arrived.
    if (user === null) {
      console.warn(
        `Can't delete user, there is none for Clerk user ID: ${clerkUserId}`
      );
    } else {
      await deleteUserAndData(ctx, user);
    }
  },
});

export async function getCurrentUserOrThrow(ctx: QueryCtx) {
  const userRecord = await getCurrentUser(ctx);
  if (!userRecord) {
    throw new Error("Can't get current user");
  }
  return userRecord;
}

export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    return null;
  }

  const user = await userByExternalId(ctx, identity.subject);
  return user;
}

async function userByExternalId(ctx: QueryCtx, externalId: string) {
  return await ctx.db
    .query("users")
    .withIndex("byExternalId", (q) => q.eq("externalId", externalId))
    .unique();
}

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }

    return await toPublicUser(ctx, user);
  },
});

export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("byHandle", (q) => q.eq("handle", handle))
      .unique();

    if (!user) {
      return null;
    }

    return await toPublicUser(ctx, user);
  },
});

// Internal mutation to update user profile in Convex database
export const updateUserProfile = internalMutation({
  args: {
    name: v.string(),
    handle: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUserOrThrow(ctx);
    const name = args.name.trim();
    const handle = args.handle.trim();
    const { imageStorageId } = args;

    if (!name || name.length > MAX_NAME_LENGTH) {
      throw new Error(`이름은 1~${MAX_NAME_LENGTH}자로 입력해주세요.`);
    }
    if (!handle || handle.length > MAX_HANDLE_LENGTH) {
      throw new Error(`핸들은 1~${MAX_HANDLE_LENGTH}자로 입력해주세요.`);
    }

    // Validate handle format
    if (!HANDLE_REGEX.test(handle)) {
      throw new Error("핸들은 영문, 숫자, _, - 만 사용할 수 있습니다.");
    }

    // Check if name is already taken by another user
    const existingUserWithName = await ctx.db
      .query("users")
      .withIndex("byName", (q) => q.eq("name", name))
      .filter((q) => q.neq(q.field("_id"), user._id))
      .first();

    if (existingUserWithName) {
      throw new Error("이미 사용 중인 이름입니다.");
    }

    // Check if handle is already taken by another user
    const existingUserWithHandle = await ctx.db
      .query("users")
      .withIndex("byHandle", (q) => q.eq("handle", handle))
      .filter((q) => q.neq(q.field("_id"), user._id))
      .first();

    if (existingUserWithHandle) {
      throw new Error("이미 사용 중인 핸들입니다.");
    }

    // Only the user's own upload may become their profile image; otherwise
    // deleting the account would delete whatever file the client pointed at.
    const previousImageId = user.imageStorageId;
    if (imageStorageId) {
      await claimStorageIds(
        ctx,
        user._id,
        [imageStorageId],
        previousImageId ? [previousImageId] : []
      );
    }

    // Update user profile in Convex
    await ctx.db.patch(user._id, {
      name,
      handle,
      hasCompletedSetup: true, // Mark setup as completed
      ...(imageStorageId && { imageStorageId }),
    });

    // Delete the replaced profile image
    if (
      imageStorageId &&
      previousImageId &&
      previousImageId !== imageStorageId
    ) {
      await releaseStorageIds(ctx, [previousImageId]);
    }

    return {
      success: true,
      userId: user._id,
      externalId: user.externalId,
      name,
      handle,
    };
  },
});

// Action to update both Convex and Clerk
export const updateProfile = action({
  args: {
    name: v.string(),
    handle: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { name, handle, imageStorageId }) => {
    // Update user profile in Convex database
    const result = await ctx.runMutation(internal.users.updateUserProfile, {
      name,
      handle,
      imageStorageId,
    });

    // Update Clerk user with name as username and metadata
    try {
      const clerkClient = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      await clerkClient.users.updateUser(result.externalId, {
        privateMetadata: {
          name: result.name,
          handle: result.handle,
          convexUserId: result.userId,
        },
      });
    } catch (error) {
      // Log Clerk update error but don't fail the entire operation
      console.warn("Failed to update Clerk user:", error);
    }

    return { success: true };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    // Ensure user is authenticated
    await getCurrentUserOrThrow(ctx);

    // Generate upload URL for profile image
    return await ctx.storage.generateUploadUrl();
  },
});

export const getAllWithImages = query({
  args: { uploadSecret: v.optional(v.string()) },
  handler: async (ctx, { uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    const users = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("imageStorageId"), undefined))
      .collect();

    // Sort by _creationTime (latest first) to prioritize recent uploads
    return users.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const updateImage = mutation({
  args: {
    userId: v.id("users"),
    storageId: v.id("_storage"),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { userId, storageId, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    // The replacement file (e.g. an optimized image) belongs to the user.
    await recordStorageOwner(ctx, userId, storageId);

    await ctx.db.patch(userId, {
      imageStorageId: storageId,
    });

    return { success: true };
  },
});

/**
 * Delete the current user's account: the Clerk user and all Convex data.
 *
 * The Clerk user is deleted first. If that fails nothing has been removed and
 * the user can retry; deleting only the Convex data would leave a Clerk user
 * who can still sign in but has no Convex user (Clerk only sends user.created
 * once), so every authenticated call would fail.
 */
export const deleteAccount = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Can't get current user");
    }

    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    await clerkClient.users.deleteUser(identity.subject);

    // Clerk's user.deleted webhook runs the same cleanup; whichever arrives
    // second finds no user and does nothing.
    await ctx.runMutation(internal.users.deleteFromClerk, {
      clerkUserId: identity.subject,
    });

    return { success: true };
  },
});
