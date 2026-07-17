import type { PostHog } from "posthog-js";
import { createContext, useContext, useEffect, useState } from "react";

/**
 * Lazily initialized PostHog context.
 *
 * posthog-js (~53KB gzip) is kept out of the initial bundle by importing it
 * dynamically after the browser goes idle. Until initialization completes,
 * `usePostHog()` returns null, so consumers must use optional chaining
 * (`posthog?.capture(...)`) — events fired before init are dropped, which is
 * acceptable for analytics.
 */
const PostHogContext = createContext<PostHog | null>(null);

const IDLE_TIMEOUT_MS = 5000;
const FALLBACK_DELAY_MS = 2000;

// Module-level memoization guards against double init (e.g. React strict
// mode / provider remounts) without relying on posthog-js internals.
let posthogInitPromise: Promise<PostHog | null> | null = null;

function initPostHog(): Promise<PostHog | null> {
  posthogInitPromise ??= (async () => {
    const apiKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
    if (!apiKey) {
      return null;
    }

    const { default: posthog } = await import("posthog-js");

    posthog.init(apiKey, {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      defaults: "2025-05-24",
      capture_exceptions: true,
      debug: import.meta.env.MODE === "development",
    });

    return posthog;
  })();

  return posthogInitPromise;
}

export function LazyPostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = () => {
      initPostHog()
        .then((posthog) => {
          if (!cancelled && posthog) {
            setClient(posthog);
          }
        })
        .catch(() => {
          // Analytics failing to load must never break the app
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(start, {
        timeout: IDLE_TIMEOUT_MS,
      });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    // Safari: no requestIdleCallback
    const timerId = window.setTimeout(start, FALLBACK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, []);

  return (
    <PostHogContext.Provider value={client}>{children}</PostHogContext.Provider>
  );
}

export function usePostHog(): PostHog | null {
  return useContext(PostHogContext);
}
