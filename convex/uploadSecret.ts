/**
 * Shared guard for admin-only Convex functions that are called by external
 * scripts (image optimization, storage cleanup) rather than from the app.
 *
 * Mirrors the existing pattern used by the storage/cafe/product mutations:
 * when `CONVEX_UPLOAD_SECRET` is configured (e.g. production) the secret is
 * required and must match; when it is unset (local dev) the check is skipped
 * so scripts can run against a dev deployment without extra setup.
 */
export function verifyUploadSecret(uploadSecret?: string): void {
  const expected = process.env.CONVEX_UPLOAD_SECRET;
  if (expected && uploadSecret !== expected) {
    throw new Error("Unauthorized: Invalid upload secret");
  }
}
