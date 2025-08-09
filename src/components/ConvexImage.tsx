import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import type { Id } from 'convex/_generated/dataModel';
import type { FunctionReference } from 'convex/server';
import { useState } from 'react';

interface ProductImageProps {
  getImageUrl: FunctionReference<
    'query',
    'public',
    {
      storageId: Id<'_storage'>;
    },
    string | null,
    string | undefined
  >;
  imageStorageId?: Id<'_storage'>;
  fallbackImageUrl?: string;
  className?: string;
  alt?: string;
}

export function ConvexImage({
  getImageUrl,
  imageStorageId,
  fallbackImageUrl,
  alt,
  className = 'w-full h-48 object-cover rounded-lg',
}: ProductImageProps) {
  const [imageError, setImageError] = useState(false);
  const [useExternal, setUseExternal] = useState(false);

  // Get the Convex storage URL if we have a storage ID
  const queryOptions = convexQuery(getImageUrl, {
    storageId: imageStorageId as Id<'_storage'>,
  });

  const { data: convexImageUrl, error: convexError } = useQuery({
    ...queryOptions,
    enabled: !!imageStorageId && !useExternal,
    retry: false,
  });

  // Determine which image to use
  let imageUrl = '';
  let shouldShowImage = false;

  if (
    imageStorageId &&
    convexImageUrl &&
    !convexError &&
    !imageError &&
    !useExternal
  ) {
    // Use Convex stored image (preferred)
    imageUrl = convexImageUrl;
    shouldShowImage = true;
  } else if (
    fallbackImageUrl &&
    (useExternal || !imageStorageId || convexError || imageError)
  ) {
    // Fallback to external image
    imageUrl = fallbackImageUrl;
    shouldShowImage = true;
  }

  const handleImageError = () => {
    if (imageStorageId && convexImageUrl && !useExternal) {
      // If Convex image failed, try external
      setUseExternal(true);
      setImageError(false);
    } else {
      // If external image also failed, show placeholder
      setImageError(true);
    }
  };

  if (!shouldShowImage || imageError) {
    // Show placeholder
    return (
      <div
        className={`${className} flex items-center justify-center bg-base-300 text-base-content/50`}
      >
        <div className="text-center">
          <span className="text-4xl">🖼️</span>
        </div>
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleImageError}
      src={imageUrl}
    />
  );
}
