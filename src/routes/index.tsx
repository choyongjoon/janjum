import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BrandCafeListSection } from '~/components/BrandCafeListSection';
import { api } from '../../convex/_generated/api';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async (opts) => {
    await opts.context.queryClient.ensureQueryData(
      convexQuery(api.cafes.list, {})
    );
  },
});

function Home() {
  const { data: cafes } = useSuspenseQuery(convexQuery(api.cafes.list, {}));

  return (
    <div className="min-h-screen bg-base-200">
      {/* Hero Section */}
      <div className="hero bg-gradient-to-b from-primary to-secondary py-8 text-primary-content">
        <div className="hero-content text-center">
          <div className="max-w-md">
            <h1 className="mb-5 font-bold font-sunflower text-5xl">잔점</h1>
            <p className="mb-5 text-lg">카페 음료의 모든 것을 한곳에서!</p>
          </div>
        </div>
      </div>

      <BrandCafeListSection cafes={cafes} />
    </div>
  );
}
