/**
 * Pure helpers for products of one cafe that share a name.
 *
 * Some cafes list a drink's variants as separate products with the same name:
 * Mega Coffee has a HOT and an ICE "아메리카노" (the temperature is only in the
 * externalId), Starbucks and Tom N Toms list sizes separately. Their pages had
 * the same title and nearly the same text, so Google treated one as a
 * duplicate of the other and ignored our self-canonical. Crawls also leave
 * several soft-removed copies of a drink behind when a cafe changes its menu
 * ids, and those pages are duplicates of each other.
 *
 * `resolveProductVariant` decides, for one product of such a group, the label
 * that tells it apart from its siblings and the page search engines should
 * index for it. The product page and the sitemap both use it, so the sitemap
 * lists exactly the pages that are their own canonical.
 */

export type Temperature = "HOT" | "ICE";

export interface VariantTraits {
  sizeLabel?: string;
  temperature?: Temperature;
}

export interface VariantCandidate extends VariantTraits {
  addedAt: number;
  isActive: boolean;
  shortId: string;
}

export interface ResolvedVariant {
  canonicalIsActive: boolean;
  canonicalShortId: string;
  /** Tells this product apart from same-name siblings, e.g. "ICE", "887ml". */
  variantLabel?: string;
}

// "mega_HOT_아메리카노", "mega_ICE_아메리카노"
const TEMPERATURE_IN_EXTERNAL_ID = /(?:^|[_-])(hot|ice)(?:[_-]|$)/i;

export function variantTraits(product: {
  externalId: string;
  nutritions?: { servingSize?: number; servingSizeUnit?: string };
}): VariantTraits {
  const match = product.externalId.match(TEMPERATURE_IN_EXTERNAL_ID);
  const temperature = match
    ? (match[1].toUpperCase() as Temperature)
    : undefined;
  const servingSize = product.nutritions?.servingSize;
  const sizeLabel =
    typeof servingSize === "number" && servingSize > 0
      ? `${servingSize}${product.nutritions?.servingSizeUnit ?? ""}`
      : undefined;
  return { temperature, sizeLabel };
}

type Dimension = "temperature" | "sizeLabel";

/** The trait the group's products differ in, temperature first. */
function distinguishingDimension(
  group: VariantTraits[]
): Dimension | undefined {
  for (const dimension of ["temperature", "sizeLabel"] as const) {
    const values = new Set(
      group.flatMap((product) => {
        const value = product[dimension];
        return value ? [value] : [];
      })
    );
    if (values.size > 1) {
      return dimension;
    }
  }
  return;
}

/** The oldest product: the page that has existed (and been indexed) longest. */
const oldest = <T extends VariantCandidate>(products: T[]): T =>
  products.reduce((best, product) => {
    if (product.addedAt !== best.addedAt) {
      return product.addedAt < best.addedAt ? product : best;
    }
    return product.shortId < best.shortId ? product : best;
  });

/**
 * @param product one product of the group
 * @param group every product of the same cafe with the same normalized name,
 *   `product` included
 */
export function resolveProductVariant(
  product: VariantCandidate,
  group: VariantCandidate[]
): ResolvedVariant {
  const members = group.some((member) => member.shortId === product.shortId)
    ? group
    : [...group, product];
  const dimension = distinguishingDimension(members);
  const variantOf = (member: VariantCandidate) =>
    dimension ? (member[dimension] ?? "") : "";
  const variant = variantOf(product);
  const variantLabel = variant || undefined;

  const sameVariant = members.filter((member) => variantOf(member) === variant);
  const activeSameVariant = sameVariant.filter((member) => member.isActive);
  if (activeSameVariant.length > 0) {
    // Identical active products (same name and variant) share one page.
    return {
      canonicalShortId: oldest(activeSameVariant).shortId,
      canonicalIsActive: true,
      variantLabel,
    };
  }

  // A discontinued product points at the drink that is sold now: the same
  // variant if there is one (handled above), otherwise any active sibling.
  const active = members.filter((member) => member.isActive);
  if (active.length > 0) {
    return {
      canonicalShortId: oldest(active).shortId,
      canonicalIsActive: true,
      variantLabel,
    };
  }

  // Only discontinued copies left: they are duplicates of each other.
  return {
    canonicalShortId: oldest(sameVariant).shortId,
    canonicalIsActive: false,
    variantLabel,
  };
}
