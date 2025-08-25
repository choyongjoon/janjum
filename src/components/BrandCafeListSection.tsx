import type { Doc } from 'convex/_generated/dataModel';
import { CafeCard } from '~/components/CafeCard';

export function BrandCafeListSection({
  cafes,
}: {
  cafes: (Doc<'cafes'> & { imageUrl?: string })[];
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Cafe List Section */}
      <div className="mb-8 text-center">
        <h2 className="mb-4 font-bold text-3xl">브랜드 카페</h2>
        <p className="mb-8 text-base-content/70">
          원하는 카페를 선택해서 메뉴를 확인하세요
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-3 gap-4 md:grid-cols-4">
        {cafes?.map((cafe) => (
          <CafeCard cafe={cafe} key={cafe._id} />
        ))}
      </div>
    </div>
  );
}
