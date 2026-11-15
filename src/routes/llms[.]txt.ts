import { createServerFileRoute } from "@tanstack/react-start/server";
import { api } from "../../convex/_generated/api";
import {
  CRAWLER_CACHE_CONTROL,
  createServerConvexClient,
} from "../server/convexClient";
import { absoluteUrl } from "../utils/seo";

// https://llmstxt.org — a plain-language guide to the site for LLMs and agents.
export const ServerRoute = createServerFileRoute("/llms.txt").methods({
  GET: async () => {
    const client = createServerConvexClient();
    const cafes = await client.query(api.cafes.list, {});

    const cafeLines = cafes.map(
      (cafe) => `- [${cafe.name}](${absoluteUrl(`/cafe/${cafe.slug}`)})`
    );

    const body = `# 잔점 (Janjum)

> 잔점은 한국 프랜차이즈 카페 음료 정보를 한곳에 모은 사이트입니다. 각 카페 공식 홈페이지의 메뉴를 매일 수집해 음료 이름, 가격, 설명, 영양 정보(칼로리, 당류, 카페인 등), 출시일과 단종 여부를 보여주고, 사용자 별점과 후기를 함께 제공합니다.

## 페이지 구성

- [홈](${absoluteUrl("/")}): 카페 목록과 최근 출시된 음료
- [신상품](${absoluteUrl("/new")}): 최근 30일 이내에 추가된 음료를 카페별로 정리
- 카페 페이지 \`${absoluteUrl("/cafe/{slug}")}\`: 한 카페의 현재 판매 중인 전체 음료 목록
- 음료 페이지 \`${absoluteUrl("/product/{shortId}")}\`: 음료 하나의 가격, 설명, 영양 정보, 별점과 후기, 공식 사이트 링크
- 후기 페이지 \`${absoluteUrl("/review/{reviewId}")}\`: 사용자 후기 하나
- [블로그](${absoluteUrl("/blog")}): 잔점 소개와 소식
- [사이트맵](${absoluteUrl("/sitemap.xml")}): 모든 카페·음료 페이지 URL

## 카페

${cafeLines.join("\n")}

## 참고

- 데이터 출처는 각 카페 공식 홈페이지이며, 가격과 영양 정보는 매장이나 시점에 따라 다를 수 있습니다.
- 단종된 음료도 음료 페이지에 "단종" 표시와 함께 남아 있습니다.
- 문의: contact@janjum.com
`;

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": CRAWLER_CACHE_CONTROL,
      },
    });
  },
});
