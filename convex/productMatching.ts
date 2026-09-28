/**
 * Pure helpers for matching products across crawls when a cafe's website
 * changes its `externalId` scheme (e.g. a CMS rebuild). When the external id
 * is no longer stable, the same menu item can only be recognised by its name,
 * so we normalise names into a comparable key.
 *
 * The key folds away the two things that vary between id schemes for the same
 * drink: the hot/iced marker (written as "HOT "/"ICE " on the old Compose site
 * but "H-"/"I-" on the rebuilt one) and whitespace/hyphens. The temperature is
 * kept in the key so a hot and an iced variant never collapse together.
 */
// Matches only the two real schemes: the old "HOT "/"ICE " word form (word +
// space/hyphen) and the new "H-"/"I-" single-letter form (letter + hyphen). A
// bare single letter + space (e.g. "H 하우스") is intentionally NOT treated as a
// temperature marker, so unrelated names aren't folded together.
const TEMPERATURE_PREFIX = /^(hot|ice)[\s-]+|^(h|i)-+/;
const SEPARATORS = /[\s-]/g;

export function normalizeProductName(name: string): string {
  const lowered = name.trim().toLowerCase();
  const prefixMatch = lowered.match(TEMPERATURE_PREFIX);

  let temperature = "";
  let rest = lowered;
  if (prefixMatch) {
    const token = prefixMatch[1] ?? prefixMatch[2];
    temperature = token === "h" || token === "hot" ? "hot" : "ice";
    rest = lowered.slice(prefixMatch[0].length);
  }

  const base = rest.replace(SEPARATORS, "");
  return temperature ? `${temperature}:${base}` : base;
}

/**
 * Soft-removed products of one cafe grouped by normalised name, so an upload
 * can look up revival candidates without re-scanning the cafe for every
 * product. Re-scanning read every removed product once per new item, which
 * blew Convex's 16 MiB per-transaction read limit when a crawl added many new
 * products at once (e.g. ediya's bakery menu).
 */
export type RevivalIndex<TId extends string> = Map<string, TId[]>;

export function buildRevivalIndex<TId extends string>(
  removedProducts: Iterable<{ _id: TId; name: string }>
): RevivalIndex<TId> {
  const index: RevivalIndex<TId> = new Map();
  for (const { _id, name } of removedProducts) {
    const key = normalizeProductName(name);
    const ids = index.get(key);
    if (ids) {
      ids.push(_id);
    } else {
      index.set(key, [_id]);
    }
  }
  return index;
}

/** The single removed product matching `name`, or null if none or ambiguous. */
export function findRevivalCandidate<TId extends string>(
  index: RevivalIndex<TId>,
  name: string
): TId | null {
  const ids = index.get(normalizeProductName(name));
  return ids?.length === 1 ? ids[0] : null;
}

/** Drop a product that is active again, so it is not revived a second time. */
export function removeFromRevivalIndex<TId extends string>(
  index: RevivalIndex<TId>,
  id: TId
): void {
  for (const [key, ids] of index) {
    const position = ids.indexOf(id);
    if (position !== -1) {
      ids.splice(position, 1);
      if (ids.length === 0) {
        index.delete(key);
      }
      return;
    }
  }
}
