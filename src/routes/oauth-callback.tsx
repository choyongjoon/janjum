import { AuthenticateWithRedirectCallback } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';

function OAuthCallback() {
  return <AuthenticateWithRedirectCallback />;
}

export const Route = createFileRoute('/oauth-callback')({
  component: OAuthCallback,
});
