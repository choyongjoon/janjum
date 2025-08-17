import { useUser } from '@clerk/tanstack-react-start';
import { useState } from 'react';

type SocialProvider = 'google' | 'kakao' | 'naver';

interface ProviderInfo {
  key: SocialProvider;
  name: string;
  clerkStrategy: string;
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
}


export function SocialConnections() {
  const { user, isLoaded } = useUser();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providers: ProviderInfo[] = [
    {
      key: 'google',
      name: 'Google',
      clerkStrategy: 'oauth_google',
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
    },
    {
      key: 'kakao',
      name: '카카오',
      clerkStrategy: 'oauth_custom_kakao',
      icon: (
        <svg className="h-5 w-5" fill="#3C1E1E" viewBox="0 0 24 24">
          <title>Kakao</title>
          <path d="M12 3C7.03 3 3 6.44 3 10.61c0 2.61 1.67 4.93 4.19 6.29l-.99 3.66c-.09.33.19.59.49.43l4.36-2.75c.32.02.64.03.96.03 4.97 0 8.99-3.44 8.99-7.66C21 6.44 16.97 3 12 3z" />
        </svg>
      ),
      bgColor: 'bg-[#FEE500] hover:bg-[#FFEB3B]',
      textColor: 'text-[#3C1E1E]',
      borderColor: 'border-[#FEE500]',
    },
    {
      key: 'naver',
      name: '네이버',
      clerkStrategy: 'oauth_custom_naver',
      icon: (
        <svg className="h-5 w-5" fill="white" viewBox="0 0 24 24">
          <title>Naver</title>
          <path d="M16.273 12.845 7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
        </svg>
      ),
      bgColor: 'bg-[#03C75A] hover:bg-[#02B351]',
      textColor: 'text-white',
      borderColor: 'border-[#03C75A]',
    },
  ];

  const getConnectedAccount = (providerKey: SocialProvider) => {
    if (!user?.externalAccounts) {
      return null;
    }

    return user.externalAccounts.find((account) => {
      // Map provider keys to their Clerk identifiers
      const providerMap: Record<SocialProvider, string> = {
        google: 'google',
        kakao: 'custom_kakao',
        naver: 'custom_naver',
      };

      return account.provider === providerMap[providerKey];
    });
  };

  const handleConnect = async (provider: ProviderInfo) => {
    if (!user) {
      return;
    }

    setIsLoading(provider.key);
    setError(null);

    try {
      const externalAccount = await user.createExternalAccount({
        strategy: provider.clerkStrategy as any,
        redirectUrl: `${window.location.origin}/oauth-callback`,
      });

      // Redirect to provider's OAuth flow
      if (externalAccount.verification?.externalVerificationRedirectURL) {
        window.location.href = externalAccount.verification.externalVerificationRedirectURL.toString();
      }
    } catch (err) {
      console.error('Failed to connect account:', err);
      setError('연결에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(null);
    }
  };

  const handleDisconnect = async (account: any) => {
    setIsLoading(account.provider);
    setError(null);

    try {
      await account.destroy();
      // User data will be automatically updated by Clerk
    } catch (err) {
      console.error('Failed to disconnect account:', err);
      setError('연결 해제에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(null);
    }
  };

  const getVerificationStatus = (account: any) => {
    const status = account.verification?.status;
    switch (status) {
      case 'verified':
        return { text: '연결됨', className: 'badge-success' };
      case 'unverified':
        return { text: '미인증', className: 'badge-warning' };
      default:
        return { text: '확인 중', className: 'badge-info' };
    }
  };

  if (!isLoaded) {
    return (
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <div className="flex items-center justify-center p-4">
            <span className="loading loading-spinner loading-lg" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body">
        <h2 className="card-title">소셜 계정 연결</h2>
        <p className="text-base-content/70 text-sm">
          소셜 계정을 연결하여 빠르게 로그인하세요.
        </p>

        {error && (
          <div className="alert alert-error">
            <svg
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
            >
              <title>Error</title>
              <path
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {providers.map((provider) => {
            const connectedAccount = getConnectedAccount(provider.key);
            const isProviderLoading =
              isLoading === provider.key ||
              (connectedAccount && isLoading === connectedAccount.provider);

            return (
              <div
                className="flex items-center justify-between rounded-lg border border-base-300 p-4"
                key={provider.key}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg border ${provider.borderColor} ${provider.bgColor}`}
                  >
                    {provider.icon}
                  </div>
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    {connectedAccount && (
                      <div className="flex items-center gap-2">
                        <p className="text-base-content/70 text-sm">
                          {connectedAccount.emailAddress ||
                            connectedAccount.username ||
                            'Connected'}
                        </p>
                        <span
                          className={`badge badge-sm ${getVerificationStatus(connectedAccount).className}`}
                        >
                          {getVerificationStatus(connectedAccount).text}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connectedAccount ? (
                    <button
                      className="btn btn-error btn-sm"
                      disabled={!!isProviderLoading}
                      onClick={() => handleDisconnect(connectedAccount)}
                      type="button"
                    >
                      {isProviderLoading ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        '연결 해제'
                      )}
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!!isProviderLoading}
                      onClick={() => handleConnect(provider)}
                      type="button"
                    >
                      {isProviderLoading ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        '연결'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="divider my-2" />

        <div className="text-base-content/60 text-xs">
          <p>• 연결된 계정으로 빠르게 로그인할 수 있습니다.</p>
          <p>• 계정 연결을 해제해도 기존 계정 정보는 유지됩니다.</p>
        </div>
      </div>
    </div>
  );
}
