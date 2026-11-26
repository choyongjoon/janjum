import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import { logger } from "../../shared/logger";
import { fetchText } from "./httpUtils";

// Most cafe sites publish no prices. SK planet's 기프티콘 (gifticon.com) sells
// each brand's official mobile vouchers for single menu items at list price,
// so its brand pages (server-rendered, allowed by its robots.txt) fill in the
// prices a crawler could not find. Only items that map to one menu item are
// used: bundles, sets and cash vouchers are skipped.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const BRAND_PAGE_URL =
  "https://www.gifticon.com/shopping/shopping_brandview.do";

// Cafe slug -> gifticon brand page id and the brand prefixes on item names
const GIFTICON_BRANDS: Record<
  string,
  { prodDispId: string; prefixes: string[] }
> = {
  coffeebean: { prodDispId: "FS0016", prefixes: ["커피빈"] },
  compose: { prodDispId: "FS001536", prefixes: ["컴포즈커피"] },
  ediya: { prodDispId: "FS001355", prefixes: ["이디야커피"] },
  hollys: { prodDispId: "FS000622", prefixes: ["할리스"] },
  mega: { prodDispId: "FS001469", prefixes: ["메가MGC커피"] },
  oozy: { prodDispId: "FS001532", prefixes: ["우지커피"] },
  starbucks: { prodDispId: "FS0014", prefixes: ["스타벅스"] },
  tomntoms: { prodDispId: "FS0018", prefixes: ["탐앤탐스"] },
  twosome: { prodDispId: "FS0017", prefixes: ["투썸플레이스", "투썸"] },
};

// gifticon refuses connections from GitHub's runners, so CI crawls read the
// voucher lists saved here (`pnpm gifticon:snapshot` refreshes it from a
// machine that can reach the site). Other runs read the site and fall back to
// this file if it can't be reached.
const SNAPSHOT_PATH = path.join(
  process.cwd(),
  "actors",
  "crawler",
  "gifticon-vouchers.json"
);

// Safety net in case the brand page ever stops running out of items
const MAX_PAGES = 40;

// ================================================
// REGEX PATTERNS
// ================================================

const ORIGINAL_PRICE_REGEX = /할인전\s*([\d,]+)\s*원/;
const PRICE_REGEX = /([\d,]+)\s*원/;
const COMMA_REGEX = /,/g;
const WHITESPACE_REGEX = /\s+/g;

