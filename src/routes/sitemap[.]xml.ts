import { createServerFileRoute } from "@tanstack/react-start/server";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import {
  CRAWLER_CACHE_CONTROL,
  createServerConvexClient,
} from "../server/convexClient";
import { getBlogPosts } from "../utils/blogData";
import { absoluteUrl } from "../utils/seo";

const PRODUCT_PAGE_SIZE = 1000;

interface SitemapEntry {
  lastmod?: number | string;
  path: string;
}

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const toIsoDate = (value: number | string) =>
  new Date(value).toISOString().slice(0, 10);

const renderEntry = ({ path, lastmod }: SitemapEntry) => {
  const lastmodTag =
    lastmod === undefined ? "" : `<lastmod>${toIsoDate(lastmod)}</lastmod>`;
  return `<url><loc>${escapeXml(absoluteUrl(path))}</loc>${lastmodTag}</url>`;
};

async function collectProductEntries(
  client: ReturnType<typeof createServerConvexClient>
) {
  const entries: SitemapEntry[] = [];
  let cursor: string | null = null;
  let isDone = false;
  while (!isDone) {
    // Pages depend on the previous cursor, so they must be fetched in order.
    const result: FunctionReturnType<typeof api.products.listForSitemap> =
      await client.query(api.products.listForSitemap, {
        paginationOpts: { numItems: PRODUCT_PAGE_SIZE, cursor },
      });
    for (const product of result.page) {
      entries.push({
        path: `/product/${product.shortId}`,
        lastmod: product.updatedAt,
      });
    }
    cursor = result.continueCursor;
    isDone = result.isDone;
  }
  return entries;
}

export const ServerRoute = createServerFileRoute("/sitemap.xml").methods({
  GET: async () => {
    const client = createServerConvexClient();
    const [cafes, productEntries] = await Promise.all([
      client.query(api.cafes.list, {}),
      collectProductEntries(client),
    ]);

    const entries: SitemapEntry[] = [
      { path: "/" },
      { path: "/new" },
      { path: "/blog" },
      ...getBlogPosts().map((post) => ({
        path: `/blog/${post.id}`,
        lastmod: post.publishedAt,
      })),
      ...cafes.map((cafe) => ({ path: `/cafe/${cafe.slug}` })),
      ...productEntries,
    ];

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...entries.map(renderEntry),
      "</urlset>",
    ].join("\n");

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": CRAWLER_CACHE_CONTROL,
      },
    });
  },
});
