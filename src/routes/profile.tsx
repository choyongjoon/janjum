import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AuthWrapper } from "~/components/auth/AuthWrapper";
import { ProfileHeader } from "~/components/profile/ProfileHeader";
import { ProfileReviews } from "~/components/profile/ProfileReviews";
import { ProfileStats } from "~/components/profile/ProfileStats";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/profile")({
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
      userId: currentUser?._id || "",
    }),
    enabled: !!currentUser?._id,
  });

  // Get user's rating statistics
  const { data: userStats, isLoading: statsLoading } = useQuery({
    ...convexQuery(api.reviews.getUserStats, {
      userId: currentUser?._id || "",
    }),
    enabled: !!currentUser?._id,
  });

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <ProfileHeader isCurrentUser user={currentUser} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ProfileStats isLoading={statsLoading} userStats={userStats} />
        </div>

        <div className="lg:col-span-2">
          <ProfileReviews
            error={reviewsError}
            isCurrentUser
            isLoading={reviewsLoading}
            userReviews={userReviews}
          />
        </div>
      </div>
    </div>
  );
}
