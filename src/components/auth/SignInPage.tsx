import { useSignIn } from '@clerk/tanstack-react-start';
import { useState } from 'react';

interface SignInPageProps {
  onClose?: () => void;
}

type Provider = 'oauth_google' | 'oauth_custom_kakao' | 'oauth_custom_naver';

export function SignInPage({ onClose }: SignInPageProps) {
  const { signIn, isLoaded } = useSignIn();
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: Provider) => {
    if (!(isLoaded && signIn)) {
      return;
    }

    setIsLoading(provider);
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: `${window.location.origin}/oauth-callback`,
        redirectUrlComplete: `${window.location.origin}/`,
      });
    } catch (_error) {
      // Error is logged by Clerk, so we just reset loading state
      setIsLoading(null);
    }
  };

  const getProviderInfo = (provider: Provider) => {
    switch (provider) {
      case 'oauth_google':
        return {
          name: 'Google',
          icon: (
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <title>Google</title>
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          ),
          bgColor: 'bg-white hover:bg-gray-50',
          textColor: 'text-gray-900',
          borderColor: 'border-gray-300',
        };
      case 'oauth_custom_kakao':
        return {
          name: '카카오',
          icon: (
            <svg className="h-5 w-5" fill="#3C1E1E" viewBox="0 0 24 24">
              <title>Kakao</title>
              <path d="M12 3C7.03 3 3 6.44 3 10.61c0 2.61 1.67 4.93 4.19 6.29l-.99 3.66c-.09.33.19.59.49.43l4.36-2.75c.32.02.64.03.96.03 4.97 0 8.99-3.44 8.99-7.66C21 6.44 16.97 3 12 3z" />
            </svg>
          ),
          bgColor: 'bg-[#FEE500] hover:bg-[#FFEB3B]',
          textColor: 'text-[#3C1E1E]',
          borderColor: 'border-[#FEE500]',
        };
      case 'oauth_custom_naver':
        return {
          name: '네이버',
          icon: (
            <svg className="h-5 w-5" fill="white" viewBox="0 0 24 24">
              <title>Naver</title>
              <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
            </svg>
          ),
          bgColor: 'bg-[#03C75A] hover:bg-[#02B351]',
          textColor: 'text-white',
          borderColor: 'border-[#03C75A]',
        };
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-md rounded-lg bg-base-100 p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-bold font-sunflower text-2xl text-primary">
            잔점
          </h1>
          <p className="text-base-content/70">로그인하여 후기를 남겨보세요.</p>
        </div>

        <div className="space-y-4">
          {(
            [
              'oauth_google',
              'oauth_custom_kakao',
              'oauth_custom_naver',
            ] as const
          ).map((provider) => {
            const providerInfo = getProviderInfo(provider);
            const isProviderLoading = isLoading === provider;

            return (
              <button
                className={`flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${providerInfo.bgColor} ${providerInfo.textColor} ${providerInfo.borderColor}`}
                disabled={isLoading !== null}
                key={provider}
                onClick={() => handleOAuthSignIn(provider)}
                type="button"
              >
                {isProviderLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  providerInfo.icon
                )}
                <span>{providerInfo.name}로 시작하기</span>
              </button>
            );
          })}
        </div>

        {onClose && (
          <div className="mt-6 text-center">
            <button
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              type="button"
            >
              취소
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
