import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';
import { api } from '../../convex/_generated/api';
import { SearchIcon } from '../components/icons';
import { ProductCard } from '../components/ProductCard';
import { NameSearchInput } from '../components/search/NameSearchForm';

interface SearchFilters {
  searchTerm?: string;
}

export const Route = createFileRoute('/search')({
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchFilters => ({
    searchTerm: (search.searchTerm as string) || '',
  }),
  loader: async (opts) => {
    const searchFilters = opts.location.search as SearchFilters;

    // Only prefetch if there's a search term to avoid unnecessary empty queries
    if (searchFilters.searchTerm?.trim()) {
      await opts.context.queryClient.ensureQueryData(
        convexQuery(api.products.search, {
          searchTerm: searchFilters.searchTerm,
          limit: 100,
        })
      );
    }
  },
});

function SearchPage() {
  const navigate = useNavigate();
  const { searchTerm } = Route.useSearch();
  const { trackSearch } = usePostHogEvents();

  // Local state for form inputs
  const [formState, setFormState] = useState({
    searchTerm: searchTerm || '',
  });

  // Get search results
  const searchParams = useMemo(
    () => ({
      searchTerm: searchTerm || undefined,
      limit: 100,
    }),
    [searchTerm]
  );

  const { data: searchResults } = useSuspenseQuery(
    convexQuery(api.products.search, searchParams)
  );

  // Update form state when URL search params change
  useEffect(() => {
    setFormState({
      searchTerm: searchTerm || '',
    });
  }, [searchTerm]);

  // Handle form submission
  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedSearchTerm = formState.searchTerm.trim();

    if (trimmedSearchTerm) {
      // Track search event
      trackSearch(trimmedSearchTerm, searchResults?.length);
    }

    navigate({
      to: '/search',
      search: {
        searchTerm: trimmedSearchTerm || '',
      },
    });
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Search Header */}
      <div className="bg-base-100 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <h1 className="mb-6 font-bold text-3xl">검색</h1>

          {/* Search Form */}
          <form className="space-y-4" onSubmit={handleSearch}>
            <NameSearchInput
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  searchTerm: e.target.value,
                }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              value={formState.searchTerm}
            />

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button className="btn btn-primary btn-block" type="submit">
                <SearchIcon size="sm" />
                검색
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Search Results */}
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-semibold text-xl">
            검색 결과 ({searchResults?.length || 0}개)
          </h2>
        </div>

        {searchResults && searchResults.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {searchResults.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <h3 className="mb-2 font-semibold text-lg">검색 결과가 없습니다</h3>
            <p className="mb-4 text-base-content/60">
              다른 검색어를 시도해보세요.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
