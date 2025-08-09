import type { SVGProps } from 'react';

interface SearchIconProps extends SVGProps<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function SearchIcon({ size = 'md', ...props }: SearchIconProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <svg
      className={sizeClasses[size]}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>Search</title>
      <path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
