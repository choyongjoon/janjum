import { useAuth } from '@clerk/tanstack-react-start';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';
import { DeleteAccountDialog } from './DeleteAccountDialog';

export function AccountDeletion() {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { signOut } = useAuth();
  const router = useRouter();
  const { trackAccountDeletion } = usePostHogEvents();

  const handleDeleteAccount = async () => {
    // Track deletion confirmation
    trackAccountDeletion('confirmed');

    // Sign out the user from Clerk first
    await signOut();
    // Navigate to home page
    router.navigate({ to: '/' });
    setShowDeleteDialog(false);
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h2 className="card-title text-error">위험 구역</h2>
        <p className="mb-4 text-base-content/70 text-sm">
          계정을 삭제하면 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.
        </p>
        <div className="card-actions">
          <button
            className="btn btn-error btn-outline btn-sm"
            onClick={() => {
              trackAccountDeletion('initiated');
              setShowDeleteDialog(true);
            }}
            type="button"
          >
            회원탈퇴
          </button>
        </div>
      </div>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        isOpen={showDeleteDialog}
        onClose={() => {
          trackAccountDeletion('cancelled');
          setShowDeleteDialog(false);
        }}
        onConfirm={handleDeleteAccount}
      />
    </div>
  );
}
