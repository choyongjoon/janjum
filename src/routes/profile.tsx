import { SignOutButton } from '@clerk/tanstack-react-start';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AuthWrapper } from '~/components/auth/AuthWrapper';
import { MyReview } from '~/components/reviews/MyReview';
import { UserRatingHistogram } from '~/components/reviews/UserRatingHistogram';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export const Route = createFileRoute('/profile')({
  component: AuthenticatedProfilePage,
});

function AuthenticatedProfilePage() {
  return (
    <AuthWrapper>
      <ProfilePage />
    </AuthWrapper>
  );
}

function ProfilePage() {
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));

  // Get user's reviews
  const {
    data: userReviews = [],
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery({
    ...convexQuery(api.reviews.getUserReviews, {
      userId: currentUser?._id || '',
    }),
    enabled: !!currentUser?._id,
  });

  // Get user's rating statistics
  const { data: userStats, isLoading: statsLoading } = useQuery({
    ...convexQuery(api.reviews.getUserStats, {
      userId: currentUser?._id || '',
    }),
    enabled: !!currentUser?._id,
  });

  // Get current user's profile image URL from Convex storage
  const { data: currentUserImageUrl } = useQuery({
    ...convexQuery(api.users.getImageUrl, {
      storageId: currentUser?.imageStorageId as Id<'_storage'>,
    }),
    enabled: !!currentUser?.imageStorageId,
  });

  const isLoading = reviewsLoading || statsLoading;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      {/* Profile Header */}
      <div className="card mb-6 bg-base-100 shadow-md">
        <div className="card-body">
          <div className="flex items-center gap-4">
            {currentUserImageUrl && (
              <div className="avatar">
                <div className="h-16 w-16 rounded-full">
                  <img
                    alt={currentUser?.name || '프로필'}
                    className="h-full w-full object-cover"
                    src={currentUserImageUrl}
                  />
                </div>
              </div>
            )}
            <div className="flex-1">
              <h1 className="font-bold text-2xl">
                {currentUser?.name || '사용자'}
              </h1>
              {currentUser?.handle && (
                <p className="text-base-content/60 text-sm">
                  @{currentUser.handle}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Link className="btn btn-outline btn-sm" to="/settings">
                프로필 수정
              </Link>
              <SignOutButton>
                <button className="btn btn-ghost btn-sm" type="button">
                  로그아웃
                </button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Rating Statistics */}
        <div className="lg:col-span-1">
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              {(() => {
                if (isLoading) {
                  return (
                    <div className="flex justify-center py-8">
                      <span className="loading loading-spinner loading-md" />
                    </div>
                  );
                }

                if (userStats) {
                  return (
                    <>
                      <div className="mb-6 text-center">
                        <div className="stat">
                          <div className="stat-title">평균 평점</div>
                          <div className="stat-value text-primary">
                            {userStats.averageRating.toFixed(1)}
                          </div>
                          <div className="stat-desc">
                            총 {userStats.totalReviews}개의 후기
                          </div>
                        </div>
                      </div>

                      <UserRatingHistogram
                        ratingDistribution={userStats.ratingDistribution}
                        totalReviews={userStats.totalReviews}
                      />
                    </>
                  );
                }

                return (
                  <div className="py-8 text-center">
                    <p className="text-base-content/60">
                      통계를 불러올 수 없습니다.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Review History */}
        <div className="lg:col-span-2">
          <div className="card bg-base-100 shadow-md">
            <div className="card-body">
              <h2 className="card-title mb-4">내 후기</h2>

              {(() => {
                if (isLoading) {
                  return (
                    <div className="flex justify-center py-8">
                      <span className="loading loading-spinner loading-md" />
                    </div>
                  );
                }

                if (reviewsError) {
                  return (
                    <div className="py-8 text-center">
                      <p className="mb-4 text-error">
                        후기를 불러오는 중 오류가 발생했습니다.
                      </p>
                      <p className="text-base-content/60 text-sm">
                        {String(reviewsError)}
                      </p>
                    </div>
                  );
                }

                if (userReviews?.length > 0) {
                  return (
                    <div className="space-y-4">
                      {userReviews.map((review) => (
                        <MyReview key={review._id} review={review} />
                      ))}
                    </div>
                  );
                }

                return (
                  <div className="py-8 text-center">
                    <p className="mb-4 text-base-content/60">
                      아직 작성한 후기가 없습니다.
                    </p>
                    <Link
                      className="btn btn-primary"
                      search={{ searchTerm: '', cafeId: '', category: '' }}
                      to="/search"
                    >
                      상품 찾아보기
                    </Link>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
