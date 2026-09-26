import { describe, expect, it, vi } from "vitest";
import {
  type ProductImageDeps,
  resolveProductImage,
  summarizeImageOutcomes,
} from "./product-image";

interface TestProduct {
  externalId: string;
  externalImageUrl: string;
  imageStorageId?: string;
  name: string;
}

const product = (overrides: Partial<TestProduct> = {}): TestProduct => ({
  externalId: "p1",
  externalImageUrl: "https://example.com/p1.jpg",
  name: "아메리카노",
  ...overrides,
});

const fakeDeps = (): ProductImageDeps => ({
  prepareImage: vi.fn(async () => ({
    buffer: Buffer.from("webp"),
    originalSize: 2000,
    optimizedSize: 800,
  })),
  uploadImage: vi.fn(async () => "storage-new"),
});

describe("resolveProductImage", () => {
  it("never uploads to storage on a dry run", async () => {
    const deps = fakeDeps();
    const { product: result, outcome } = await resolveProductImage(
      product(),
      undefined,
      deps,
      true
    );

    expect(deps.prepareImage).toHaveBeenCalledOnce();
    expect(deps.uploadImage).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "would-upload", bytes: 800 });
    expect(result.imageStorageId).toBeUndefined();
  });

  it("uploads new images on a real run", async () => {
    const deps = fakeDeps();
    const { product: result, outcome } = await resolveProductImage(
      product(),
      undefined,
      deps,
      false
    );

    expect(deps.uploadImage).toHaveBeenCalledOnce();
    expect(outcome).toEqual({
      kind: "uploaded",
      storageId: "storage-new",
      bytes: 800,
    });
    expect(result.imageStorageId).toBe("storage-new");
  });

  it("reuses an existing storage id without downloading", async () => {
    const deps = fakeDeps();
    const { product: result, outcome } = await resolveProductImage(
      product(),
      "storage-old",
      deps,
      false
    );

    expect(deps.prepareImage).not.toHaveBeenCalled();
    expect(deps.uploadImage).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "reused", storageId: "storage-old" });
    expect(result.imageStorageId).toBe("storage-old");
  });

  it("reports failed downloads and thrown errors", async () => {
    const deps = fakeDeps();
    vi.mocked(deps.prepareImage).mockResolvedValueOnce(null);
    const missing = await resolveProductImage(product(), undefined, deps, true);
    expect(missing.outcome).toEqual({ kind: "failed" });

    const error = new Error("boom");
    vi.mocked(deps.uploadImage).mockRejectedValueOnce(error);
    const thrown = await resolveProductImage(product(), undefined, deps, false);
    expect(thrown.outcome).toEqual({ kind: "failed", error });
    expect(thrown.product.imageStorageId).toBeUndefined();
  });

  it("skips products without an image URL", async () => {
    const deps = fakeDeps();
    const { outcome } = await resolveProductImage(
      product({ externalImageUrl: "" }),
      undefined,
      deps,
      false
    );

    expect(outcome).toEqual({ kind: "no-image" });
    expect(deps.prepareImage).not.toHaveBeenCalled();
  });
});

describe("summarizeImageOutcomes", () => {
  it("counts dry-run and real uploads alike as new images", () => {
    expect(
      summarizeImageOutcomes([
        { kind: "would-upload", bytes: 100 },
        { kind: "uploaded", storageId: "s", bytes: 50 },
        { kind: "reused", storageId: "r" },
        { kind: "failed" },
        { kind: "no-image" },
      ])
    ).toEqual({ bytes: 150, failed: 1, newImages: 2, noImage: 1, reused: 1 });
  });
});
