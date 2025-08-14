import { useConvexMutation } from '@convex-dev/react-query';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';

interface DeleteAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteAccountDialog({
  isOpen,
  onClose,
  onConfirm,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteAccountMutation = useMutation({
    mutationFn: useConvexMutation(api.users.deleteAccount),
    onSuccess: () => {
      onConfirm();
    },
    onError: (error) => {
      // biome-ignore lint/suspicious/noConsole: Frontend error logging
      console.error('Failed to delete account:', error);
    },
  });

  const handleDelete = async () => {
    if (confirmText !== '회원탈퇴') {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteAccountMutation.mutateAsync({});
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: Frontend error logging
      console.error('Delete account error:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const canDelete = confirmText === '회원탈퇴' && !isDeleting;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-error text-lg">회원탈퇴</h3>

        <div className="py-4">
          <div className="alert alert-warning mb-4">
            <svg
              className="h-6 w-6 shrink-0 stroke-current"
              fill="none"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <title>경고 아이콘</title>
              <path
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.96-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
            <div>
              <p className="font-semibold">주의사항</p>
              <ul className="mt-2 space-y-1 text-sm">
                <li>• 계정 삭제 시 모든 데이터가 영구적으로 삭제됩니다</li>
                <li>• 작성한 모든 리뷰와 이미지가 삭제됩니다</li>
                <li>• 삭제된 데이터는 복구할 수 없습니다</li>
              </ul>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="confirmText">
              <span className="label-text">
                계속하려면 <strong>"회원탈퇴"</strong>를 입력하세요
              </span>
            </label>
            <input
              className="input input-bordered w-full"
              disabled={isDeleting}
              id="confirmText"
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="회원탈퇴"
              type="text"
              value={confirmText}
            />
          </div>
        </div>

        <div className="modal-action">
          <button
            className="btn"
            disabled={isDeleting}
            onClick={onClose}
            type="button"
          >
            취소
          </button>
          <button
            className={`btn btn-error ${canDelete ? '' : 'btn-disabled'}`}
            disabled={!canDelete}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                삭제 중...
              </>
            ) : (
              '계정 삭제'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
