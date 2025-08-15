import { Link, useLocation } from '@tanstack/react-router';

export function Footer() {
  const isBlog = useLocation().pathname.startsWith('/blog');

  return (
    <footer
      className="mt-auto bg-base-200"
      data-theme={isBlog ? 'wireframe' : ''}
    >
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center space-y-6">
          {/* Navigation Links */}
          <nav className="flex flex-wrap justify-center gap-6">
            <Link
              className="text-base-content/70 text-sm transition-colors hover:text-primary"
              search={{ searchTerm: '', cafeId: '', category: '' }}
              to="/search"
            >
              검색
            </Link>
            <Link
              className="text-base-content/70 text-sm transition-colors hover:text-primary"
              to="/profile"
            >
              프로필
            </Link>
            <Link
              className="text-base-content/70 text-sm transition-colors hover:text-primary"
              to="/settings"
            >
              설정
            </Link>
            <Link
              className="text-base-content/70 text-sm transition-colors hover:text-primary"
              to="/privacy"
            >
              개인정보처리방침
            </Link>
            <Link
              className="text-base-content/70 text-sm transition-colors hover:text-primary"
              to="/blog"
            >
              블로그
            </Link>
          </nav>

          {/* Copyright */}
          <div className="text-center text-base-content/60 text-xs">
            <p>&copy; 2025 잔점. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
