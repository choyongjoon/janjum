import type { SVGProps } from 'react';

interface UserIconProps extends SVGProps<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function UserIcon({ size = 'md', ...props }: UserIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <svg
      className={sizeClasses[size]}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>User</title>
      <path
        d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
