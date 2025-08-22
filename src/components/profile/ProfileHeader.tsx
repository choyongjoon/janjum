import { SignOutButton } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';

interface User {
  _id: string;
  name: string;
  handle: string;
  imageUrl?: string;
}

interface ProfileHeaderProps {
  user?: User | null;
  isCurrentUser?: boolean;
}

export function ProfileHeader({
  user,
  isCurrentUser = false,
}: ProfileHeaderProps) {
  if (!user) {
    return null;
  }

  return (
    <div className="card mb-6 bg-base-100 shadow-md">
      <div className="card-body">
        <div className="flex items-center gap-4">
          {user.imageUrl && (
            <div className="avatar">
              <div className="h-16 w-16 rounded-full">
                <img
                  alt={user.name || '프로필'}
                  className="h-full w-full object-cover"
                  src={user.imageUrl}
                />
              </div>
            </div>
          )}
          <div className="flex-1">
            <h1 className="font-bold text-2xl">{user.name || '사용자'}</h1>
            <p className="text-base-content/60 text-sm">@{user.handle}</p>
          </div>
          {isCurrentUser && (
            <div className="flex flex-wrap gap-2">
              <Link className="btn btn-outline btn-sm" to="/settings">
                프로필 수정
              </Link>
              <SignOutButton>
                <button className="btn btn-ghost btn-sm" type="button">
                  로그아웃
                </button>
              </SignOutButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
