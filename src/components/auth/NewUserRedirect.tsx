import { convexQuery, useConvexAuth } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';
import { api } from '../../../convex/_generated/api';

interface NewUserRedirectProps {
  children: React.ReactNode;
}

export function NewUserRedirect({ children }: NewUserRedirectProps) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  // Get current user data from Convex
  const { data: currentUser, isLoading: userLoading } = useQuery({
    ...convexQuery(api.users.current, {}),
    enabled: isAuthenticated && !isLoading,
  });

  // Redirect new users to settings page
  useEffect(() => {
    if (
      !userLoading &&
      currentUser &&
      currentUser.hasCompletedSetup === false &&
      router.state.location.pathname !== '/settings'
    ) {
      router.navigate({ to: '/settings' });
    }
  }, [userLoading, currentUser, router]);

  return <>{children}</>;
}
