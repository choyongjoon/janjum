import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { ProfileHeader } from '~/components/profile/ProfileHeader';
import { ProfileReviews } from '~/components/profile/ProfileReviews';
import { ProfileStats } from '~/components/profile/ProfileStats';
import { api } from '../../convex/_generated/api';
import { seo } from '../utils/seo';

export const Route = createFileRoute('/user/$handle')({
  component: UserProfilePage,
  loader: (opts) => {
    // We can't use the context.queryClient here since we're in a loader
    // The user data will be fetched in the component
    return { handle: opts.params.handle };
  },
  head: ({ loaderData }) => ({
    meta: [
      ...seo({
        title: `${loaderData?.handle || '사용자'}님의 프로필 | 잔점`,
        description: `${loaderData?.handle || '사용자'}님의 카페 음료 후기와 프로필을 확인하세요.`,
        image: '/android-chrome-512x512.png',
        keywords: '사용자 프로필, 후기, 잔점',
      }),
    ],
  }),
});

function UserProfilePage() {
  const { handle } = Route.useParams();

  // Get user by handle
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useQuery(
    convexQuery(api.users.getByHandle, {
      handle,
    })
  );

  // Get current user to check if this is their own profile
  const { data: currentUser } = useQuery(convexQuery(api.users.current, {}));

  // Get user's reviews
  const {
    data: userReviews = [],
    isLoading: reviewsLoading,
    error: reviewsError,
  } = useQuery({
    ...convexQuery(api.reviews.getUserReviews, {
      userId: user?._id || '',
    }),
    enabled: !!user?._id,
  });

  // Get user's rating statistics
  const { data: userStats, isLoading: statsLoading } = useQuery({
    ...convexQuery(api.reviews.getUserStats, {
      userId: user?._id || '',
    }),
    enabled: !!user?._id,
  });

  // Handle loading states
  if (userLoading) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-6">
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-lg" />
        </div>
      </div>
    );
  }

  // Handle user not found
  if (userError || !user) {
    throw notFound();
  }

  const isCurrentUser = currentUser?._id === user._id;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <ProfileHeader isCurrentUser={isCurrentUser} user={user} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <ProfileStats isLoading={statsLoading} userStats={userStats} />
        </div>

        <div className="lg:col-span-2">
          <ProfileReviews
            error={reviewsError}
            isCurrentUser={isCurrentUser}
            isLoading={reviewsLoading}
            userReviews={userReviews}
          />
        </div>
      </div>
    </div>
  );
}