// Items that are not a single menu item: sets, bundles ("A + B", "... 2잔",
// "카페라떼 (S) 2"), cash vouchers ("1만원권", "기프티카드") and goods
const NOT_SINGLE_ITEM_REGEX =
  /세트|\+|\d\s*잔|[\s)]2$|권(\s|\(|$)|기프티카드|교환권|텀블러|원두MD/;

// "(TAKE-OUT)" on 컴포즈 vouchers says nothing about the drink
const TAKEOUT_REGEX = /\(TAKE-OUT\)/gi;
// "(ICE/HOT)" or "(HOT/ICE)": the voucher covers both
const BOTH_TEMPERATURES_REGEX = /\((?:ICE\/HOT|HOT\/ICE)\)/gi;
// "(ICE)", "(Hot)", "(OnlyIce)", "(Only Hot)", "ICED", "HOT"
const HOT_REGEX = /\((?:only\s*)?hot\)|(?<![A-Za-z])HOT(?![A-Za-z])/gi;
const ICE_REGEX =
  /\((?:only\s*)?ice[d]?\)|(?<![A-Za-z])ICED?(?![A-Za-z])|^아이스\s+/gi;
// 컴포즈 menu names: "H-카푸치노", "I-돌체라떼"
const COMPOSE_TEMPERATURE_REGEX = /^([HI])-/;
// Mega external ids: "mega_ICE_카페라떼"
const EXTERNAL_ID_TEMPERATURE_REGEX = /_(HOT|ICE)_/;
// Leading size on 이디야 menu names: "(L) ICED 카페 라떼", "(EX) HOT 아메리카노"
const LEADING_SIZE_REGEX = /^\((L|EX|R|S|T|G)\)\s*/i;
// Trailing size: "카페 라떼T", "아메리카노 (S)", "아이스 아메리카노 MAX"
const TRAILING_SIZE_REGEX = /\s*\(?(MAX|EX|T|S|R|L|G)\)?$/;
const KEY_STRIP_REGEX = /[\s()[\]®·.,&'"-]/g;

// Sizes that are a cafe's smallest or only cup: used when the menu item
// itself names no size
const BASE_SIZES = new Set<string | null>([null, "T", "S", "R"]);

// ================================================
// TYPES
// ================================================

type Temperature = "HOT" | "ICE" | null;

export interface ParsedName {
  key: string;
  size: string | null;
  temperature: Temperature;
}

export interface GifticonItem {
  name: string;
  price: number;
}

export interface GifticonSnapshot {
  brands: Record<string, GifticonItem[]>;
  fetchedAt: string;
}

// The fields of a crawled product this step reads and writes
interface PricedProduct {
  externalId: string;
  name: string;
  price: number | null;
}

// ================================================
// NAME PARSING
// ================================================

function toKey(name: string): string {
  return name.replace(KEY_STRIP_REGEX, "").toLowerCase();
}

function extractTemperature(name: string): {
  rest: string;
  temperature: Temperature;
} {
  let rest = name;
  let temperature: Temperature = null;

  const compose = rest.match(COMPOSE_TEMPERATURE_REGEX);
  if (compose) {
    temperature = compose[1] === "H" ? "HOT" : "ICE";
    rest = rest.replace(COMPOSE_TEMPERATURE_REGEX, "");
  }
  if (HOT_REGEX.test(rest)) {
    temperature = "HOT";
  }
  HOT_REGEX.lastIndex = 0;
  if (ICE_REGEX.test(rest)) {
    temperature = "ICE";
  }
  ICE_REGEX.lastIndex = 0;

  rest = rest.replace(HOT_REGEX, " ").replace(ICE_REGEX, " ").trim();
  return { rest, temperature };
}

function extractSize(name: string): { rest: string; size: string | null } {
  let rest = name.trim();
  let size: string | null = null;

  const leading = rest.match(LEADING_SIZE_REGEX);
  if (leading) {
    size = leading[1].toUpperCase();
    rest = rest.replace(LEADING_SIZE_REGEX, "");
  }
  const trailing = rest.match(TRAILING_SIZE_REGEX);
  // A lone letter is only a size when something precedes it
  if (trailing && trailing.index !== undefined && trailing.index > 0) {
    size = trailing[1].toUpperCase();
    rest = rest.slice(0, trailing.index);
  }
  return { rest: rest.trim(), size };
}

function parseName(name: string): ParsedName {
  const cleaned = name
    .replace(TAKEOUT_REGEX, " ")
    .replace(BOTH_TEMPERATURES_REGEX, " ");
  const { rest: noSize, size } = extractSize(cleaned);
  const { rest, temperature } = extractTemperature(noSize);
  // Sizes can also follow the temperature: "HOT 아메리카노 R"
  const resized = size ? { rest, size } : extractSize(rest);
  return { key: toKey(resized.rest), size: resized.size, temperature };
}

export function parseVoucherName(
  name: string,
  prefixes: readonly string[]
): ParsedName | null {
  let rest = name.trim();
  for (const prefix of prefixes) {
    if (rest.startsWith(prefix)) {
      rest = rest.slice(prefix.length).trim();
      break;
    }
  }
  if (!rest || NOT_SINGLE_ITEM_REGEX.test(rest)) {
    return null;
  }
  const parsed = parseName(rest);
  return parsed.key ? parsed : null;
}

export function parseProductName(product: PricedProduct): ParsedName {
  const parsed = parseName(product.name);
  if (parsed.temperature) {
    return parsed;
  }
  const fromId = product.externalId.match(EXTERNAL_ID_TEMPERATURE_REGEX);
  return {
    ...parsed,
    temperature: fromId ? (fromId[1] as Temperature) : null,
  };
}

// ================================================
// MATCHING
// ================================================

interface ParsedVoucher extends ParsedName {
  price: number;
}

function isCompatible(product: ParsedName, voucher: ParsedVoucher): boolean {
  if (product.key !== voucher.key) {
    return false;
  }
  if (
    product.temperature &&
    voucher.temperature &&
    product.temperature !== voucher.temperature
  ) {
    return false;
  }
  // A sized menu item (이디야 "(L) ...") needs that exact size; otherwise only
  // the smallest cup counts, so the price is the "from" price
  return product.size
    ? voucher.size === product.size
    : BASE_SIZES.has(voucher.size);
}

export function findPrice(
  product: PricedProduct,
  vouchers: readonly ParsedVoucher[]
): number | null {
  const parsed = parseProductName(product);
  let best: number | null = null;
  for (const voucher of vouchers) {
    if (
      isCompatible(parsed, voucher) &&
      (best === null || voucher.price < best)
    ) {
      best = voucher.price;
    }
  }
  return best;
}

export function applyVoucherPrices<T extends PricedProduct>(
  products: T[],
  items: readonly GifticonItem[],
  prefixes: readonly string[]
): { matched: number; products: T[] } {
  const vouchers: ParsedVoucher[] = [];
  for (const item of items) {
    const parsed = parseVoucherName(item.name, prefixes);
    if (parsed) {
      vouchers.push({ ...parsed, price: item.price });
    }
  }

  let matched = 0;
  const priced = products.map((product) => {
    if (product.price !== null) {
      return product;
    }
    const price = findPrice(product, vouchers);
    if (price === null) {
      return product;
    }
    matched += 1;
    return { ...product, price };
  });
  return { matched, products: priced };
}

// ================================================
// FETCHING
// ================================================

function parsePrice(text: string): number | null {
  // A discounted voucher shows "할인전 10,000원 할인후 8,700원"; the list
  // price is the one before the discount
  const match = text.match(ORIGINAL_PRICE_REGEX) ?? text.match(PRICE_REGEX);
  if (!match) {
    return null;
  }
  const price = Number.parseInt(match[1].replace(COMMA_REGEX, ""), 10);
  return Number.isNaN(price) || price <= 0 ? null : price;
}

export function parseBrandPage(html: string): GifticonItem[] {
  const $ = load(html);
  const items: GifticonItem[] = [];
  $("li").each((_, element) => {
    const item = $(element);
    const name = item.find(".prod_name_2").first().attr("title")?.trim();
    if (!name) {
      return;
    }
    const price = parsePrice(item.text().replace(WHITESPACE_REGEX, " "));
    if (price !== null) {
      items.push({ name, price });
    }
  });
  return items;
}

export const GIFTICON_CAFES = Object.keys(GIFTICON_BRANDS);

export async function fetchGifticonVouchers(
  cafeSlug: string
): Promise<GifticonItem[]> {
  const brand = GIFTICON_BRANDS[cafeSlug];
  if (!brand) {
    throw new Error(`${cafeSlug} is not sold on gifticon`);
  }
  const byName = new Map<string, GifticonItem>();
  let page = 1;
  // Pages must be read in order: past the last page the site repeats it
  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      prodDispId: brand.prodDispId,
      pageNumber: String(page),
    });
    const pageItems = parseBrandPage(
      await fetchText(`${BRAND_PAGE_URL}?${params}`)
    );
    const before = byName.size;
    for (const item of pageItems) {
      if (!byName.has(item.name)) {
        byName.set(item.name, item);
      }
    }
    if (byName.size === before) {
      break;
    }
    page += 1;
  }
  if (byName.size === 0) {
    throw new Error(`No gifticon vouchers found for ${cafeSlug}`);
  }
  return [...byName.values()];
}

