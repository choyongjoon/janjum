declare global {
  interface Window {
    __clerk_publishable_key?: string;
    __mock_user_data?: {
      isSignedIn: boolean;
      user: {
        id: string;
        emailAddresses: Array<{ emailAddress: string }>;
        firstName: string | null;
        lastName: string | null;
      };
      name: string;
      handle: string;
      hasCompletedSetup: boolean;
    };
  }
}

export {};
