export const SITE_URL = "https://janjum.com";
export const SITE_NAME = "잔점";
export const DEFAULT_OG_IMAGE = "/android-chrome-512x512.png";

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

/** Turn a site-relative path into an absolute URL on janjum.com. */
export const absoluteUrl = (pathOrUrl: string) => {
  if (ABSOLUTE_URL_PATTERN.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
};

/** `<link rel="canonical">` for a page, to pass in a route's `head().links`. */
export const canonicalLink = (path: string) => [
  { rel: "canonical", href: absoluteUrl(path) },
];

export const seo = ({
  title,
  description,
  keywords,
  image,
  path,
  noindex = false,
}: {
  title: string;
  description?: string;
  image?: string;
  keywords?: string;
  /** Canonical path of the page (without query string), used for og:url. */
  path?: string;
  /** Keep the page out of search indexes (search results, private pages). */
  noindex?: boolean;
}) => {
  const imageUrl = image ? absoluteUrl(image) : undefined;

  const tags = [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:creator", content: "@janjum" },
    { name: "twitter:site", content: "@janjum" },
    // Open Graph tags must use `property` (not `name`): KakaoTalk, Facebook
    // and most link-preview crawlers ignore `name="og:*"`.
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "ko_KR" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(path ? [{ property: "og:url", content: absoluteUrl(path) }] : []),
    ...(imageUrl
      ? [
          { name: "twitter:image", content: imageUrl },
          { name: "twitter:card", content: "summary_large_image" },
          { property: "og:image", content: imageUrl },
        ]
      : []),
    ...(noindex ? [{ name: "robots", content: "noindex, follow" }] : []),
  ];

  return tags;
};
