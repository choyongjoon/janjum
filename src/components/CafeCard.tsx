import { Link } from '@tanstack/react-router';
import type { Doc } from 'convex/_generated/dataModel';

export function CafeCard({
  cafe,
}: {
  cafe: Doc<'cafes'> & { imageUrl?: string };
}) {
  return (
    <Link
      className="card cursor-pointer bg-base-100 shadow-sm transition-all duration-200 hover:bg-base-300 hover:shadow-lg"
      params={{ slug: cafe.slug }}
      to="/cafe/$slug"
    >
      <figure className="">
        <img
          alt={cafe.name}
          className="aspect-square w-full object-cover"
          loading="lazy"
          src={cafe.imageUrl}
        />
      </figure>
      <div className="card-body items-center p-6 text-center">
        <h3 className="card-title text-xl">{cafe.name}</h3>
      </div>
    </Link>
  );
}
