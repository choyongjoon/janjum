/**
 * Mega lists the hot and iced version of a drink as two separate menu items
 * under an identical name, distinguished only by a "HOT"/"ICE" badge on the
 * card. The old `mega_${name}` scheme therefore produced one id for two real
 * products, so on upload the two rows overwrote each other and whichever came
 * last in the crawl file decided the stored nutrition.
 *
 * Folding the badge into the id keeps them apart. Only HOT and ICE are used --
 * any other ribbon the site might add ("NEW", "BEST") must not reach the id, or
 * a product's identity would churn every time marketing changed a label.
 */
export function buildMegaExternalId(
  name: string,
  temperature: string | null
): string {
  const badge = temperature?.trim().toUpperCase();
  if (badge === "HOT" || badge === "ICE") {
    return `mega_${badge}_${name}`;
  }
  return `mega_${name}`;
}
