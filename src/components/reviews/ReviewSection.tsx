import { convexQuery, useConvexMutation } from '@convex-dev/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Id } from 'convex/_generated/dataModel';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { SignInModal } from '../auth/SignInModal';
import { ReviewCard } from './ReviewCard';
import { ReviewForm } from './ReviewForm';

interface ReviewSectionProps {
  productId: Id<'products'>;
}

export function ReviewSection({ productId }: ReviewSectionProps) {
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [_editingReview, setEditingReview] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);

  // Get review statistics
  const { data: reviewStats } = useQuery(
    convexQuery(api.reviews.getProductStats, { productId })
  );

  // Get product reviews
  const { data: reviews } = useQuery(
    convexQuery(api.reviews.getByProduct, { productId, limit: 20 })
  );

  // Get user's existing review
  const { data: userReview } = useQuery({
    ...convexQuery(api.reviews.getUserReview, {
      productId,
      userId: currentUser?._id || '',
    }),
    enabled: !!currentUser?._id,
  });

  // Delete review mutation
  const deleteReviewMutation = useMutation({
    mutationFn: useConvexMutation(api.reviews.deleteReview),
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  const handleWriteReview = () => {
    if (!currentUser) {
      setShowSignInModal(true);
      return;
    }
    setShowForm(true);
    setEditingReview(false);
  };

  const handleEditReview = () => {
    setShowForm(true);
    setEditingReview(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingReview(false);
    // The queries will automatically refetch due to invalidation
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingReview(false);
  };

  const handleDeleteReview = async (reviewId: Id<'reviews'>) => {
    if (!currentUser) {
      alert('후기를 삭제하려면 로그인이 필요합니다.');
      return;
    }

    if (!confirm('정말로 이 후기를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteReviewMutation.mutateAsync({
        reviewId,
        userId: currentUser._id,
      });
    } catch {
      alert('후기 삭제에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const hasUserReview = !!userReview;

  return (
    <div className="space-y-6">
      {/* Review Actions */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-xl">
          후기 ({reviewStats?.totalReviews || 0})
        </h3>

        {!showForm && (
          <div className="flex gap-2">
            {currentUser ? (
              hasUserReview ? (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={handleEditReview}
                  type="button"
                >
                  내 후기 수정
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleWriteReview}
                  type="button"
                >
                  후기 작성
                </button>
              )
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowSignInModal(true)}
                type="button"
              >
                소셜 계정으로 로그인
              </button>
            )}
          </div>
        )}
      </div>

      {/* Review Form */}
      {showForm && (
        <ReviewForm
          onCancel={handleFormCancel}
          onSuccess={handleFormSuccess}
          productId={productId}
        />
      )}

      {/* Reviews List */}
      {reviews && reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              currentUserId={currentUser?._id}
              key={review._id}
              onDelete={
                review.userId === currentUser?._id
                  ? () => handleDeleteReview(review._id)
                  : undefined
              }
              onEdit={
                review.userId === currentUser?._id
                  ? handleEditReview
                  : undefined
              }
              review={review}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="card bg-base-100 shadow-sm">
            <div className="card-body py-12 text-center">
              <h4 className="mb-2 font-semibold text-lg">
                아직 후기가 없습니다
              </h4>
              <p className="mb-4 text-base-content/60">
                이 상품에 대한 첫 번째 후기를 작성해보세요!
              </p>
              {currentUser ? (
                <button
                  className="btn btn-primary"
                  onClick={handleWriteReview}
                  type="button"
                >
                  첫 후기 작성하기
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowSignInModal(true)}
                  type="button"
                >
                  소셜 계정으로 로그인
                </button>
              )}
            </div>
          </div>
        )
      )}

      {/* Sign In Modal */}
      <SignInModal
        isOpen={showSignInModal}
        onClose={() => setShowSignInModal(false)}
      />
    </div>
  );
}
