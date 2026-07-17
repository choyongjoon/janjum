import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Fetch review stats for a whole product list with a single Convex query,
 * instead of one query (and one reactive subscription) per ProductCard.
 * Returns a record keyed by productId, or undefined while loading.
 */
export function useProductReviewStats(productIds: Id<"products">[]) {
  const { data } = useQuery({
    ...convexQuery(api.reviews.getProductStatsBatch, { productIds }),
    enabled: productIds.length > 0,
  });

  return data;
}
