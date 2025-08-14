/// <reference types="vite/client" />

import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start';
import { getAuth } from '@clerk/tanstack-react-start/server';
import type { ConvexQueryClient } from '@convex-dev/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  useRouteContext,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { createServerFn, Scripts } from '@tanstack/react-start';
import { getWebRequest } from '@tanstack/react-start/server';
import type { ConvexReactClient } from 'convex/react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { PostHogProvider } from 'posthog-js/react';
import type * as React from 'react';
import { NewUserRedirect } from '~/components/auth/NewUserRedirect';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary.js';
import { Footer } from '~/components/Footer';
import { NavBar } from '~/components/NavBar';
import { NotFound } from '~/components/NotFound.js';
import appCss from '~/styles/app.css?url';
import { seo } from '~/utils/seo';

const fetchClerkAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = await getAuth(getWebRequest());
  const token = await auth.getToken({ template: 'convex' });

  return {
    userId: auth.userId,
    token,
  };
});

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
  convexClient: ConvexReactClient;
  convexQueryClient: ConvexQueryClient;
}>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      ...seo({
        title: '잔점 | 카페 음료 모든 것을 한곳에!',
        description: '카페 음료 모든 것을 한곳에!',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon-16x16.png',
      },
      { rel: 'manifest', href: '/site.webmanifest', color: '#fffff' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  beforeLoad: async (ctx) => {
    const auth = await fetchClerkAuth();
    const { userId, token } = auth;

    // During SSR only (the only time serverHttpClient exists),
    // set the Clerk auth token to make HTTP queries with.
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
    }

    return {
      userId,
      token,
    };
  },
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
});

function RootComponent() {
  const context = useRouteContext({ from: Route.id });
  return (
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
        defaults: '2025-05-24',
        capture_exceptions: true,
        debug: import.meta.env.MODE === 'development',
      }}
    >
      <ClerkProvider>
        <ConvexProviderWithClerk
          client={context.convexClient}
          useAuth={useAuth}
        >
          <RootDocument>
            <Outlet />
          </RootDocument>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </PostHogProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex-1">
          <NewUserRedirect>{children}</NewUserRedirect>
        </main>
        <Footer />
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
