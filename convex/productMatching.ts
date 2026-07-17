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
