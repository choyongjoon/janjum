import { createFileRoute } from '@tanstack/react-router';

import { AuthWrapper } from '~/components/auth/AuthWrapper';
import {
  AccountDeletion,
  AccountInfo,
  AlertMessages,
  ProfileForm,
  ProfileImageUpload,
  SettingsHeader,
  SSOConnections,
} from '~/components/settings';
import { useSettingsForm } from '~/hooks/useSettingsForm';

export const Route = createFileRoute('/settings')({
  component: AuthenticatedSettingsPage,
});

function AuthenticatedSettingsPage() {
  return (
    <AuthWrapper>
      <SettingsPage />
    </AuthWrapper>
  );
}

function SettingsPage() {
  const {
    userLoading,
    formData,
    previewUrl,
    isSubmitting,
    successMessage,
    errorMessage,
    isInitialSetup,
    handleInputChange,
    handleImageChange,
    handleSubmit,
  } = useSettingsForm();

  // If user is not found in Convex DB, they might be a new user
  // Still show the form for new users to complete setup

  return (
    <div className="container mx-auto max-w-2xl px-4 py-6">
      <SettingsHeader isInitialSetup={isInitialSetup} />

      <AlertMessages
        errorMessage={errorMessage}
        successMessage={successMessage}
      />

      <ProfileForm
        formData={formData}
        isInitialSetup={isInitialSetup}
        isSubmitting={isSubmitting}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
        userLoading={userLoading}
      >
        <ProfileImageUpload
          onImageChange={handleImageChange}
          previewUrl={previewUrl}
        />
      </ProfileForm>

      <AccountInfo />

      {/* SSO Connections */}
      <div className="mt-8">
        <SSOConnections />
      </div>

      {/* Account Deletion - placed at the bottom */}
      <div className="mt-8">
        <AccountDeletion />
      </div>
    </div>
  );
}
