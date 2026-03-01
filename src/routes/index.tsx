import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BrandCafeListSection } from '~/components/BrandCafeListSection';
import {
  NewProductsSection,
  recentProductsQueryOptions,
} from '~/components/NewProductsSection';
import { api } from '../../convex/_generated/api';
import { seo } from '../utils/seo';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async (opts) => {
    await Promise.all([
      opts.context.queryClient.ensureQueryData(convexQuery(api.cafes.list, {})),
      opts.context.queryClient.ensureQueryData(recentProductsQueryOptions),
    ]);
  },
  head: () => ({
    meta: [
      ...seo({
        title: '잔점',
        description:
          '카페 음료의 모든 것을 한곳에서! 다양한 카페의 음료 정보와 후기를 확인하세요.',
        image: '/android-chrome-512x512.png',
        keywords: '카페, 음료, 후기, 커피, 차, 잔점',
      }),
    ],
  }),
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

      <NewProductsSection />
      <BrandCafeListSection cafes={cafes} />
    </div>
  );
}
