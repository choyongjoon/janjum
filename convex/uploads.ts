import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { claimStorageIds, releaseStorageIds } from "./storageOwnership";
import { getCurrentUserOrThrow } from "./users";

/**
 * Delete files the current user uploaded but never attached, e.g. after a
 * failed review or profile submission. Files that were already claimed (i.e.
 * attached to a document) are left alone, so a submission that actually
 * succeeded is never broken by a client that thought it failed.
 */
export const discardUploads = mutation({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    const user = await getCurrentUserOrThrow(ctx);

    const unclaimed: Id<"_storage">[] = [];
    for (const storageId of storageIds) {
      const owner = await ctx.db
        .query("storageOwners")
        .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
        .first();
      if (!owner) {
        unclaimed.push(storageId);
      }
    }

    // Claiming first applies the same checks as attaching: only the caller's
    // own, recent, unused uploads can be discarded.
    await claimStorageIds(ctx, user._id, unclaimed);
    await releaseStorageIds(ctx, unclaimed);

    return { discarded: unclaimed.length };
  },
});
