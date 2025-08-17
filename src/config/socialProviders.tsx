export type SocialProvider = 'google' | 'kakao' | 'naver';

export interface SocialProviderConfig {
  key: SocialProvider;
  name: string;
  clerkStrategy: 'oauth_google' | 'oauth_custom_kakao' | 'oauth_custom_naver';
  icon: React.ReactNode;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const socialProviders: SocialProviderConfig[] = [
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

// Helper function to get provider config by Clerk strategy
export const getProviderByStrategy = (
  strategy: string
): SocialProviderConfig | undefined => {
  return socialProviders.find(
    (provider) => provider.clerkStrategy === strategy
  );
};

// Helper function to get provider config by key
export const getProviderByKey = (
  key: SocialProvider
): SocialProviderConfig | undefined => {
  return socialProviders.find((provider) => provider.key === key);
};
