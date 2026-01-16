import { useSignIn } from '@clerk/tanstack-react-start';
import { useEffect, useState } from 'react';
import {
  type SocialProviderConfig,
  socialProviders,
} from '~/config/socialProviders';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';

interface SignInModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const { signIn, isLoaded } = useSignIn();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const { trackSignIn } = usePostHogEvents();

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        trackSignIn('cancelled');
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, trackSignIn]);

  const handleOAuthSignIn = async (provider: SocialProviderConfig) => {
    if (!(isLoaded && signIn)) {
      return;
    }

    // Convert provider strategy to human-readable name for tracking
    const providerName = provider.name;

    setIsLoading(provider.key);
    try {
      // Track sign-in attempt
      trackSignIn(providerName);

      await signIn.authenticateWithRedirect({
        strategy: provider.clerkStrategy,
        redirectUrl: '/oauth-callback',
        redirectUrlComplete: window.location.pathname,
      });
    } catch (_error) {
      // Error is logged by Clerk, so we just reset loading state
      setIsLoading(null);
    }
  };

  return (
    <div className={`modal ${isOpen ? 'modal-open' : ''}`}>
      <div className="modal-box max-w-md">
        {isLoaded ? (
          <>
            <div className="mb-8 text-center">
              <h1 className="mb-2 font-bold font-sunflower text-2xl text-primary">
                잔점
              </h1>
              <p className="text-base-content/70">
                로그인하여 후기를 남겨보세요.
              </p>
            </div>

            <div className="space-y-4">
              {socialProviders.map((provider) => {
                const isProviderLoading = isLoading === provider.key;

                return (
                  <button
                    className={`flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${provider.bgColor} ${provider.textColor} ${provider.borderColor}`}
                    disabled={isLoading !== null}
                    key={provider.key}
                    onClick={() => handleOAuthSignIn(provider)}
                    type="button"
                  >
                    {isProviderLoading ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      provider.icon
                    )}
                    <span>{provider.name}로 시작하기</span>
                  </button>
                );
              })}
            </div>

            {onClose && (
              <div className="modal-action">
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    // Track that user cancelled sign-in
                    trackSignIn('cancelled');
                    onClose();
                  }}
                  type="button"
                >
                  취소
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center p-8">
            <span className="loading loading-spinner loading-lg" />
          </div>
        )}
      </div>
      {onClose && (
        <form className="modal-backdrop" method="dialog">
          <button onClick={onClose} type="submit">
            close
          </button>
        </form>
      )}
    </div>
  );
}
