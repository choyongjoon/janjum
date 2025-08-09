import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ChangeEvent, type KeyboardEventHandler, useState } from 'react';
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

  const [showSuggestions, setShowSuggestions] = useState(false);

  // Get search suggestions for autocomplete
  const { data: suggestions } = useQuery(
    convexQuery(api.products.getProductSuggestions, {
      searchTerm: value,
      limit: 8,
    })
  );

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: { shortId: string }) => {
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
        className="input input-bordered w-full"
        id="search-input"
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onChange={onChange}
        onFocus={() => setShowSuggestions(true)}
        onKeyDown={onKeyDown}
        placeholder="음료명을 입력하세요"
        type="text"
        value={value}
      />

      {/* Autocomplete Suggestions */}
      {showSuggestions &&
        value.length > 0 &&
        suggestions &&
        suggestions.length > 0 && (
          <div className="absolute top-full z-10 mt-1 w-full">
            <ul className="menu overflow-y-auto rounded-box bg-base-100 shadow-lg">
              {suggestions.map((suggestion) => (
                <li key={suggestion.name}>
                  <button
                    className="flex justify-between"
                    onClick={() => handleSuggestionClick(suggestion)}
                    type="button"
                  >
                    <span>{suggestion.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
    </div>
  );
}
