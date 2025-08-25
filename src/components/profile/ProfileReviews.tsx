import { Link } from '@tanstack/react-router';
import {
  type Review,
  ReviewInUserPage,
} from '~/components/reviews/ReviewInUserPage';

interface ProfileReviewsProps {
  userReviews: Review[] | undefined;
  isLoading: boolean;
  error: Error | null;
  isCurrentUser?: boolean;
}

export function ProfileReviews({
  userReviews = [],
  isLoading,
  error,
  isCurrentUser = false,
}: ProfileReviewsProps) {
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-8 text-center">
          <p className="mb-4 text-error">
            후기를 불러오는 중 오류가 발생했습니다.
          </p>
          <p className="text-base-content/60 text-sm">{String(error)}</p>
        </div>
      );
    }

    if (userReviews?.length > 0) {
      return (
        <div className="space-y-4">
          {userReviews.map((review) => (
            <ReviewInUserPage key={review._id} review={review} />
          ))}
        </div>
      );
    }

    return (
      <div className="py-8 text-center">
        <p className="mb-4 text-base-content/60">
          {isCurrentUser
            ? '아직 작성한 후기가 없습니다.'
            : '작성된 후기가 없습니다.'}
        </p>
        {isCurrentUser && (
          <Link className="btn btn-primary" to="/search">
            상품 찾아보기
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
        <h2 className="card-title mb-4">
          {isCurrentUser ? '내 후기' : '후기'}
        </h2>
        {renderContent()}
      </div>
    </div>
  );
}
