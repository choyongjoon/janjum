import type { SVGProps } from 'react';

interface ExternalLinkIconProps extends SVGProps<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg';
}

export function ExternalLinkIcon({
  size = 'md',
  ...props
}: ExternalLinkIconProps) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  return (
    <svg
      className={sizeClasses[size]}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      {...props}
    >
      <title>External Link</title>
      <path
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
