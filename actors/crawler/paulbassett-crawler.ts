import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// List and detail pages are server-rendered, so they are fetched and parsed
// directly instead of rendered in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.baristapaulbassett.co.kr",
  listUrlTemplate: "https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=",
} as const;

const CATEGORIES = [
  { cid1: "A", name: "COFFEE", type: "Coffee" },
  { cid1: "B", name: "BEVERAGE", type: "Beverage" },
  { cid1: "C", name: "ICE-CREAM", type: "Dessert" },
  { cid1: "D", name: "FOOD", type: "Food" },
  { cid1: "E", name: "PRODUCT", type: "Product" },
] as const;

type Category = (typeof CATEGORIES)[number];

const SELECTORS = {
  productImage: 'img[src*="/upload/product/"]',
  nameContainer: ".txtArea",
  nameEn: ".txtArea .sTxt",
  description: ".menuTit dd",
  // One block per size (Standard/Grand); the first is the page default
  nutritionBlock: "#pSizeInfoLayer > div",
  servingSize: ".sizeMl",
  nutritionRow: "li",
  nutritionLabel: ".tit",
  nutritionValue: ".num",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const GO_VIEW_REGEX = /goView\s*\(\s*['"]([^'"]+)['"]\s*\)/;
const WHITESPACE_REGEX = /\s+/g;
const EXTERNAL_ID_REGEX = /[^\w-]/g;
const NUMBER_REGEX = /([\d,]+(?:\.\d+)?)/;
const COMMA_REGEX = /,/g;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

const CRAWLER_CONFIG = {
  concurrency: 5,
} as const;

// ================================================
// TYPES
// ================================================

interface ListedProduct {
  category: Category;
  dpid: string;
  imageSrc: string;
  name: string;
  nameEn: string;
}

type NutrientKey =
  | "calories"
  | "sugar"
  | "natrium"
  | "protein"
  | "saturatedFat"
  | "caffeine";

// Label prefixes of the nutrition list: 열량(kcal), 당류(g), ...
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["열량", "calories", "kcal"],
  ["당류", "sugar", "g"],
  ["나트륨", "natrium", "mg"],
  ["단백질", "protein", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["카페인", "caffeine", "mg"],
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(text: string): number | undefined {
  const match = text.match(NUMBER_REGEX);
  return match
    ? Number.parseFloat(match[1].replace(COMMA_REGEX, ""))
    : undefined;
}

function extractNutritionData($: CheerioAPI): Nutritions | null {
  const block = $(SELECTORS.nutritionBlock).first();
  if (block.length === 0) {
    return null;
  }

  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  block.find(SELECTORS.nutritionRow).each((_, row) => {
    const label = $(row).find(SELECTORS.nutritionLabel).text().trim();
    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      label.startsWith(prefix)
    );
    const value = parseNumber($(row).find(SELECTORS.nutritionValue).text());
    if (nutrient && value !== undefined) {
      const [, key, unit] = nutrient;
      record[key] = value;
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  });

  // "제공량(ml)<span>360</span>" for drinks, "제공량(g)" for food
  const sizeElement = block.find(SELECTORS.servingSize).first();
  const servingSize = parseNumber(sizeElement.find("span").text());
  if (servingSize !== undefined) {
    nutritions.servingSize = servingSize;
    nutritions.servingSizeUnit = sizeElement.text().includes("(ml)")
      ? "ml"
      : "g";
    hasValue = true;
  }

  return hasValue ? nutritions : null;
}

async function fetchCategoryProducts(
  category: Category
): Promise<ListedProduct[]> {
  const url = `${SITE_CONFIG.listUrlTemplate}${category.cid1}`;
  try {
    const $ = load(await fetchText(url));
    const products: ListedProduct[] = [];

    $("ul li").each((_, element) => {
      const item = $(element);
      const image = item.find(SELECTORS.productImage).first();
      const dpid = item
        .find("a")
        .first()
        .attr("onclick")
        ?.match(GO_VIEW_REGEX)?.[1];
      if (image.length === 0 || !dpid) {
        return;
      }

      const nameEn = item.find(SELECTORS.nameEn).first().text().trim();
      const fullName = item
        .find(SELECTORS.nameContainer)
        .first()
        .text()
        .replace(WHITESPACE_REGEX, " ")
        .trim();
      const name = nameEn ? fullName.replace(nameEn, "").trim() : fullName;
      if (name.length <= 2) {
        return;
      }

      products.push({
        category,
        dpid,
        imageSrc: image.attr("src") ?? "",
        name,
        nameEn,
      });
    });

    logger.info(`📋 ${category.name}: ${products.length} products`);
    return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
    return [];
  }
}

function slugify(text: string): string {
  return text
    .replace(WHITESPACE_REGEX, "-")
    .toLowerCase()
    .replace(EXTERNAL_ID_REGEX, "");
}

// Ids are slugs of the English name, which hot and iced variants share
// ("Cafe Mocha" / "아이스 카페 모카"). The first product in menu order keeps
// the plain slug so existing records stay matched; later ones get the dpid.
function assignExternalIds(listed: ListedProduct[]): Map<string, string> {
  const used = new Set<string>();
  const ids = new Map<string, string>();
  for (const product of listed) {
    const slug = slugify(product.nameEn || product.name);
    const id = used.has(slug) ? `${slug}-${product.dpid.toLowerCase()}` : slug;
    used.add(id);
    ids.set(product.dpid, id);
  }
  return ids;
}

async function crawlProduct(
  listed: ListedProduct,
  externalId: string
): Promise<Product> {
  const detailUrl = `${SITE_CONFIG.baseUrl}/menu/View.pb?cid1=${listed.category.cid1}&cid2=&dpid=${listed.dpid}`;
  let description = "";
  let nutritions: Nutritions | null = null;

  try {
    const $ = load(await fetchText(detailUrl));
    description = $(SELECTORS.description).first().text().trim();
    nutritions = extractNutritionData($);
  } catch (error) {
    logger.error(`❌ Detail page failed for ${listed.name}: ${error}`);
  }

  logger.info(
    `✅ Extracted [${listed.category.name}]: ${listed.name}${nutritions ? " with nutrition data" : ""}`
  );

  return {
    name: listed.name || listed.nameEn,
    nameEn: listed.nameEn || listed.name,
    description,
    externalCategory: listed.category.name,
    externalId,
    externalImageUrl: listed.imageSrc
      ? new URL(listed.imageSrc, SITE_CONFIG.baseUrl).href
      : "",
    externalUrl: detailUrl,
    price: null,
    category: listed.category.type,
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runPaulBassettCrawler = async () => {
  try {
    const perCategory = await Promise.all(
      CATEGORIES.map(fetchCategoryProducts)
    );

    // A product listed in several categories keeps the first one
    const seen = new Set<string>();
    const listed = perCategory.flat().filter(({ dpid }) => {
      if (seen.has(dpid)) {
        return false;
      }
      seen.add(dpid);
      return true;
    });
    logger.info(`Found ${listed.length} products to crawl`);

    const externalIds = assignExternalIds(listed);
    const products = await mapWithConcurrency(
      listed,
      CRAWLER_CONFIG.concurrency,
      (product) => crawlProduct(product, externalIds.get(product.dpid) ?? "")
    );

    await writeProductsToJson(products, "paulbassett");
  } catch (error) {
    logger.error("Paul Bassett crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaulBassettCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
