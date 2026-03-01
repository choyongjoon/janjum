import { useRef } from 'react';
import { SearchIcon } from '~/components/icons/SearchIcon';

interface ProductSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ProductSearchInput({
  value,
  onChange,
}: ProductSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-w-0 flex-1">
      <label className="input input-bordered flex items-center gap-2">
        <SearchIcon size="sm" />
        <input
          aria-label="음료 검색"
          className="grow"
          onChange={(e) => onChange(e.target.value)}
          placeholder="음료명을 검색하세요"
          ref={inputRef}
          type="search"
          value={value}
        />
        {value && (
          <button
            className="text-base-content/40"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            type="button"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>검색어 지우기</title>
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        )}
      </label>
    </div>
  );
}
