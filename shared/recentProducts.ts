const DAY_MS = 24 * 60 * 60 * 1000;

export const RECENT_PRODUCTS_WINDOW_DAYS = 30;

/**
 * Start of the "new products" window: 30 days before the start of the current
 * UTC day. Rounded to the day so every visitor sends the same query argument
 * for a whole day, which lets Convex serve the cached query result instead of
 * re-reading every recent product per page view.
 */
export function getRecentProductsSince(now = Date.now()): number {
  const startOfDay = Math.floor(now / DAY_MS) * DAY_MS;
  return startOfDay - RECENT_PRODUCTS_WINDOW_DAYS * DAY_MS;
}
