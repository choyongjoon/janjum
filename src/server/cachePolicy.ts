/**
 * CDN caching for server-rendered pages.
 *
 * Every SSR request runs Clerk auth and several Convex queries in the
 * function's region, far from most visitors (Korea). Signed-out pages are the
 * same for everyone, so they can be cached at the edge; the client keeps data
 * live through its Convex subscription after hydration, so a cached page is
 * only stale for its first paint.
 *
 * A signed-in request is never cached: its HTML embeds the user's Convex token
 * in the dehydrated router context.
 */

/** Pages behind sign-in, or whose output depends on the visitor. */
const PRIVATE_PATH_PREFIXES = ["/profile", "/settings", "/oauth-callback"];

// Clerk session cookies may carry an instance suffix, e.g. `__session_AbCd`.
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)__session(?:_[\w-]+)?=/;
const CLIENT_UAT_PATTERN = /(?:^|;\s*)__client_uat(?:_[\w-]+)?=([^;]*)/g;

export const PUBLIC_CACHE_HEADERS = {
  // Browsers always revalidate, so a signed-in visitor isn't stuck with a
  // signed-out copy in their own cache.
  "Cache-Control": "public, max-age=0, must-revalidate",
  // Vercel's edge serves it for 5 minutes, then refreshes in the background.
  // Every deploy starts with an empty cache.
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

export const isPrivatePath = (pathname: string) =>
  PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

export type PageCachePolicy = "public" | "private" | "none";

/**
 * Decide how a server-rendered page may be cached.
 * - "public": cache at the CDN
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
  return isCacheable ? "public" : "none";
};

export const applyPageCachePolicy = (
  policy: PageCachePolicy,
  headers: Headers
) => {
  if (policy === "public") {
    for (const [name, value] of Object.entries(PUBLIC_CACHE_HEADERS)) {
      headers.set(name, value);
    }
  } else if (policy === "private") {
    headers.set("Cache-Control", PRIVATE_CACHE_CONTROL);
  }
};
