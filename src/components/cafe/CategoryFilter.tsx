interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string | undefined;
  isLoading: boolean;
  onCategoryChange: (category: string) => void;
}

export function CategoryFilter({
  categories,
  selectedCategory,
  isLoading,
  onCategoryChange,
}: CategoryFilterProps) {
  return (
    <div className="mb-8">
      <h2 className="mb-4 font-semibold text-xl">카테고리</h2>
      <div className="flex flex-wrap gap-2">
        <button
          className={`btn btn-sm ${selectedCategory === undefined ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onCategoryChange('전체')}
          type="button"
        >
          전체
        </button>
        {isLoading
          ? Array.from({ length: 4 }, (_, i) => (
              <div
                className="h-8 w-16 animate-pulse rounded bg-base-300"
                key={`category-skeleton-${
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  i
                }`}
              />
            ))
          : categories.map((category) => (
              <button
                className={`btn btn-sm ${selectedCategory === category ? 'btn-primary' : 'btn-outline'}`}
                key={category}
                onClick={() => onCategoryChange(category)}
                type="button"
              >
                {category}
              </button>
            ))}
      </div>
    </div>
  );
}
