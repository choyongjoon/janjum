import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type KeyboardEventHandler, useState } from 'react';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';
import { api } from '../../../convex/_generated/api';

export function NameSearchInput({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: KeyboardEventHandler<HTMLInputElement>;
}) {
  const navigate = useNavigate();
  const { trackSearch } = usePostHogEvents();

  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get search suggestions for autocomplete
  const { data: suggestions } = useQuery(
    convexQuery(api.products.getSuggestions, {
      searchTerm: value,
      limit: 8,
    })
  );

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: {
    shortId: string;
    name: string;
  }) => {
    // Track search suggestion click
    trackSearch(suggestion.name, 1);

    navigate({
      to: '/product/$shortId',
      params: { shortId: suggestion.shortId },
    });
  };

  return (
    <div className="form-control relative">
      <label className="label" htmlFor="search-input">
        <span className="label-text font-medium">검색어</span>
      </label>
      <input
        aria-autocomplete="list"
        aria-controls="search-suggestions"
        aria-expanded={
          showSuggestions && value.length > 0 && (suggestions?.length ?? 0) > 0
        }
        autoComplete="off"
        className="input input-bordered w-full"
        id="search-input"
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onChange={onChange}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={onKeyDown}
        placeholder="음료명을 입력하세요…"
        role="combobox"
        type="search"
        value={value}
      />

      {/* Autocomplete Suggestions */}
      {showSuggestions &&
        value.length > 0 &&
        suggestions &&
        suggestions.length > 0 && (
          <div className="absolute top-full z-10 mt-1 w-full">
            <div
              className="menu overflow-y-auto rounded-box bg-base-100 shadow-lg"
              id="search-suggestions"
            >
              {suggestions.map((suggestion) => (
                <button
                  className="flex w-full justify-between px-4 py-2 text-left hover:bg-base-200"
                  key={suggestion.name}
                  onClick={() => handleSuggestionClick(suggestion)}
                  type="button"
                >
                  <span>{suggestion.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
