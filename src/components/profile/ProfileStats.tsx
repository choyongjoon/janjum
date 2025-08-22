import type { RatingDistribution } from 'convex/reviews';
import { UserRatingHistogram } from '~/components/reviews/UserRatingHistogram';

interface UserStats {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: RatingDistribution;
}

interface ProfileStatsProps {
  userStats: UserStats | undefined;
  isLoading: boolean;
}

export function ProfileStats({ userStats, isLoading }: ProfileStatsProps) {
  if (isLoading) {
    return (
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        </div>
      </div>
    );
  }

  if (!userStats) {
    return (
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <div className="py-8 text-center">
            <p className="text-base-content/60">통계를 불러올 수 없습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-md">
      <div className="card-body">
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
      </div>
    </div>
  );
}
