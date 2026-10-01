/**
 * Shared guard for admin-only Convex functions that are called by external
 * scripts (uploads, image optimization, storage cleanup) rather than from the
 * app.
 *
 * Fails closed: when `CONVEX_UPLOAD_SECRET` is not configured on the
 * deployment, every call is rejected. Skipping the check instead would leave
 * these public functions (which can delete products and storage files) open
 * to anyone with the deployment URL. Set the variable on dev deployments too.
 */
export function verifyUploadSecret(uploadSecret?: string): void {
  const expected = process.env.CONVEX_UPLOAD_SECRET;
  if (!expected || uploadSecret !== expected) {
    throw new Error("Unauthorized: Invalid upload secret");
  }
}
