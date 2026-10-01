// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "test-secret";

function setup() {
  return convexTest(schema, modules);
}

type TestConvex = ReturnType<typeof setup>;

async function createUser(t: TestConvex, externalId: string) {
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", {
      name: externalId,
      handle: externalId,
      externalId,
      hasCompletedSetup: true,
    })
  );
  return { userId, as: t.withIdentity({ subject: externalId }) };
}

async function storeFile(t: TestConvex) {
  return await t.run((ctx) => ctx.storage.store(new Blob(["image"])));
}

async function fileExists(t: TestConvex, storageId: Id<"_storage">) {
  return (await t.run((ctx) => ctx.db.system.get(storageId))) !== null;
}

async function createProduct(t: TestConvex, name = "아메리카노") {
  return await t.run(async (ctx) => {
    const cafeId = await ctx.db.insert("cafes", { name: "카페", slug: "cafe" });
    const productId = await ctx.db.insert("products", {
      cafeId,
      name,
      externalId: "1",
      externalUrl: "https://example.com",
      addedAt: 0,
      updatedAt: 0,
      shortId: "abc",
      isActive: true,
    });
    return { cafeId, productId };
  });
}

beforeEach(() => {
  vi.stubEnv("CONVEX_UPLOAD_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("review image ownership", () => {
  it("rejects attaching a product's image and keeps the file", async () => {
    const t = setup();
    const { productId } = await createProduct(t);
    const productImage = await storeFile(t);
    await t.run((ctx) =>
      ctx.db.patch(productId, { imageStorageId: productImage })
    );
    const attacker = await createUser(t, "attacker");

    await expect(
      attacker.as.mutation(api.reviews.upsertReview, {
        productId,
        rating: 3,
        imageStorageIds: [productImage],
      })
    ).rejects.toThrow("already in use");
    expect(await fileExists(t, productImage)).toBe(true);
  });

  it("rejects attaching another user's photo", async () => {
    const t = setup();
    const { productId } = await createProduct(t);
    const owner = await createUser(t, "owner");
    const attacker = await createUser(t, "attacker");
    const photo = await storeFile(t);
    await owner.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
      imageStorageIds: [photo],
    });

    await expect(
      attacker.as.mutation(api.reviews.upsertReview, {
        productId,
        rating: 3,
        imageStorageIds: [photo],
      })
    ).rejects.toThrow("belongs to another user");
  });

  it("deletes removed photos on edit and all photos on delete", async () => {
    const t = setup();
    const { productId } = await createProduct(t);
    const user = await createUser(t, "user");
    const first = await storeFile(t);
    const second = await storeFile(t);

    const { reviewId } = await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
      imageStorageIds: [first, second],
    });
    await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
      imageStorageIds: [second],
    });
    expect(await fileExists(t, first)).toBe(false);
    expect(await fileExists(t, second)).toBe(true);

    await user.as.mutation(api.reviews.deleteReview, { reviewId });
    expect(await fileExists(t, second)).toBe(false);
  });

  it("discardUploads only deletes unattached uploads", async () => {
    const t = setup();
    const { productId } = await createProduct(t);
    const user = await createUser(t, "user");
    const attached = await storeFile(t);
    const orphan = await storeFile(t);
    await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
      imageStorageIds: [attached],
    });

    await user.as.mutation(api.uploads.discardUploads, {
      storageIds: [attached, orphan],
    });
    expect(await fileExists(t, attached)).toBe(true);
    expect(await fileExists(t, orphan)).toBe(false);
  });
});

describe("review moderation", () => {
  it("keeps a hidden review hidden when it is edited", async () => {
    const t = setup();
    const { productId } = await createProduct(t);
    const user = await createUser(t, "user");
    const { reviewId } = await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
    });
    await t.run((ctx) => ctx.db.patch(reviewId, { isVisible: false }));

    await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 5,
      text: "edited",
    });
    const review = await t.run((ctx) => ctx.db.get(reviewId));
    expect(review?.isVisible).toBe(false);
  });
});

