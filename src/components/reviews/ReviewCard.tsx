import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { api } from '../../../convex/_generated/api';
import { showToast } from '../../utils/toast';
import { RatingText } from './RatingText';

function useUserProfile(userId: string) {
  const { data: fetchedUser } = useQuery({
    ...convexQuery(api.users.getById, { userId: userId as Id<'users'> }),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const displayName = fetchedUser?.name || '익명 사용자';
  const handle = fetchedUser?.handle;
  const imageUrl = fetchedUser?.imageUrl;

  return { displayName, handle, imageUrl };
}

function ReviewImageModal({
  imageUrl,
  index,
}: {
  imageUrl: string;
  index: number;
}) {
  return (
    <div className="aspect-square overflow-hidden rounded-lg">
      <button
        className="h-full w-full cursor-pointer transition-transform hover:scale-105"
        onClick={() => {
          const modal = document.getElementById(
            `image-modal-${imageUrl}`
          ) as HTMLDialogElement;
          modal?.showModal();
        }}
        type="button"
      >
        <img
          alt={`Review attachment ${index + 1}`}
          className="h-full w-full object-cover"
          src={imageUrl}
        />
      </button>

      <dialog className="modal" id={`image-modal-${imageUrl}`}>
        <div className="modal-box w-auto max-w-none p-0">
          <img
            alt={`후기 사진 ${index + 1}`}
            className="h-auto w-full"
            src={imageUrl}
          />
        </div>
        <form className="modal-backdrop" method="dialog">
          <button type="submit">close</button>
        </form>
      </dialog>
    </div>
  );
}

interface ReviewCardProps {
  review: {
    _id: Id<'reviews'>;
    userId: string;
    rating: number;
    text?: string;
    imageUrls?: string[];
    ratingText: string;
    createdAt: number;
    updatedAt: number;
  };
  currentUserId?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ReviewCard({
  review,
  currentUserId,
  onEdit,
  onDelete,
}: ReviewCardProps) {
  const { displayName, handle, imageUrl } = useUserProfile(review.userId);

  const isOwner = currentUserId === review.userId;
  const createdDate = new Date(review.createdAt);
  const updatedDate = new Date(review.updatedAt);
  const wasEdited = review.updatedAt > review.createdAt;

  return (
    <div className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-0 p-4">
        {/* Header with Profile Image, User Name, and Actions */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {/* Profile Image */}
            <div className="avatar">
              {handle ? (
                <Link
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-content border-solid transition-opacity hover:opacity-80"
                  params={{ handle }}
                  to="/user/$handle"
                >
                  {imageUrl && (
                    <img
                      alt={displayName}
                      className="h-full w-full rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      src={imageUrl}
                    />
                  )}
                </Link>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  {imageUrl && (
                    <img
                      alt={displayName}
                      className="h-full w-full rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      src={imageUrl}
                    />
                  )}
                </div>
              )}
            </div>

            {/* User Info Column */}
            <div className="flex-1">
              {/* User Name and Edit Status */}
              <div className="mb-1 flex items-center gap-2">
                {handle ? (
                  <Link
                    className="hover:link font-medium text-sm"
                    params={{ handle }}
                    to="/user/$handle"
                  >
                    {displayName}
                  </Link>
                ) : (
                  <span className="font-medium text-sm">{displayName}</span>
                )}
              </div>

              {/* Rating Label */}
              <div className="mb-2">
                <RatingText
                  rating={review.rating}
                  ratingText={review.ratingText}
                />
              </div>
            </div>
          </div>

          {/* Action Menu */}
          <div className="flex items-center gap-2">
            {/* Share Button */}
            <button
              className="btn btn-ghost btn-circle btn-xs"
              onClick={() => {
                const reviewUrl = `${window.location.origin}/review/${review._id}`;
                navigator.clipboard
                  .writeText(reviewUrl)
                  .then(() => {
                    showToast('후기 링크가 복사되었습니다!', 'success');
                  })
                  .catch(() => {
                    showToast('링크 복사에 실패했습니다.', 'error');
                  });
              }}
              title="후기 링크 복사"
              type="button"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Share review</title>
                <path
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>

            {/* Owner Action Menu */}
            {isOwner && (
              <div className="dropdown dropdown-end">
                <button
                  className="btn btn-ghost btn-circle btn-xs"
                  tabIndex={0}
                  type="button"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <title>Menu options</title>
                    <path
                      d="M12 5v.01M12 12v.01M12 19v.01"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
                <ul className="dropdown-content menu z-[1] w-32 rounded-box bg-base-100 p-2 shadow">
                  {onEdit && (
                    <li>
                      <button onClick={onEdit} type="button">
                        수정
                      </button>
                    </li>
                  )}
                  {onDelete && (
                    <li>
                      <button
                        className="text-error"
                        onClick={onDelete}
                        type="button"
                      >
                        삭제
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Review Text with left margin matching profile image */}
        {review.text && (
          <div className="ml-[52px]">
            {' '}
            {/* 40px (h-10 w-10) + 12px (gap-3) = 52px */}
            <p className="text-base-content">{review.text}</p>
          </div>
        )}

        {/* Review Images with left margin matching profile image */}
        {review.imageUrls && review.imageUrls.length > 0 && (
          <div className="mt-3 ml-[52px]">
            <div className="grid grid-cols-2 gap-2">
              {review.imageUrls.map((reviewImageUrl, index) => (
                <ReviewImageModal
                  imageUrl={reviewImageUrl}
                  index={index}
                  key={reviewImageUrl}
                />
              ))}
            </div>
          </div>
        )}

        {/* Date */}
        <div className="mt-3 text-right text-base-content/60 text-sm">
          <Link
            className="link link-hover"
            params={{ reviewId: review._id }}
            to="/review/$reviewId"
          >
            {wasEdited ? (
              <>{updatedDate.toLocaleDateString('ko-KR')} (수정됨)</>
            ) : (
              createdDate.toLocaleDateString('ko-KR')
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
