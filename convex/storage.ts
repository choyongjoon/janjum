import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { verifyUploadSecret } from "./uploadSecret";

/**
 * Get storage files from the system with pagination
 * Returns a paginated result with cursor-based pagination
 */
export const getAllStorageFiles = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { cursor, limit = 8000, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    // Ensure we don't exceed Convex limits
    const safeLimit = Math.min(limit, 8000);

    // Use Convex pagination: _ids are not ordered by creation time, so a
    // `_id > cursor` filter on a creation-ordered query returns some files on
    // several pages and skips others.
    const page = await ctx.db.system
      .query("_storage")
      .order("asc")
      .paginate({ cursor: cursor ?? null, numItems: safeLimit });

    return {
      files: page.page.map((file) => file._id),
      nextCursor: page.isDone ? null : page.continueCursor,
      hasMore: !page.isDone,
      total: page.page.length,
    };
  },
});

/**
 * Get metadata for multiple storage files
 */
export const getStorageMetadata = query({
  args: {
    storageIds: v.array(v.id("_storage")),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageIds, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

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
    storageId: v.id("_storage"),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageId, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

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
    storageIds: v.array(v.id("_storage")),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageIds, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    const results: Array<{
      success: boolean;
      storageId: Id<"_storage">;
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
  args: { uploadSecret: v.optional(v.string()) },
  handler: async (ctx, { uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    const storageFiles = await ctx.db.system.query("_storage").collect();

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
