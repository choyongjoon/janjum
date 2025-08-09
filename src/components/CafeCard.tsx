import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { ConvexImage } from './ConvexImage';

export function CafeCard({
  cafe,
}: {
  cafe: {
    _id: string;
    name: string;
    slug: string;
    imageStorageId?: Id<'_storage'>;
  };
}) {
  return (
    <Link
      className="card cursor-pointer bg-base-100 shadow-sm transition-all duration-200 hover:bg-base-300 hover:shadow-lg"
      params={{ slug: cafe.slug }}
      to="/cafe/$slug"
    >
      <figure className="">
        <ConvexImage
          alt={cafe.name}
          className="aspect-square w-full object-cover"
          getImageUrl={api.cafes.getImageUrl}
          imageStorageId={cafe.imageStorageId}
        />
      </figure>
      <div className="card-body items-center p-6 text-center">
        <h3 className="card-title text-xl">{cafe.name}</h3>
      </div>
    </Link>
  );
}
