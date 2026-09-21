import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// The drink and bakery pages load their products in pages of 8 from
// ajax_brand.php, which returns server-rendered cards with each product's
// nutrition, so the endpoint is paged through directly instead of clicking
// "더보기" in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://ediya.com",
  listUrl: "https://ediya.com/inc/ajax_brand.php",
} as const;

// Each menu page and the product_cate its list endpoint takes
const MENU_PAGES = [
  {
    url: "https://ediya.com/contents/drink.html",
    productCate: "7",
    category: "Drinks",
  },
  {
    url: "https://ediya.com/contents/bakery.html",
    productCate: "8",
    category: null,
  },
] as const;

type MenuPage = (typeof MENU_PAGES)[number];

const SELECTORS = {
  categoryCheckboxes: 'input[name="chkList"]',
  // The endpoint returns bare <li> cards, which end up directly in <body>
  productContainers: "body > li",
  name: ".menu_tt > a > span",
  nameEn: "div.detail_con > h2 > span",
  description: ".detail_txt",
  image: "> a > img",
  size: ".pro_comp .pro_size",
  nutritionItems: ".pro_comp .pro_nutri dl",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const GIFT_SUFFIX_REGEX = /\s*선물하기\s*$/;
// "컵용량 : 520ml", "컵용량 : 318g", "중량 : 90g"
const SERVING_SIZE_REGEX = /([\d,]+(?:\.\d+)?)\s*(ml|g)\b/i;
// "(501kcal)", "(1,020mg)"
const NUTRITION_VALUE_REGEX = /\(([\d,]*\.?\d+)\s*(?:kcal|g|mg)\)/;
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
  concurrency: 4,
  // Safety net in case a category ever keeps returning products
  maxPages: 50,
} as const;

// ================================================
// TYPES
// ================================================

interface Category {
  // Coarse category the categorizer refines; drinks were always "Drinks"
  category: string | null;
  menuUrl: string;
  name: string;
  productCate: string;
  value: string;
}

type NutrientKey =
  | "calories"
  | "sugar"
  | "protein"
  | "saturatedFat"
  | "natrium"
  | "caffeine";

const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["칼로리", "calories", "kcal"],
  ["당류", "sugar", "g"],
  ["단백질", "protein", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["나트륨", "natrium", "mg"],
  ["카페인", "caffeine", "mg"],
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(value: string): number {
  return Number.parseFloat(value.replace(COMMA_REGEX, ""));
}

function extractNutritionData(
  $: CheerioAPI,
  container: ReturnType<CheerioAPI>
): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;

  const size = container.find(SELECTORS.size).text().match(SERVING_SIZE_REGEX);
  if (size) {
    nutritions.servingSize = parseNumber(size[1]);
    nutritions.servingSizeUnit = size[2].toLowerCase();
  }

  container.find(SELECTORS.nutritionItems).each((_, item) => {
    const label = $(item).find("dt").text().trim();
    const nutrient = NUTRIENT_LABELS.find(([prefix]) => label.includes(prefix));
    const value = $(item).find("dd").text().match(NUTRITION_VALUE_REGEX);
    if (nutrient && value) {
      const [, key, unit] = nutrient;
      record[key] = parseNumber(value[1]);
      record[`${key}Unit`] = unit;
    }
  });

  return Object.keys(nutritions).length > 0 ? nutritions : null;
}

async function fetchCategories(menuPage: MenuPage): Promise<Category[]> {
  const $ = load(await fetchText(menuPage.url));
  return $(SELECTORS.categoryCheckboxes)
    .toArray()
    .map((checkbox) => {
      const input = $(checkbox);
      const label = input.closest("label").length
        ? input.closest("label")
        : input.parent();
      return {
        category: menuPage.category,
        menuUrl: menuPage.url,
        name: label.text().trim(),
        productCate: menuPage.productCate,
        value: input.attr("value") ?? "",
      };
    })
    .filter(({ name, value }) => name && value);
}

function parseProducts($: CheerioAPI, category: Category): Product[] {
  const products: Product[] = [];

  $(SELECTORS.productContainers).each((_, element) => {
    const container = $(element);
    const name = container
      .find(SELECTORS.name)
      .first()
      .text()
      .trim()
      .replace(GIFT_SUFFIX_REGEX, "");
    if (!name) {
      return;
    }

    const src = container.find(SELECTORS.image).first().attr("src") ?? "";
    let imageUrl = "";
    if (src.startsWith("/")) {
      imageUrl = `${SITE_CONFIG.baseUrl}${src}`;
    } else if (src.startsWith("http")) {
      imageUrl = src;
    } else if (src) {
      imageUrl = `${SITE_CONFIG.baseUrl}/${src}`;
    }

    products.push({
      name,
      nameEn: container.find(SELECTORS.nameEn).first().text().trim() || null,
      description:
        container.find(SELECTORS.description).first().text().trim() || null,
      price: null,
      externalImageUrl: imageUrl,
      category: category.category,
      externalCategory: category.name,
      externalId: `ediya_${category.name}_${name}`,
      externalUrl: `${category.menuUrl}?chked_val=${category.value},&skeyword=#blockcate`,
      nutritions: extractNutritionData($, container),
    });
  });

  return products;
}

async function crawlCategory(category: Category): Promise<Product[]> {
  const products: Product[] = [];

  try {
    for (let page = 1; page <= CRAWLER_CONFIG.maxPages; page++) {
      const params = new URLSearchParams({
        gubun: "menu_more",
        product_cate: category.productCate,
        chked_val: `${category.value},`,
        skeyword: "",
        page: String(page),
      });
      const $ = load(await fetchText(`${SITE_CONFIG.listUrl}?${params}`));
      const pageProducts = parseProducts($, category);
      if (pageProducts.length === 0) {
        break;
      }
      products.push(...pageProducts);
    }
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
  }

  logger.info(`📋 ${category.name}: ${products.length} products`);
  return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runEdiyaCrawler = async () => {
  try {
    const categories = (
      await Promise.all(MENU_PAGES.map(fetchCategories))
    ).flat();
    if (categories.length === 0) {
      throw new Error("No menu categories found");
    }
    const selected = isTestMode ? categories.slice(0, 1) : categories;

    const perCategory = await mapWithConcurrency(
      selected,
      CRAWLER_CONFIG.concurrency,
      crawlCategory
    );

    // A category never lists the same product twice under one id
    const seen = new Set<string>();
    const products = perCategory.flat().filter(({ externalId }) => {
      if (seen.has(externalId)) {
        return false;
      }
      seen.add(externalId);
      return true;
    });

    for (const product of products) {
      logger.info(
        `✅ Extracted: ${product.name}${product.nutritions ? " with nutrition data" : ""}`
      );
    }
    await writeProductsToJson(products, "ediya");
  } catch (error) {
    logger.error("Ediya crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runEdiyaCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
