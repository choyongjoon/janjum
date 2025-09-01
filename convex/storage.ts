import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

/**
 * Get storage files from the system with pagination
 * Returns a paginated result with cursor-based pagination
 */
export const getAllStorageFiles = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { cursor, limit = 8000 }) => {
    // Ensure we don't exceed Convex limits
    const safeLimit = Math.min(limit, 8000);

    let storageQuery = ctx.db.system.query('_storage');

    if (cursor) {
      // Resume from cursor
      storageQuery = storageQuery.filter((q) => q.gt(q.field('_id'), cursor));
    }

    const storageFiles = await storageQuery.order('asc').take(safeLimit + 1); // Take one extra to check if there are more

    const hasMore = storageFiles.length > safeLimit;
    const items = hasMore ? storageFiles.slice(0, safeLimit) : storageFiles;
    const nextCursor = hasMore ? items.at(-1)?._id : null;

    return {
      files: items.map((file) => file._id),
      nextCursor,
      hasMore,
      total: items.length,
    };
  },
});

/**
 * Get metadata for multiple storage files
 */
export const getStorageMetadata = query({
  args: { storageIds: v.array(v.id('_storage')) },
  handler: async (ctx, { storageIds }) => {
    const metadataPromises = storageIds.map(async (storageId) => {
      try {
        const metadata = await ctx.db.system.get(storageId);
        return {
          storageId,
          metadata,
        };
      } catch (error) {
        return {
          storageId,
          metadata: null,
          error: String(error),
        };
      }
    });

    return await Promise.all(metadataPromises);
  },
});

/**
 * Delete a storage file
 * WARNING: This permanently deletes the file from storage
 */
export const deleteStorageFile = mutation({
  args: {
    storageId: v.id('_storage'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageId, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    try {
      await ctx.storage.delete(storageId);
      return { success: true, storageId };
    } catch (error) {
      return {
        success: false,
        storageId,
        error: String(error),
      };
    }
  },
});

/**
 * Delete multiple storage files in batch
 */
export const deleteStorageFiles = mutation({
  args: {
    storageIds: v.array(v.id('_storage')),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageIds, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    const results: Array<{
      success: boolean;
      storageId: Id<'_storage'>;
      error?: string;
    }> = [];

    for (const storageId of storageIds) {
      try {
        await ctx.storage.delete(storageId);
        results.push({ success: true, storageId });
      } catch (error) {
        results.push({
          success: false,
          storageId,
          error: String(error),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return {
      total: results.length,
      successCount,
      failureCount,
      results,
    };
  },
});

/**
 * Get statistics about storage usage
 */
export const getStorageStats = query({
  args: {},
  handler: async (ctx) => {
    const storageFiles = await ctx.db.system.query('_storage').collect();

    let totalSize = 0;
    const totalFiles = storageFiles.length;
    const contentTypes: Record<string, number> = {};

    for (const file of storageFiles) {
      if (file.size) {
        totalSize += file.size;
      }
      if (file.contentType) {
        contentTypes[file.contentType] =
          (contentTypes[file.contentType] || 0) + 1;
      }
    }

    return {
      totalFiles,
      totalSize,
      totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100,
      contentTypes,
    };
  },
});
