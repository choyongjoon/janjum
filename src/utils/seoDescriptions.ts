import type { Doc } from "../../convex/_generated/dataModel";
import { getOrderedCategories } from "./categories";

/** Search engines cut snippets around this length; keep the facts first. */
export const MAX_DESCRIPTION_LENGTH = 155;

const WHITESPACE_PATTERN = /\s+/g;

const truncate = (text: string, maxLength = MAX_DESCRIPTION_LENGTH) => {
  const normalized = text.replace(WHITESPACE_PATTERN, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const MAX_LISTED_CATEGORIES = 4;

export const cafeTitle = (cafeName: string) =>
  `${cafeName} 메뉴·가격·칼로리 | 잔점`;

export const cafeDescription = (
  cafeName: string,
  products: Pick<Doc<"products">, "category">[]
) => {
  const categories = getOrderedCategories(
    products.flatMap((product) => (product.category ? [product.category] : []))
  )
    .filter((category) => category !== "그 외")
    .slice(0, MAX_LISTED_CATEGORIES);

  const countText = products.length > 0 ? ` ${products.length}종` : "";
  const categoryText =
    categories.length > 0 ? `(${categories.join(", ")} 등)` : "";

  return truncate(
    `${cafeName} 전체 메뉴${countText}${categoryText}의 가격, 칼로리, 당류, 카페인 등 영양 정보와 사용자 후기를 한곳에서 확인하세요.`
  );
};

type ProductForDescription = Pick<
  Doc<"products">,
  "name" | "description" | "price" | "nutritions" | "isActive"
>;

export const productTitle = (productName: string, cafeName?: string) =>
  cafeName ? `${productName} - ${cafeName} | 잔점` : `${productName} | 잔점`;

const formatNumber = (value: number) => value.toLocaleString("ko-KR");

/**
 * "스타벅스 카페 아메리카노: 4,700원 · 10kcal · 카페인 150mg. <official text>"
 * Facts people search for come first; the official description fills the rest.
 */
export const productDescription = (
  product: ProductForDescription,
  cafeName?: string
) => {
  const nutritions = product.nutritions;
  const facts = [
    product.price ? `${formatNumber(product.price)}원` : undefined,
    typeof nutritions?.calories === "number"
      ? `${formatNumber(nutritions.calories)}${nutritions.caloriesUnit || "kcal"}`
      : undefined,
    typeof nutritions?.caffeine === "number"
      ? `카페인 ${formatNumber(nutritions.caffeine)}${nutritions.caffeineUnit || "mg"}`
      : undefined,
    typeof nutritions?.sugar === "number"
      ? `당류 ${formatNumber(nutritions.sugar)}${nutritions.sugarUnit || "g"}`
      : undefined,
  ].filter(Boolean);

  const subject = `${cafeName ? `${cafeName} ` : ""}${product.name}${
    product.isActive === false ? "(단종)" : ""
  }`;
  const factText = facts.length > 0 ? `: ${facts.join(" · ")}.` : ".";
  const tail = product.description
    ? ` ${product.description}`
    : " 영양 정보와 후기를 확인하세요.";

  return truncate(`${subject}${factText}${tail}`);
};
