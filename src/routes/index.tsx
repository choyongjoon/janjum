import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { BrandCafeListSection } from "~/components/BrandCafeListSection";
import { SearchIcon } from "~/components/icons/SearchIcon";
import {
  NewProductsSection,
  recentProductsQueryOptions,
} from "~/components/NewProductsSection";
import { api } from "../../convex/_generated/api";
import { seo } from "../utils/seo";

export const Route = createFileRoute("/")({
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
        title: "잔점",
        description:
          "카페 음료의 모든 것을 한곳에서! 다양한 카페의 음료 정보와 후기를 확인하세요.",
        image: "/android-chrome-512x512.png",
        keywords: "카페, 음료, 후기, 커피, 차, 잔점",
      }),
    ],
  }),
});

function Home() {
  const { data: cafes } = useSuspenseQuery(convexQuery(api.cafes.list, {}));
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSearchTerm = searchTerm.trim();
    if (!trimmedSearchTerm) {
      return;
    }
    navigate({
      to: "/search",
      search: { searchTerm: trimmedSearchTerm },
    });
  };

  return (
    <div className="min-h-screen bg-base-200">
      {/* Hero Section */}
      <div className="hero bg-gradient-to-b from-primary to-secondary py-6 text-primary-content">
        <div className="hero-content w-full max-w-md flex-col gap-4 text-center">
          <div>
            <h1 className="font-bold font-sunflower text-4xl">잔점</h1>
            <p className="mt-2">카페 음료의 모든 것을 한곳에서!</p>
          </div>
          <form className="join w-full" onSubmit={handleSearchSubmit}>
            <input
              aria-label="음료명 검색"
              className="input join-item flex-1 text-base-content"
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="음료명을 검색해보세요"
              type="search"
              value={searchTerm}
            />
            <button className="btn btn-neutral join-item" type="submit">
              <SearchIcon size="sm" />
              검색
            </button>
          </form>
        </div>
      </div>

      <NewProductsSection />
      <BrandCafeListSection cafes={cafes} />
    </div>
  );
}
