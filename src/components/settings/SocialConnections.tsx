import { useUser } from '@clerk/tanstack-react-start';
import { useState } from 'react';
import {
  type SocialProvider,
  type SocialProviderConfig,
  socialProviders,
} from '~/config/socialProviders';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';

interface ConnectedAccount {
  provider: string;
  emailAddress?: string;
  username?: string;
  verification: { status: string | null } | null;
  destroy: () => Promise<void>;
}

interface ProviderCardProps {
  provider: SocialProviderConfig;
  connectedAccount: ConnectedAccount | null;
  isProviderLoading: boolean;
  isLastAccount: boolean;
  onConnect: (provider: SocialProviderConfig) => void;
  onDisconnect: (account: ConnectedAccount) => void;
  getVerificationStatus: (account: ConnectedAccount) => {
    text: string;
    className: string;
  };
}

function ProviderCard({
  provider,
  connectedAccount,
  isProviderLoading,
  isLastAccount,
  onConnect,
  onDisconnect,
  getVerificationStatus,
}: ProviderCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-base-300 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg border ${provider.borderColor} ${provider.bgColor}`}
        >
          {provider.icon}
        </div>
        <div>
          <p className="font-medium">{provider.name}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {connectedAccount && (
          <span
            className={`badge badge-sm ${getVerificationStatus(connectedAccount).className}`}
          >
            {getVerificationStatus(connectedAccount).text}
          </span>
        )}
        {connectedAccount ? (
          <div
            className="tooltip"
            data-tip={
              isLastAccount ? '마지막 로그인 방법은 해제할 수 없습니다' : ''
            }
          >
            <button
              className="btn btn-error btn-sm"
              disabled={!!isProviderLoading || isLastAccount}
              onClick={() => onDisconnect(connectedAccount)}
              type="button"
            >
              {isProviderLoading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                '연결 해제'
              )}
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            disabled={!!isProviderLoading}
            onClick={() => onConnect(provider)}
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
}

export function SocialConnections() {
  const { user, isLoaded } = useUser();
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { trackSSOConnect, trackSSODisconnect } = usePostHogEvents();

  const getConnectedAccount = (
    providerKey: SocialProvider
  ): ConnectedAccount | null => {
    if (!user?.externalAccounts) {
      return null;
    }

    const account = user.externalAccounts.find((externalAccount) => {
      // Map provider keys to their Clerk identifiers
      const providerMap: Record<SocialProvider, string> = {
        google: 'google',
        kakao: 'custom_kakao',
        naver: 'custom_naver',
      };

      return externalAccount.provider === providerMap[providerKey];
    });

    return account ? (account as ConnectedAccount) : null;
  };

  const handleConnect = async (provider: SocialProviderConfig) => {
    if (!user) {
      return;
    }

    setIsLoading(provider.key);
    setError(null);

    try {
      const externalAccount = await user.createExternalAccount({
        strategy: provider.clerkStrategy,
        redirectUrl: `${window.location.origin}/oauth-callback`,
      });

      // Track successful connection attempt
      trackSSOConnect(provider.name, true);

      // Redirect to provider's OAuth flow
      if (externalAccount.verification?.externalVerificationRedirectURL) {
        window.location.href =
          externalAccount.verification.externalVerificationRedirectURL.toString();
      }
    } catch {
      setError('연결에 실패했습니다. 다시 시도해주세요.');

      // Track failed connection attempt
      trackSSOConnect(provider.name, false);
    } finally {
      setIsLoading(null);
    }
  };

  const handleDisconnect = async (account: ConnectedAccount) => {
    setIsLoading(account.provider);
    setError(null);

    try {
      await account.destroy();
      // User data will be automatically updated by Clerk

      // Track successful disconnection
      trackSSODisconnect(account.provider, true);
    } catch {
      setError('연결 해제에 실패했습니다. 다시 시도해주세요.');

      // Track failed disconnection
      trackSSODisconnect(account.provider, false);
    } finally {
      setIsLoading(null);
    }
  };

  const getVerificationStatus = (account: ConnectedAccount) => {
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

  // Count connected accounts to prevent disconnecting the last one
  const connectedAccountsCount = user?.externalAccounts?.length || 0;

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
          {socialProviders.map((provider) => {
            const connectedAccount = getConnectedAccount(provider.key);
            const isProviderLoading =
              isLoading === provider.key ||
              (connectedAccount && isLoading === connectedAccount.provider);
            const isLastAccount = connectedAccountsCount === 1;

            return (
              <ProviderCard
                connectedAccount={connectedAccount}
                getVerificationStatus={getVerificationStatus}
                isLastAccount={isLastAccount}
                isProviderLoading={!!isProviderLoading}
                key={provider.key}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                provider={provider}
              />
            );
          })}
        </div>

        <div className="text-base-content/60 text-xs">
          <p>• 마지막 남은 로그인 방법은 해제할 수 없습니다.</p>
        </div>
      </div>
    </div>
  );
}
