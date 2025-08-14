import { useUser } from '@clerk/tanstack-react-start';
import { type ReactElement, useState } from 'react';

type Provider = 'google' | 'kakao' | 'naver';

interface ProviderInfo {
  name: string;
  icon: ReactElement;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export function SSOConnections() {
  const { user } = useUser();
  const [connectingProvider, setConnectingProvider] = useState<Provider | null>(
    null
  );

  if (!user) {
    return null;
  }

  const getProviderInfo = (provider: Provider): ProviderInfo => {
    switch (provider) {
      case 'google':
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
      case 'kakao':
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
      case 'naver':
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

  const mapProviderToType = (provider: string): Provider | null => {
    if (provider === 'google') {
      return 'google';
    }
    if (provider.includes('kakao')) {
      return 'kakao';
    }
    if (provider.includes('naver')) {
      return 'naver';
    }
    return null;
  };

  const getConnectedProviders = (): Provider[] => {
    if (!user.externalAccounts) {
      return [];
    }

    return user.externalAccounts
      .map((account) => mapProviderToType(account.provider))
      .filter((provider): provider is Provider => provider !== null);
  };

  const handleConnectProvider = async (provider: Provider) => {
    if (!user) {
      return;
    }

    setConnectingProvider(provider);
    try {
      let strategy: string;
      switch (provider) {
        case 'google':
          strategy = 'oauth_google';
          break;
        case 'kakao':
          strategy = 'oauth_custom_kakao';
          break;
        case 'naver':
          strategy = 'oauth_custom_naver';
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      await user.createExternalAccount({
        strategy: strategy as
          | 'oauth_google'
          | 'oauth_custom_kakao'
          | 'oauth_custom_naver',
        redirectUrl: `${window.location.origin}/oauth-callback`,
      });
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Frontend error logging
      console.error('Failed to connect provider:', error);
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnectProvider = async (provider: Provider) => {
    if (!user) {
      return;
    }

    try {
      const externalAccount = user.externalAccounts?.find((account) => {
        switch (provider) {
          case 'google':
            return account.provider === 'google';
          case 'kakao':
            return account.provider?.includes('kakao');
          case 'naver':
            return account.provider?.includes('naver');
          default:
            return false;
        }
      });

      if (externalAccount) {
        await externalAccount.destroy();
      }
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Frontend error logging
      console.error('Failed to disconnect provider:', error);
    }
  };

  const connectedProviders = getConnectedProviders();
  const availableProviders: Provider[] = ['google', 'kakao', 'naver'];

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h2 className="card-title mb-4 text-xl">소셜 로그인 연결</h2>
        <p className="mb-6 text-base-content/70 text-sm">
          다른 소셜 계정을 연결하여 더 편리하게 로그인하세요.
        </p>

        <div className="space-y-4">
          {availableProviders.map((provider) => {
            const providerInfo = getProviderInfo(provider);
            const isConnected = connectedProviders.includes(provider);
            const isConnecting = connectingProvider === provider;

            return (
              <div
                className="flex items-center justify-between rounded-lg border border-base-300 p-4"
                key={provider}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded p-2 ${providerInfo.bgColor}`}>
                    {providerInfo.icon}
                  </div>
                  <div>
                    <p className="font-medium">{providerInfo.name}</p>
                    <p className="text-base-content/60 text-sm">
                      {isConnected ? '연결됨' : '연결되지 않음'}
                    </p>
                  </div>
                </div>

                <div>
                  {isConnected ? (
                    <button
                      className="btn btn-error btn-outline btn-sm"
                      onClick={() => handleDisconnectProvider(provider)}
                      type="button"
                    >
                      연결 해제
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={isConnecting}
                      onClick={() => handleConnectProvider(provider)}
                      type="button"
                    >
                      {isConnecting ? (
                        <>
                          <span className="loading loading-spinner loading-sm" />
                          연결 중...
                        </>
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

        <div className="mt-6">
          <div className="alert alert-info">
            <svg
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>정보 아이콘</title>
              <path
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <div>
              <p className="text-sm">
                소셜 계정을 연결하면 해당 계정으로도 로그인할 수 있습니다. 최소
                하나의 로그인 방법은 유지해야 합니다.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
