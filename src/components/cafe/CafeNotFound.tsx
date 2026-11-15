import { Link } from "@tanstack/react-router";

export function CafeNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200">
      <div className="text-center">
        <h1 className="mb-4 font-bold text-2xl">카페를 찾을 수 없습니다</h1>
        <Link className="btn btn-primary" to="/">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
