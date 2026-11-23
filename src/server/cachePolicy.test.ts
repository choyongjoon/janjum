import { describe, expect, it } from "vitest";
import {
  applyPageCachePolicy,
  CROSS_CAFE_CACHE_TAG,
  cafeCacheTag,
  hasClerkSession,
  PAGE_CACHE_TAG,
  PRIVATE_CACHE_CONTROL,
  pageCachePolicy,
  pageCacheTags,
} from "./cachePolicy";

const anonymousPage = {
  method: "GET",
  pathname: "/cafe/starbucks",
  cookieHeader: null,
  statusCode: 200,
  isRedirect: false,
  setsCookie: false,
};

describe("hasClerkSession", () => {
  it("detects session cookies, including suffixed ones", () => {
    expect(hasClerkSession("__session=abc")).toBe(true);
    expect(hasClerkSession("a=1; __session_Xy12=abc")).toBe(true);
    expect(hasClerkSession("__client_uat=1731700000")).toBe(true);
    expect(hasClerkSession("__client_uat_Xy12=1731700000")).toBe(true);
  });

  it("treats signed-out browsers as anonymous", () => {
    expect(hasClerkSession(null)).toBe(false);
    expect(hasClerkSession("")).toBe(false);
    expect(hasClerkSession("__client_uat=0; ph_id=1")).toBe(false);
    expect(hasClerkSession("my__session=1")).toBe(false);
  });
});

describe("pageCachePolicy", () => {
  it("caches signed-out public pages", () => {
    expect(pageCachePolicy(anonymousPage)).toBe("public");
  });

  it("never caches signed-in requests", () => {
    expect(
      pageCachePolicy({ ...anonymousPage, cookieHeader: "__session=jwt" })
    ).toBe("private");
  });

  it("never caches private pages", () => {
    expect(pageCachePolicy({ ...anonymousPage, pathname: "/settings" })).toBe(
      "private"
    );
    expect(pageCachePolicy({ ...anonymousPage, pathname: "/profile" })).toBe(
      "private"
    );
    expect(
      pageCachePolicy({ ...anonymousPage, pathname: "/profiles-guide" })
    ).toBe("public");
  });

  it("keeps a short cache for pages made of user content", () => {
    expect(pageCachePolicy({ ...anonymousPage, pathname: "/review/abc" })).toBe(
      "user-content"
    );
    expect(pageCachePolicy({ ...anonymousPage, pathname: "/user/jane" })).toBe(
      "user-content"
    );
    expect(
      pageCachePolicy({ ...anonymousPage, pathname: "/product/abc" })
    ).toBe("public");
  });

  it("leaves errors, redirects and cookie-setting responses alone", () => {
    expect(pageCachePolicy({ ...anonymousPage, statusCode: 404 })).toBe("none");
    expect(pageCachePolicy({ ...anonymousPage, isRedirect: true })).toBe(
      "none"
    );
    expect(pageCachePolicy({ ...anonymousPage, setsCookie: true })).toBe(
      "none"
    );
    expect(pageCachePolicy({ ...anonymousPage, method: "POST" })).toBe("none");
  });
});

describe("pageCacheTags", () => {
  it("tags cafe and product pages with their cafe", () => {
    expect(pageCacheTags("/cafe/starbucks", "starbucks")).toEqual([
      PAGE_CACHE_TAG,
      cafeCacheTag("starbucks"),
    ]);
    expect(pageCacheTags("/product/abc123", "mega")).toEqual([
      PAGE_CACHE_TAG,
      "cafe-mega",
    ]);
  });

  it("tags pages that mix cafes as cross-cafe", () => {
    for (const pathname of ["/", "/new", "/search", "/blog/hello"]) {
      expect(pageCacheTags(pathname, undefined)).toEqual([
        PAGE_CACHE_TAG,
        CROSS_CAFE_CACHE_TAG,
      ]);
    }
    // A cafe in loader data doesn't make another page single-cafe.
    expect(pageCacheTags("/new", "mega")).toContain(CROSS_CAFE_CACHE_TAG);
  });

  it("falls back to cross-cafe when a product page's cafe is unknown", () => {
    expect(pageCacheTags("/product/abc123", undefined)).toEqual([
      PAGE_CACHE_TAG,
      CROSS_CAFE_CACHE_TAG,
    ]);
  });
});

describe("applyPageCachePolicy", () => {
  it("caches public pages for long and tags them for the sync purge", () => {
    const headers = new Headers();
    applyPageCachePolicy("public", headers, ["pages", "cafe-starbucks"]);
    expect(headers.get("Cache-Control")).toBe(
      "public, max-age=0, must-revalidate"
    );
    expect(headers.get("Vercel-CDN-Cache-Control")).toContain(
      "s-maxage=2592000"
    );
    expect(headers.get("Vercel-Cache-Tag")).toBe("pages,cafe-starbucks");
  });

  it("caches user content briefly and leaves it untagged", () => {
    const headers = new Headers();
    applyPageCachePolicy("user-content", headers, ["pages"]);
    expect(headers.get("Vercel-CDN-Cache-Control")).toContain("s-maxage=300");
    expect(headers.get("Vercel-Cache-Tag")).toBeNull();
  });

  it("marks private responses no-store and leaves 'none' untouched", () => {
    const privateHeaders = new Headers();
    applyPageCachePolicy("private", privateHeaders);
    expect(privateHeaders.get("Cache-Control")).toBe(PRIVATE_CACHE_CONTROL);

    const untouched = new Headers();
    applyPageCachePolicy("none", untouched);
    expect([...untouched.keys()]).toEqual([]);
  });
});
