/**
 * CDN caching for server-rendered pages.
 *
 * Every SSR request runs Clerk auth and several Convex queries in the
 * function's region, far from most visitors (Korea). Signed-out pages are the
 * same for everyone, so they can be cached at the edge.
 *
 * Menu pages only change when the daily sync uploads new data, so they are
 * cached for a long time and tagged; the sync then invalidates the tag
 * (`scripts/purgeCdnCache.ts`) to refresh every page at once. Reviews, the only
 * data users change, load in the browser and aren't part of the cached HTML.
 * Pages made of user content (a review, a profile) keep a short TTL instead, so
 * an edit or deletion shows up within minutes without a purge.
 *
 * A signed-in request is never cached: its HTML embeds the user's Convex token
 * in the dehydrated router context.
 */

/** Pages behind sign-in, or whose output depends on the visitor. */
const PRIVATE_PATH_PREFIXES = ["/profile", "/settings", "/oauth-callback"];

/** Public pages whose content is written by users. */
const USER_CONTENT_PATH_PREFIXES = ["/review", "/user"];

/** Tag on every long-cached page; the sync invalidates it after an upload. */
export const PAGE_CACHE_TAG = "pages";

// Clerk session cookies may carry an instance suffix, e.g. `__session_AbCd`.
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)__session(?:_[\w-]+)?=/;
const CLIENT_UAT_PATTERN = /(?:^|;\s*)__client_uat(?:_[\w-]+)?=([^;]*)/g;

// Browsers always revalidate, so a signed-in visitor isn't stuck with a
// signed-out copy in their own cache.
const BROWSER_CACHE_CONTROL = "public, max-age=0, must-revalidate";

export const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": BROWSER_CACHE_CONTROL,
  // Vercel's edge keeps it for 30 days; the daily sync invalidates the tag
  // when data changed, and the edge then refreshes in the background. Every
  // deploy also starts with an empty cache.
  "Vercel-CDN-Cache-Control":
    "public, s-maxage=2592000, stale-while-revalidate=86400",
  "Vercel-Cache-Tag": PAGE_CACHE_TAG,
} as const;

export const USER_CONTENT_CACHE_HEADERS = {
  "Cache-Control": BROWSER_CACHE_CONTROL,
  // Served for 5 minutes, then refreshed in the background.
  "Vercel-CDN-Cache-Control":
    "public, s-maxage=300, stale-while-revalidate=86400",
} as const;

export const PRIVATE_CACHE_CONTROL = "private, no-store";

/** True when the request carries a Clerk session (signed in, or was). */
export const hasClerkSession = (cookieHeader: string | null) => {
  if (!cookieHeader) {
    return false;
  }
  if (SESSION_COOKIE_PATTERN.test(cookieHeader)) {
    return true;
  }
  for (const match of cookieHeader.matchAll(CLIENT_UAT_PATTERN)) {
    const value = match[1]?.trim();
    // `__client_uat=0` is what Clerk sets for signed-out browsers.
    if (value && value !== "0") {
      return true;
    }
  }
  return false;
};

const matchesPrefix = (pathname: string, prefixes: string[]) =>
  prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

export const isPrivatePath = (pathname: string) =>
  matchesPrefix(pathname, PRIVATE_PATH_PREFIXES);

export const isUserContentPath = (pathname: string) =>
  matchesPrefix(pathname, USER_CONTENT_PATH_PREFIXES);

export type PageCachePolicy = "public" | "user-content" | "private" | "none";

/**
 * Decide how a server-rendered page may be cached.
 * - "public": cache at the CDN until the next sync purge
 * - "user-content": cache at the CDN for a few minutes
 * - "private": never store anywhere (signed-in or private page)
 * - "none": leave headers alone (errors, redirects, responses setting cookies)
 */
export const pageCachePolicy = ({
  method,
  pathname,
  cookieHeader,
  statusCode,
  isRedirect,
  setsCookie,
}: {
  method: string;
  pathname: string;
  cookieHeader: string | null;
  statusCode: number;
  isRedirect: boolean;
  setsCookie: boolean;
}): PageCachePolicy => {
  if (hasClerkSession(cookieHeader) || isPrivatePath(pathname)) {
    return "private";
  }
  const isCacheable =
    (method === "GET" || method === "HEAD") &&
    statusCode === 200 &&
    !isRedirect &&
    !setsCookie;
  if (!isCacheable) {
    return "none";
  }
  return isUserContentPath(pathname) ? "user-content" : "public";
};

export const applyPageCachePolicy = (
  policy: PageCachePolicy,
  headers: Headers
) => {
  if (policy === "public" || policy === "user-content") {
    const cacheHeaders =
      policy === "public" ? PUBLIC_CACHE_HEADERS : USER_CONTENT_CACHE_HEADERS;
    for (const [name, value] of Object.entries(cacheHeaders)) {
      headers.set(name, value);
    }
  } else if (policy === "private") {
    headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  }
};
