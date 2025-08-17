import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';

/**
 * Custom hook for tracking key user events in PostHog
 * Provides pre-defined event tracking functions for common user actions
 */
export function usePostHogEvents() {
  const posthog = usePostHog();

  // SSO Connection Events
  const trackSSOConnect = useCallback(
    (provider: string, success: boolean) => {
      posthog?.capture('sso_connection_attempt', {
        provider,
        success,
        source: 'settings_page',
      });
    },
    [posthog]
  );

  const trackSSODisconnect = useCallback(
    (provider: string, success: boolean) => {
      posthog?.capture('sso_disconnection_attempt', {
        provider,
        success,
        source: 'settings_page',
      });
    },
    [posthog]
  );

  // Auth Events
  const trackSignUp = useCallback(
    (method: string) => {
      posthog?.capture('user_signed_up', {
        method,
        timestamp: new Date().toISOString(),
      });
    },
    [posthog]
  );

  const trackSignIn = useCallback(
    (method: string) => {
      posthog?.capture('user_signed_in', {
        method,
        timestamp: new Date().toISOString(),
      });
    },
    [posthog]
  );

  // Profile Events
  const trackProfileUpdate = useCallback(
    (fields: string[]) => {
      posthog?.capture('profile_updated', {
        fields_changed: fields,
        source: 'settings_page',
      });
    },
    [posthog]
  );

  const trackImageUpload = useCallback(
    (success: boolean, errorType?: string) => {
      posthog?.capture('profile_image_upload', {
        success,
        error_type: errorType,
        source: 'settings_page',
      });
    },
    [posthog]
  );

  // Content Interaction Events
  const trackReviewSubmit = useCallback(
    (productId: string, rating: number) => {
      posthog?.capture('review_submitted', {
        product_id: productId,
        rating,
      });
    },
    [posthog]
  );

  const trackSearch = useCallback(
    (query: string, results_count?: number) => {
      posthog?.capture('search_performed', {
        query,
        results_count,
      });
    },
    [posthog]
  );

  // Settings Events
  const trackAccountDeletion = useCallback(
    (step: 'initiated' | 'confirmed' | 'cancelled') => {
      posthog?.capture('account_deletion_flow', {
        step,
        timestamp: new Date().toISOString(),
      });
    },
    [posthog]
  );

  return {
    // SSO Events
    trackSSOConnect,
    trackSSODisconnect,

    // Auth Events
    trackSignUp,
    trackSignIn,

    // Profile Events
    trackProfileUpdate,
    trackImageUpload,

    // Content Events
    trackReviewSubmit,
    trackSearch,

    // Settings Events
    trackAccountDeletion,

    // Direct access to posthog for custom events
    posthog,
  };
}
