import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { usePostHog } from 'posthog-js/react';
import { useEffect, useRef } from 'react';
import { api } from '../../convex/_generated/api';
import { usePostHogEvents } from './usePostHogEvents';

/**
 * Custom hook to identify users in PostHog using Clerk authentication data and Convex user data
 * Follows PostHog best practices for user identification
 */
export function usePostHogIdentify() {
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));
  const posthog = usePostHog();
  const { trackSignUp } = usePostHogEvents();
  const previousUserRef = useRef<string | null>(null);

  useEffect(() => {
    // Only proceed if PostHog is available and user data is loaded
    if (!posthog) {
      return;
    }

    // If user is authenticated, identify them in PostHog
    if (currentUser) {
      // Use Clerk user ID as the distinct_id for PostHog
      const distinctId = currentUser?._id;

      // Check if this is a new user (first time identifying)
      const isNewUser = previousUserRef.current !== distinctId;

      // Prepare user properties for PostHog using Convex data
      const userProperties: Record<string, unknown> = {
        // Convex user data
        userId: currentUser?._id,
        handle: currentUser?.handle,
        name: currentUser?.name,
        hasCompletedSetup: currentUser?.hasCompletedSetup,
        hasImage: !!currentUser?.imageUrl,
        externalId: currentUser?.externalId,
        _creationTime: currentUser?._creationTime,
      };

      // Remove undefined values to keep PostHog data clean
      const cleanProperties = Object.fromEntries(
        Object.entries(userProperties).filter(
          ([_, value]) => value !== undefined
        )
      );

      // Identify the user in PostHog
      posthog.identify(distinctId, cleanProperties);

      // Track sign-up for new users who haven't completed setup
      if (isNewUser && currentUser.hasCompletedSetup === false) {
        trackSignUp('oauth');
      }

      // Update the ref to track the current user
      previousUserRef.current = distinctId;
    } else {
      // User is not authenticated, reset PostHog user
      posthog.reset();
    }
  }, [posthog, currentUser, trackSignUp]);
}
