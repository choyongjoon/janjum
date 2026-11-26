import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import {
  resolveProductVariant,
  type VariantCandidate,
} from "../../convex/productVariants";

export type SitemapProduct = FunctionReturnType<
  typeof api.products.listForSitemap
>["page"][number];

const duplicateKey = (product: SitemapProduct) =>
  `${product.cafeId}:${product.nameKey}`;

const toCandidate = (product: SitemapProduct): VariantCandidate => ({
  shortId: product.shortId,
  isActive: product.isActive !== false,
  addedAt: product.addedAt,
  temperature: product.temperature,
  sizeLabel: product.sizeLabel,
});

// Before the Convex function that returns addedAt and the variant traits
// deploys: every active product, plus soft-removed ones with no active twin.
const legacyIndexableProducts = (products: SitemapProduct[]) => {
  const activeKeys = new Set(
    products.filter((product) => product.isActive !== false).map(duplicateKey)
  );
  return products.filter(
    (product) =>
      product.isActive !== false || !activeKeys.has(duplicateKey(product))
  );
};

/**
 * Product pages worth listing: those that are their own canonical (see
 * resolveProductVariant). Duplicates point their canonical elsewhere, and
 * listing them made Search Console report "Duplicate, Google chose different
 * canonical".
 */
export const indexableProducts = (products: SitemapProduct[]) => {
  if (products.some((product) => typeof product.addedAt !== "number")) {
    return legacyIndexableProducts(products);
  }
  const groups = new Map<string, VariantCandidate[]>();
  for (const product of products) {
    const key = duplicateKey(product);
    const group = groups.get(key);
    if (group) {
      group.push(toCandidate(product));
    } else {
      groups.set(key, [toCandidate(product)]);
    }
  }
  return products.filter((product) => {
    const group = groups.get(duplicateKey(product)) ?? [];
    if (group.length < 2) {
      return true;
    }
    const { canonicalShortId } = resolveProductVariant(
      toCandidate(product),
      group
    );
    return canonicalShortId === product.shortId;
  });
};
