import { AuthenticateWithRedirectCallback } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { seo } from "~/utils/seo";

function OAuthCallback() {
  return <AuthenticateWithRedirectCallback />;
}

export const Route = createFileRoute("/oauth-callback")({
  head: () => ({
    meta: seo({ title: "로그인 | 잔점", noindex: true }),
  }),
  component: OAuthCallback,
});
