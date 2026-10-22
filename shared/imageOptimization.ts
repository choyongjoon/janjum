import sharp from "sharp";

// Product images render at most 448px wide (product page), so 800px still
// covers 2x displays. Crawled originals are often 1000-1500px.
export const MAX_IMAGE_DIMENSION = 800;
const WEBP_QUALITY = 80;

// Stored images above this size are worth re-encoding with
// `pnpm optimize-images:prod`.
export const OPTIMIZED_IMAGE_MAX_BYTES = 100 * 1024;

/**
 * Re-encode an image as WebP, scaled down to fit MAX_IMAGE_DIMENSION. Applies
 * to WebP input too: an already-WebP original can still be far larger than
 * what the site displays.
 */
export async function toOptimizedWebp(
  input: Buffer | ArrayBuffer
): Promise<Buffer> {
  return await sharp(input)
    .rotate()
    .resize({
      width: MAX_IMAGE_DIMENSION,
      height: MAX_IMAGE_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toBuffer();
}
