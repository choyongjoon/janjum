/**
 * Decide what to do with one product's image before the upload mutation.
 *
 * Kept free of Convex/sharp/fetch so the dry-run guarantee -- a dry run never
 * writes to storage -- can be tested with fakes. Storage files uploaded during
 * a dry run are never referenced by a product, so they become orphans: adding
 * tomntoms left 167 of them behind.
 */

interface ProductWithImage {
  externalId: string;
  externalImageUrl: string;
  imageStorageId?: string;
  name: string;
}

export interface PreparedImage {
  buffer: Buffer;
  optimizedSize: number;
  originalSize: number;
}

export interface ProductImageDeps {
  /** Download and convert to WebP. Returns null when the download fails. */
  prepareImage: (
    imageUrl: string,
    productName: string
  ) => Promise<PreparedImage | null>;
  /** Upload a prepared image to storage and return its storage id. */
  uploadImage: (image: PreparedImage) => Promise<string>;
}

export type ProductImageOutcome =
  | { kind: "no-image" }
  | { kind: "reused"; storageId: string }
  | { kind: "uploaded"; storageId: string; bytes: number }
  | { kind: "would-upload"; bytes: number }
  | { kind: "failed"; error?: unknown };

export async function resolveProductImage<T extends ProductWithImage>(
  product: T,
  existingStorageId: string | undefined,
  deps: ProductImageDeps,
  dryRun: boolean
): Promise<{ product: T; outcome: ProductImageOutcome }> {
  if (!product.externalImageUrl) {
    return { product, outcome: { kind: "no-image" } };
  }

  if (existingStorageId) {
    return {
      product: { ...product, imageStorageId: existingStorageId },
      outcome: { kind: "reused", storageId: existingStorageId },
    };
  }

  try {
    const image = await deps.prepareImage(
      product.externalImageUrl,
      product.name
    );
    if (!image) {
      return { product, outcome: { kind: "failed" } };
    }

    if (dryRun) {
      return {
        product,
        outcome: { kind: "would-upload", bytes: image.optimizedSize },
      };
    }

    const storageId = await deps.uploadImage(image);
    return {
      product: { ...product, imageStorageId: storageId },
      outcome: { kind: "uploaded", storageId, bytes: image.optimizedSize },
    };
  } catch (error) {
    return { product, outcome: { kind: "failed", error } };
  }
}

export interface ImageSummary {
  bytes: number;
  failed: number;
  newImages: number;
  noImage: number;
  reused: number;
}

export function summarizeImageOutcomes(
  outcomes: ProductImageOutcome[]
): ImageSummary {
  const summary: ImageSummary = {
    bytes: 0,
    failed: 0,
    newImages: 0,
    noImage: 0,
    reused: 0,
  };
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case "no-image":
        summary.noImage += 1;
        break;
      case "reused":
        summary.reused += 1;
        break;
      case "uploaded":
      case "would-upload":
        summary.newImages += 1;
        summary.bytes += outcome.bytes;
        break;
      case "failed":
        summary.failed += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}
