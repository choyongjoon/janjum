import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

interface ProfileImageUploadProps {
  previewUrl: string;
  onImageChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ProfileImageUpload({
  previewUrl,
  onImageChange,
}: ProfileImageUploadProps) {
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));

  // Get current user's profile image URL from Convex storage
  const { data: currentUserImageUrl } = useQuery({
    ...convexQuery(api.users.getImageUrl, {
      storageId: currentUser?.imageStorageId as Id<'_storage'>,
    }),
    enabled: !!currentUser?.imageStorageId,
  });

  const renderProfileImage = () => {
    if (previewUrl) {
      return (
        <img
          alt="새 프로필 이미지"
          className="h-full w-full object-cover"
          src={previewUrl}
        />
      );
    }
    if (currentUserImageUrl) {
      return (
        <img
          alt="현재 프로필 이미지"
          className="h-full w-full object-cover"
          src={currentUserImageUrl}
        />
      );
    }
    return (
      <div className="flex h-full w-full items-center justify-center bg-base-200">
        <span className="text-2xl">👤</span>
      </div>
    );
  };

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">프로필 이미지</legend>

      <div className="avatar">
        <div className="h-24 w-24 rounded-full ring ring-primary ring-offset-2 ring-offset-base-100">
          {renderProfileImage()}
        </div>
      </div>

      <input
        accept="image/*"
        className="file-input file-input-primary"
        id="profile-image"
        onChange={onImageChange}
        type="file"
      />
      <p className="label">JPG, PNG 파일만 지원됩니다.</p>
    </fieldset>
  );
}
