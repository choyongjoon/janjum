import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type SitemapProduct = FunctionReturnType<
  typeof api.products.listForSitemap
>["page"][number];

const duplicateKey = (product: SitemapProduct) =>
  `${product.cafeId}:${product.nameKey}`;

/**
 * Product pages worth listing: every active product, plus soft-removed ones
 * that are not the same drink as an active product of the same cafe. Those
 * duplicates point their canonical at the active page, and listing them made
 * Search Console report "Duplicate, Google chose different canonical".
 */
export const indexableProducts = (products: SitemapProduct[]) => {
  const activeKeys = new Set(
    products
      // isActive is missing until the Convex function that adds it deploys;
      // treat those rows as active, as before.
      .filter((product) => product.isActive !== false)
      .map(duplicateKey)
  );
  return products.filter(
    (product) =>
      product.isActive !== false || !activeKeys.has(duplicateKey(product))
  );
};
