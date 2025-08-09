import { useUser } from '@clerk/tanstack-react-start';

export function AccountInfo() {
  const { user } = useUser();

  if (!user) {
    return null;
  }

  return (
    <div className="card mt-6 bg-base-100 shadow-lg">
      <div className="card-body">
        <h2 className="card-title mb-4 text-xl">계정 정보</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between border-base-300 border-b py-2">
            <span className="font-medium">이메일</span>
            <span className="text-base-content/70">
              {user.primaryEmailAddress?.emailAddress || '이메일 없음'}
            </span>
          </div>

          <div className="flex items-center justify-between border-base-300 border-b py-2">
            <span className="font-medium">가입일</span>
            <span className="text-base-content/70">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('ko-KR')
                : '알 수 없음'}
            </span>
          </div>
        </div>

        <div className="card-actions mt-6 justify-end">
          <p className="text-base-content/50 text-sm">
            이메일과 계정 설정은 Clerk에서 관리됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
