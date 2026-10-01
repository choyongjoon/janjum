import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// A user may only attach a storage file they uploaded themselves. Claims are
// recorded the first time a file is attached, so the window in which an
// unclaimed file can be claimed is kept short: a file older than this was not
// just uploaded by the caller.
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

async function isReferencedByCatalog(
  ctx: MutationCtx,
  storageId: Id<"_storage">
): Promise<boolean> {
  const product = await ctx.db
    .query("products")
    .withIndex("by_image_storage_id", (q) => q.eq("imageStorageId", storageId))
    .first();
  if (product) {
    return true;
  }
  const user = await ctx.db
    .query("users")
    .withIndex("byImageStorageId", (q) => q.eq("imageStorageId", storageId))
    .first();
  if (user) {
    return true;
  }
  const cafes = await ctx.db.query("cafes").collect();
  return cafes.some((cafe) => cafe.imageStorageId === storageId);
}

/**
 * Record `userId` as the owner of `storageId`, for files written by trusted
 * admin scripts on a user's behalf (e.g. image optimization).
 */
export async function recordStorageOwner(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageId: Id<"_storage">
): Promise<void> {
  const existing = await ctx.db
    .query("storageOwners")
    .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
    .first();
  if (existing) {
    if (existing.userId !== userId) {
      await ctx.db.patch(existing._id, { userId });
    }
    return;
  }
  await ctx.db.insert("storageOwners", { storageId, userId });
}

/**
 * Verify that `userId` may attach every id in `storageIds`, claiming files
 * that are not yet owned. Ids in `alreadyAttached` (the files the user's
 * document already references) are always accepted.
 *
 * Without this, a client could attach any storage id -- e.g. a product image
 * id returned by the public product queries -- and then delete it through
 * deleteReview / deleteAccount.
 */
export async function claimStorageIds(
  ctx: MutationCtx,
  userId: Id<"users">,
  storageIds: Id<"_storage">[],
  alreadyAttached: Id<"_storage">[] = []
): Promise<void> {
  const attached = new Set(alreadyAttached);

  for (const storageId of storageIds) {
    if (attached.has(storageId)) {
      continue;
    }

    const owner = await ctx.db
      .query("storageOwners")
      .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
      .first();
    if (owner) {
      if (owner.userId !== userId) {
        throw new Error("Unauthorized: storage file belongs to another user");
      }
      continue;
    }

    const file = await ctx.db.system.get(storageId);
    if (!file) {
      throw new Error(`Storage file not found: ${storageId}`);
    }
    if (Date.now() - file._creationTime > CLAIM_WINDOW_MS) {
      throw new Error("Unauthorized: storage file was not recently uploaded");
    }
    if (await isReferencedByCatalog(ctx, storageId)) {
      throw new Error("Unauthorized: storage file is already in use");
    }

    await ctx.db.insert("storageOwners", { storageId, userId });
  }
}

/**
 * Delete storage files and their ownership records. Best-effort: a missing
 * file must not roll back the caller's transaction.
 */
export async function releaseStorageIds(
  ctx: MutationCtx,
  storageIds: Id<"_storage">[]
): Promise<void> {
  for (const storageId of storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch (_error) {
      // Storage cleanup failure is not critical
    }
    const owners = await ctx.db
      .query("storageOwners")
      .withIndex("by_storage_id", (q) => q.eq("storageId", storageId))
      .collect();
    for (const owner of owners) {
      await ctx.db.delete(owner._id);
    }
  }
}
