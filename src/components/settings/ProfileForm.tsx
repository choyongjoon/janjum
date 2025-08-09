import { Link } from '@tanstack/react-router';

interface FormData {
  name: string;
  handle: string;
}

interface ProfileFormProps {
  formData: FormData;
  isSubmitting: boolean;
  userLoading: boolean;
  isInitialSetup: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode; // For ProfileImageUpload component
}

export function ProfileForm({
  formData,
  isSubmitting,
  userLoading,
  onInputChange,
  onSubmit,
  isInitialSetup,
  children,
}: ProfileFormProps) {
  return (
    <div className="card bg-base-100 shadow-lg">
      <div className="card-body">
        <form onSubmit={onSubmit}>
          {/* Profile Image Section */}
          {children}

          <fieldset className="fieldset">
            <legend className="fieldset-legend">이름</legend>
            <input
              className="input input-primary"
              id="name"
              name="name"
              onChange={onInputChange}
              required
              type="text"
              value={formData.name}
            />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend">핸들</legend>
            <label className="input input-primary">
              @
              <input
                className="grow"
                id="handle"
                name="handle"
                onChange={onInputChange}
                pattern="^[a-zA-Z0-9_-]+$"
                required
                type="text"
                value={formData.handle}
              />
            </label>
            <p className="label">영문, 숫자, _, - 만 사용 가능합니다.</p>
          </fieldset>
          {/* Submit Buttons */}
          <div className="flex justify-end gap-4">
            {!isInitialSetup && (
              <Link className="btn btn-ghost" to="/profile">
                취소
              </Link>
            )}
            <button
              className="btn btn-primary"
              disabled={isSubmitting || userLoading}
              type="submit"
            >
              {(() => {
                if (isSubmitting) {
                  return (
                    <>
                      <span className="loading loading-spinner loading-sm" />
                      저장 중...
                    </>
                  );
                }
                if (isInitialSetup) {
                  return '프로필 설정 완료';
                }
                return '변경사항 저장';
              })()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
