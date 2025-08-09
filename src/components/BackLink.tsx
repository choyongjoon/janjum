import { Link } from '@tanstack/react-router';

interface BackLinkProps {
  to: string;
  children: React.ReactNode;
  className?: string;
}

export function BackLink({ to, children, className = '' }: BackLinkProps) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <Link className={`btn btn-ghost btn-sm ${className}`} to={to}>
        ← {children}
      </Link>
    </div>
  );
}
