/**
 * Nitro config, picked up by TanStack Start's build (it calls Nitro's
 * `createNitro`, which loads `nitro.config.ts` from the project root).
 *
 * Vercel ignores `vercel.json` routing/headers when the build emits a
 * `.vercel/output` (Build Output API), so response headers for every route,
 * static files included, go into the generated `config.json` from here.
 */

// Two years, without includeSubDomains/preload: clkmail.janjum.com is a
// third-party click-tracking domain whose TLS setup we don't control.
const HSTS = "max-age=63072000";

export default {
  vercel: {
    config: {
      routes: [
        {
          src: "/(.*)",
          headers: { "Strict-Transport-Security": HSTS },
          continue: true,
        },
      ],
    },
  },
};
