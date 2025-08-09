import { Link } from '@tanstack/react-router';

export function AuthRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 font-bold text-2xl">로그인이 필요합니다</h1>
        <p className="mb-6 text-base-content/70">
          설정을 변경하려면 로그인해주세요.
        </p>
        <Link className="btn btn-primary" to="/">
          홈으로 가기
        </Link>
      </div>
    </div>
  );
}
