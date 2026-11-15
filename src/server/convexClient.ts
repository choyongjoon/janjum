import { ConvexHttpClient } from "convex/browser";

/** Convex client for server routes (sitemap.xml, llms.txt). */
export const createServerConvexClient = () => {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("missing VITE_CONVEX_URL envar");
  }
  return new ConvexHttpClient(convexUrl);
};

/** Let the CDN serve crawler files for a day and refresh in the background. */
export const CRAWLER_CACHE_CONTROL =
  "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400";
