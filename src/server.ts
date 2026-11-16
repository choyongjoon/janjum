import { createClerkHandler } from "@clerk/tanstack-react-start/server";
import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from "@tanstack/react-start/server";
import { createRouter } from "./router";
import { applyPageCachePolicy, pageCachePolicy } from "./server/cachePolicy";

// Runs after Clerk auth and router.load(), right before the page streams, so
// the route's status and redirects are known here.
const streamWithCachePolicy = defineHandlerCallback((ctx) => {
  const { request, router, responseHeaders } = ctx;
  const policy = pageCachePolicy({
    method: request.method,
    pathname: new URL(request.url).pathname,
    cookieHeader: request.headers.get("cookie"),
    statusCode: router.state.statusCode,
    isRedirect: Boolean(router.state.redirect),
    setsCookie: responseHeaders.has("set-cookie"),
  });
  applyPageCachePolicy(policy, responseHeaders);
  return defaultStreamHandler(ctx);
});

export default createClerkHandler(
  createStartHandler({
    createRouter,
  })
)(streamWithCachePolicy);
