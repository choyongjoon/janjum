import { jsonLdScript } from "~/utils/structuredData";

/**
 * Renders schema.org JSON-LD in the page body.
 *
 * Not passed through a route's `head().scripts`: TanStack Router's <Script>
 * renders an inline script on the server and then appends a second copy in an
 * effect after hydration, so Google (which runs JS) saw every entity twice
 * ("brand field is duplicated").
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const { type, children } = jsonLdScript(data);
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD built from our own data; `<` is escaped by jsonLdScript
      dangerouslySetInnerHTML={{ __html: children }}
      type={type}
    />
  );
}
