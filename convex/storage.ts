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

    // Real pagination. The previous version sorted by _creationTime but
    // resumed with `_id > cursor`; ids aren't in creation order, so pages
    // overlapped and skipped files, and every page rescanned the table.
    const result = await ctx.db.system
      .query("_storage")
      .paginate({ cursor: cursor ?? null, numItems: safeLimit });
    const items = result.page;
    const hasMore = !result.isDone;
    const nextCursor = hasMore ? result.continueCursor : null;

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

/**
 * Delete product images the uploader stored for an upload that then failed.
 * Skips any file a product references, in case the failed-looking upload had
 * actually committed (e.g. the response was lost after the mutation ran).
 */
export const deleteUnreferencedProductImages = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { storageIds, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    let deleted = 0;
    for (const storageId of storageIds) {
      const referenced = await ctx.db
        .query("products")
        .withIndex("by_image_storage_id", (q) =>
          q.eq("imageStorageId", storageId)
        )
        .first();
      if (!referenced) {
        await ctx.storage.delete(storageId);
        deleted++;
      }
    }
    return { deleted, kept: storageIds.length - deleted };
  },
});
