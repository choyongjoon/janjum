import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react';

import { AuthRequired } from './AuthRequired';
import { LoadingSpinner } from './LoadingSpinner';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <Unauthenticated>
        <AuthRequired />
      </Unauthenticated>
      <AuthLoading>
        <LoadingSpinner />
      </AuthLoading>
    </>
  );
}
