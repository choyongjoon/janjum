import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Id } from 'convex/_generated/dataModel';
import { useEffect, useState } from 'react';
import { usePostHogEvents } from '~/hooks/usePostHogEvents';
import { api } from '../../../convex/_generated/api';
import { RatingButtonGroup } from './RatingButtonGroup';

interface ReviewFormProps {
  productId: Id<'products'>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function ReviewForm({
  productId,
  onSuccess,
  onCancel,
}: ReviewFormProps) {
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));
  const queryClient = useQueryClient();
  const { trackReviewSubmit } = usePostHogEvents();
  const [rating, setRating] = useState<number>(0);
  const [text, setText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imageStorageIds, setImageStorageIds] = useState<Id<'_storage'>[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Check if user already has a review for this product
  const { data: existingReview } = useQuery({
    ...convexQuery(api.reviews.getUserReview, {
      productId,
      userId: currentUser?._id || '',
    }),
    enabled: !!currentUser?._id,
  });

  // Initialize form with existing review data
  useEffect(() => {
    if (existingReview) {
      setRating(existingReview.rating);
      setText(existingReview.text || '');
      setImageStorageIds(existingReview.imageStorageIds || []);
      // We'll get image URLs from the review query that includes imageUrls
      setExistingImageUrls(existingReview.imageUrls || []);
    }
  }, [existingReview]);

  const generateUploadUrlMutation = useMutation({
    mutationFn: useConvexMutation(api.reviews.generateUploadUrl),
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File): Promise<Id<'_storage'>> => {
      // Get upload URL from Convex
      const uploadUrl = await generateUploadUrlMutation.mutateAsync({});

      // Upload file to Convex storage
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!result.ok) {
        throw new Error(`Failed to upload image: ${result.status}`);
      }

      const { storageId } = await result.json();
      return storageId as Id<'_storage'>;
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: useConvexMutation(api.reviews.upsertReview),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onSuccess?.();
    },
  });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const totalImages = existingImageUrls.length + images.length;
    if (files.length + totalImages > 2) {
      alert('최대 2장까지 업로드할 수 있습니다.');
      return;
    }
    setImages([...images, ...files]);
  };

  const removeExistingImage = (index: number) => {
    setExistingImageUrls(existingImageUrls.filter((_, i) => i !== index));
    setImageStorageIds(imageStorageIds.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      alert('후기를 작성하려면 로그인이 필요합니다.');
      return;
    }

    if (rating === 0) {
      alert('평점을 선택해주세요.');
      return;
    }

    setIsUploading(true);

    try {
      // Upload new images
      const newStorageIds = await Promise.all(
        images
          .filter((file): file is File => file instanceof File)
          .map((file) => uploadImageMutation.mutateAsync(file))
      );

      // Get storage IDs for remaining existing images (ones not removed)
      const remainingExistingStorageIds = imageStorageIds.slice(
        0,
        existingImageUrls.length
      );

      // Combine remaining existing images and new image storage IDs
      const allImageStorageIds = [
        ...remainingExistingStorageIds,
        ...newStorageIds,
      ];

      // Submit review
      await submitReviewMutation.mutateAsync({
        productId,
        userId: currentUser._id,
        rating,
        text: text.trim() || undefined,
        imageStorageIds:
          allImageStorageIds.length > 0 ? allImageStorageIds : undefined,
      });

      // Track successful review submission
      trackReviewSubmit(productId, rating);
    } catch {
      alert('후기 등록에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="card bg-base-100 shadow-md">
        <div className="card-body text-center">
          <p className="text-base-content/70">
            후기를 작성하려면 로그인이 필요합니다.
          </p>
        </div>
      </div>
    );
  }

  const isSubmitting =
    generateUploadUrlMutation.isPending ||
    uploadImageMutation.isPending ||
    submitReviewMutation.isPending ||
    isUploading;

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h3 className="card-title">
          {existingReview ? '후기 수정' : '후기 작성'}
        </h3>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Rating Selection */}
          <div className="form-control">
            <label className="label block" htmlFor="review-rating">
              <span className="label-text font-medium">평점 *</span>
            </label>

            <RatingButtonGroup onRatingChange={setRating} rating={rating} />
          </div>

          {/* Review Text */}
          <div className="form-control">
            <label className="label block" htmlFor="review-text">
              <span className="label-text font-medium">내용</span>
            </label>
            <textarea
              className="textarea textarea-bordered h-24 resize-none"
              id="review-text"
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="이 음료에 대한 솔직한 후기를 남겨주세요."
              value={text}
            />
            <div className="label-text-alt text-base-content/60">
              {text.length}/500
            </div>
          </div>

          {/* Photo Upload */}
          <div className="form-control">
            <label className="label block" htmlFor="review-images">
              <span className="label-text font-medium">사진</span>
              <span className="label-text-alt ml-2 text-base-content/60">
                최대 2장
              </span>
            </label>

            {/* Image Preview */}
            {(existingImageUrls.length > 0 || images.length > 0) && (
              <div className="mb-2 grid grid-cols-2 gap-2">
                {/* Existing images from storage */}
                {existingImageUrls.map((imageUrl, index) => (
                  <div className="relative" key={`existing-${imageUrl}`}>
                    <div className="aspect-square overflow-hidden rounded-lg">
                      <img
                        alt={`Review attachment ${index + 1}`}
                        className="h-full w-full object-cover"
                        src={imageUrl}
                      />
                    </div>
                    <button
                      className="-top-2 -right-2 btn btn-circle btn-xs btn-error absolute"
                      onClick={() => removeExistingImage(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}

                {/* New image previews */}
                {images.map((file, index) => (
                  <div
                    className="relative"
                    key={`new-${file.name}-${file.size}`}
                  >
                    <div className="aspect-square overflow-hidden rounded-lg">
                      <img
                        alt={`Upload preview ${index + 1}`}
                        className="h-full w-full object-cover"
                        src={URL.createObjectURL(file)}
                      />
                    </div>
                    <button
                      className="-top-2 -right-2 btn btn-circle btn-xs btn-error absolute"
                      onClick={() => removeNewImage(index)}
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            {existingImageUrls.length + images.length < 2 && (
              <input
                accept="image/*"
                className="file-input file-input-bordered"
                multiple
                onChange={handleImageChange}
                type="file"
              />
            )}
          </div>

          {/* Submit Buttons */}
          <div className="card-actions justify-end">
            {onCancel && (
              <button
                className="btn btn-ghost"
                disabled={isSubmitting}
                onClick={onCancel}
                type="button"
              >
                취소
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={isSubmitting || rating === 0}
              type="submit"
            >
              {isSubmitting && (
                <span className="loading loading-spinner loading-sm" />
              )}
              {existingReview ? '수정하기' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
