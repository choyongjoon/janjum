import type { Doc } from 'convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { ConvexImage } from '../ConvexImage';

function CafeHeader({
  cafe,
  numProducts,
}: {
  cafe: Doc<'cafes'>;
  numProducts: number | undefined;
}) {
  return (
    <div className="bg-primary py-12 text-primary-content">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-content/20">
            <ConvexImage
              alt={cafe?.name}
              className="h-full w-full object-cover"
              fallbackImageUrl={cafe?.imageStorageId}
              getImageUrl={api.products.getImageUrl}
              imageStorageId={cafe?.imageStorageId}
            />
          </div>
          <div>
            <h1 className="font-bold text-4xl">{cafe?.name}</h1>
            <p className="mt-2 text-lg opacity-90">
              {numProducts !== undefined
                ? `${numProducts}개의 상품`
                : '로딩 중...'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CafeHeader;
