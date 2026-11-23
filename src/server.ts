import { createClerkHandler } from "@clerk/tanstack-react-start/server";
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from "@tanstack/react-start/server";
import { createRouter } from "./router";
import {
  applyPageCachePolicy,
  pageCachePolicy,
  pageCacheTags,
} from "./server/cachePolicy";

/** The cafe a page's loader returned (the cafe and product routes do). */
const loadedCafeSlug = (matches: { loaderData?: unknown }[]) => {
  for (const match of matches) {
    const data = match.loaderData as
      | { cafe?: { slug?: unknown } | null }
      | undefined;
    const slug = data?.cafe?.slug;
    if (typeof slug === "string") {
      return slug;
    }
  }
};

// Runs after Clerk auth and router.load(), right before the page streams, so
// the route's status and redirects are known here.
const streamWithCachePolicy = defineHandlerCallback((ctx) => {
  const { request, router, responseHeaders } = ctx;
  const { pathname } = new URL(request.url);
  const policy = pageCachePolicy({
    method: request.method,
    pathname,
    cookieHeader: request.headers.get("cookie"),
    statusCode: router.state.statusCode,
    isRedirect: Boolean(router.state.redirect),
    setsCookie: responseHeaders.has("set-cookie"),
  });
  applyPageCachePolicy(
    policy,
    responseHeaders,
    pageCacheTags(pathname, loadedCafeSlug(router.state.matches))
  );
  return defaultStreamHandler(ctx);
});

export default createClerkHandler(
  createStartHandler({
    createRouter,
  })
)(streamWithCachePolicy);