export function writeGifticonSnapshot(snapshot: GifticonSnapshot): string {
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  return SNAPSHOT_PATH;
}

function readSnapshotItems(cafeSlug: string): GifticonItem[] {
  const snapshot = JSON.parse(
    fs.readFileSync(SNAPSHOT_PATH, "utf8")
  ) as GifticonSnapshot;
  const items = snapshot.brands[cafeSlug];
  if (!items?.length) {
    throw new Error(`No saved gifticon vouchers for ${cafeSlug}`);
  }
  logger.info(
    `💰 gifticon: using ${items.length} vouchers saved ${snapshot.fetchedAt}`
  );
  return items;
}

async function loadVouchers(cafeSlug: string): Promise<GifticonItem[]> {
  if (process.env.GITHUB_ACTIONS === "true") {
    return readSnapshotItems(cafeSlug);
  }
  try {
    return await fetchGifticonVouchers(cafeSlug);
  } catch (error) {
    logger.warn(`⚠️ gifticon unreachable, using saved vouchers: ${error}`);
    return readSnapshotItems(cafeSlug);
  }
}

/**
 * Fills in `price` from gifticon vouchers for products the crawler found no
 * price for. Cafes not sold on gifticon are returned unchanged. Throws when
 * neither the site nor the saved vouchers can be read, so a bad day can't
 * wipe stored prices.
 */
export async function addGifticonPrices<T extends PricedProduct>(
  products: T[],
  cafeSlug: string
): Promise<T[]> {
  const brand = GIFTICON_BRANDS[cafeSlug];
  if (!brand || products.every((product) => product.price !== null)) {
    return products;
  }

  const items = await loadVouchers(cafeSlug);
  const { matched, products: priced } = applyVoucherPrices(
    products,
    items,
    brand.prefixes
  );
  logger.info(
    `💰 gifticon: ${matched} of ${products.length} products priced from ${items.length} vouchers`
  );
  return priced;
}
