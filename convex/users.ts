import { createClerkClient, type UserJSON } from '@clerk/backend';
import { type Validator, v } from 'convex/values';
import { nanoid } from 'nanoid';
import { internal } from './_generated/api';
import {
  action,
  internalMutation,
  mutation,
  type QueryCtx,
  query,
} from './_generated/server';

// Move regex to top level for performance
const HANDLE_REGEX = /^[a-zA-Z0-9_-]+$/;

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
      await ctx.db.insert('users', userAttributes);
    }
  },
});

export const deleteFromClerk = internalMutation({
  args: { clerkUserId: v.string() },
  async handler(ctx, { clerkUserId }) {
    const user = await userByExternalId(ctx, clerkUserId);

    if (user !== null) {
      await ctx.db.delete(user._id);
    } else {
      // biome-ignore lint/suspicious/noConsole: it's ok to use console under convex
      console.warn(
        `Can't delete user, there is none for Clerk user ID: ${clerkUserId}`
      );
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
    .query('users')
    .withIndex('byExternalId', (q) => q.eq('externalId', externalId))
    .unique();
}

export const getById = query({
  args: { userId: v.id('users') },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
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

export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const user = await ctx.db
      .query('users')
      .withIndex('byHandle', (q) => q.eq('handle', handle))
      .unique();

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

// Internal mutation to update user profile in Convex database
export const updateUserProfile = internalMutation({
  args: {
    name: v.string(),
    handle: v.string(),
    imageStorageId: v.optional(v.id('_storage')),
  },
  handler: async (ctx, { name, handle, imageStorageId }) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Check if name is already taken by another user
    const existingUserWithName = await ctx.db
      .query('users')
      .withIndex('byName', (q) => q.eq('name', name.trim()))
      .filter((q) => q.neq(q.field('_id'), user._id))
      .first();

    if (existingUserWithName) {
      throw new Error('이미 사용 중인 이름입니다.');
    }

    // Check if handle is already taken by another user
    const existingUserWithHandle = await ctx.db
      .query('users')
      .withIndex('byHandle', (q) => q.eq('handle', handle.trim()))
      .filter((q) => q.neq(q.field('_id'), user._id))
      .first();

    if (existingUserWithHandle) {
      throw new Error('이미 사용 중인 핸들입니다.');
    }

    // Validate handle format
    if (!HANDLE_REGEX.test(handle)) {
      throw new Error('핸들은 영문, 숫자, _, - 만 사용할 수 있습니다.');
    }

    // Update user profile in Convex
    await ctx.db.patch(user._id, {
      name: name.trim(),
      handle: handle.trim(),
      hasCompletedSetup: true, // Mark setup as completed
      ...(imageStorageId && { imageStorageId }),
    });

    return { success: true, userId: user._id, externalId: user.externalId };
  },
});

// Action to update both Convex and Clerk
export const updateProfile = action({
  args: {
    name: v.string(),
    handle: v.string(),
    imageStorageId: v.optional(v.id('_storage')),
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
          name: name.trim(),
          handle: handle.trim(),
          convexUserId: result.userId,
        },
      });
    } catch (error) {
      // Log Clerk update error but don't fail the entire operation
      // biome-ignore lint/suspicious/noConsole: Server-side error logging is acceptable
      console.warn('Failed to update Clerk user:', error);
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
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db
      .query('users')
      .filter((q) => q.neq(q.field('imageStorageId'), undefined))
      .collect();

    // Sort by _creationTime (latest first) to prioritize recent uploads
    return users.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const updateImage = mutation({
  args: {
    userId: v.id('users'),
    storageId: v.id('_storage'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { userId, storageId, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    await ctx.db.patch(userId, {
      imageStorageId: storageId,
    });

    return { success: true };
  },
});

export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrThrow(ctx);

    // Delete all user's reviews first
    const userReviews = await ctx.db
      .query('reviews')
      .withIndex('by_user', (q) => q.eq('userId', user.externalId))
      .collect();

    for (const review of userReviews) {
      // Delete review images from storage
      if (review.imageStorageIds) {
        for (const imageId of review.imageStorageIds) {
          await ctx.storage.delete(imageId);
        }
      }
      // Delete the review
      await ctx.db.delete(review._id);
    }

    // Delete user's profile image from storage
    if (user.imageStorageId) {
      await ctx.storage.delete(user.imageStorageId);
    }

    // Delete the user record
    await ctx.db.delete(user._id);

    return { success: true };
  },
});
