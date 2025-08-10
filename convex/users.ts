import type { UserJSON } from '@clerk/backend';
import { type Validator, v } from 'convex/values';
import { nanoid } from 'nanoid';
import {
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
    return await getCurrentUser(ctx);
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
    } else {
      // Existing user - don't override hasCompletedSetup
      const { hasCompletedSetup: _hasCompletedSetup, ...updateAttributes } =
        userAttributes;
      await ctx.db.patch(user._id, updateAttributes);
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
    return await ctx.db.get(userId);
  },
});

export const updateProfile = mutation({
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

    // Update user profile
    await ctx.db.patch(user._id, {
      name: name.trim(),
      handle: handle.trim(),
      hasCompletedSetup: true, // Mark setup as completed
      ...(imageStorageId && { imageStorageId }),
    });

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

export const getImageUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});