describe("users", () => {
  it("does not expose the Clerk id in public queries", async () => {
    const t = setup();
    await createUser(t, "user_clerk_id");
    const user = await t.query(api.users.getByHandle, {
      handle: "user_clerk_id",
    });
    expect(user).not.toHaveProperty("externalId");
  });

  it("deleteFromClerk also removes the user's reviews and photos", async () => {
    vi.useFakeTimers();
    const t = setup();
    const { productId } = await createProduct(t);
    const user = await createUser(t, "user");
    const photo = await storeFile(t);
    await user.as.mutation(api.reviews.upsertReview, {
      productId,
      rating: 4,
      imageStorageIds: [photo],
    });

    await t.mutation(internal.users.deleteFromClerk, { clerkUserId: "user" });
    // Let the scheduled rating recompute run before the test ends
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    vi.useRealTimers();
    const reviews = await t.run((ctx) => ctx.db.query("reviews").collect());
    expect(reviews).toHaveLength(0);
    expect(await fileExists(t, photo)).toBe(false);
  });

  it("validates the profile name and handle", async () => {
    const t = setup();
    const user = await createUser(t, "user");
    await expect(
      user.as.mutation(internal.users.updateUserProfile, {
        name: "   ",
        handle: "valid",
      })
    ).rejects.toThrow("이름은");
    await user.as.mutation(internal.users.updateUserProfile, {
      name: " 이름 ",
      handle: " handle ",
    });
    const updated = await t.run((ctx) => ctx.db.get(user.userId));
    expect(updated?.handle).toBe("handle");
  });
});

describe("upload secret", () => {
  it("rejects admin calls when no secret is configured", async () => {
    vi.stubEnv("CONVEX_UPLOAD_SECRET", "");
    const t = setup();
    await expect(t.query(api.storage.getStorageStats, {})).rejects.toThrow(
      "Unauthorized"
    );
  });
});

describe("product search", () => {
  const crawled = (name: string, externalId: string) => ({
    name,
    nameEn: "",
    externalId,
    externalUrl: "https://example.com",
    externalCategory: "",
    externalImageUrl: "",
    description: "",
    category: null,
    price: null,
  });

  it("matches substrings and drops removed products", async () => {
    const t = setup();
    await t.run((ctx) =>
      ctx.db.insert("cafes", { name: "카페", slug: "cafe" })
    );

    await t.mutation(api.dataUploader.uploadProductsFromJson, {
      cafeSlug: "cafe",
      uploadSecret: SECRET,
      products: [crawled("바닐라라떼", "1"), crawled("아메리카노", "2")],
    });
    const found = await t.query(api.products.search, { searchTerm: "라떼" });
    expect(found.map((p) => p.name)).toEqual(["바닐라라떼"]);

    await t.mutation(api.dataUploader.uploadProductsFromJson, {
      cafeSlug: "cafe",
      uploadSecret: SECRET,
      products: [crawled("아메리카노", "2")],
    });
    expect(await t.query(api.products.search, { searchTerm: "라떼" })).toEqual(
      []
    );
    const suggestions = await t.query(api.products.getSuggestions, {
      searchTerm: "아메",
    });
    expect(suggestions.map((s) => s.name)).toEqual(["아메리카노"]);
  });

  it("falls back to products until the backfill has run", async () => {
    const t = setup();
    await createProduct(t, "바닐라 라떼");
    const found = await t.query(api.products.search, { searchTerm: "라떼" });
    expect(found.map((p) => p.name)).toEqual(["바닐라 라떼"]);

    await t.mutation(api.productSearch.backfill, {
      paginationOpts: { numItems: 10, cursor: null },
      uploadSecret: SECRET,
    });
    const rows = await t.run((ctx) => ctx.db.query("productSearch").collect());
    expect(rows).toHaveLength(1);
  });
});
