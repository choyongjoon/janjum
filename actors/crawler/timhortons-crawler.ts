import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  privateDecrypt,
} from "node:crypto";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { mapWithConcurrency } from "./httpUtils";

// The site is a client-rendered app whose JSON API (bizMOB) encrypts every
// request and response. Each run does the same anonymous handshake the
// website does: send an RSA public key, receive an AES key and a bearer
// token, then AES-encrypt each call. No login is involved.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.tim-hortons.co.kr",
  apiUrl: "https://www.tim-hortons.co.kr/timhortons",
} as const;

const TR = {
  handshake: "BM4001",
  categories: "TH0309",
  menuList: "TH0305",
  menuDetail: "TH0306",
  nutrition: "TH0308",
} as const;

// 추천메뉴 and Maple Festa cross-list items from the other categories,
// 밴프 시그니처 is hidden by the site, 팀스 세트 are combos of other items and
// 상품 is merchandise (goods, beans, candy, syrup).
const SKIPPED_CATEGORIES = new Set([
  "00000000",
  "07000000",
  "08000000",
  "98000000",
  "99000000",
]);

// 커피, 음료, 아이스캡; serving sizes elsewhere are grams
const DRINK_CATEGORIES = new Set(["01000000", "02000000", "03000000"]);

// The site hides list rows with this display code (e.g. a store-only
// 2000원 블랙커피)
const HIDDEN_DISPLAY_CD = "4";

// Combos such as "보늬밤 크림 도넛 SET" are listed under 도넛 and 디저트 with
// set_yn "4". Other set_yn values are normal items (most 아이스캡 drinks
// have one), so only this value is skipped.
const COMBO_SET_YN = "4";
const COMBO_NAME_REGEX = /\bSET$/i;

// Multi-packs (도넛 6팩, 더즌팩, 팀빗 20p, 파운드(홀)) repeat single items
// with whole-pack nutrition of up to ~2,900 kcal
const PACK_NAME_REGEX = /(?:\d+팩|더즌팩|\d+\s*p|\(홀\))$/i;

// Drinks list one nutrition row per size (S, M, L, X) and others one row
// with "N". Pick the no-size row, else Medium, the default cup.
const SIZE_PREFERENCE = ["N", "M", "S", "L", "X"] as const;

const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const REQUEST_TIMEOUT_MS = 20_000;
const CONCURRENCY = 2;
const RSA_MODULUS_LENGTH = 512;
const AES_IV_LENGTH = 16;

// ================================================
// REGEX PATTERNS
// ================================================

const PEM_ARMOR_REGEX = /-----[A-Z ]+-----/g;
const WHITESPACE_REGEX = /\s+/g;
const PLUS_REGEX = /\+/g;
const SLASH_REGEX = /\//g;
const EQUALS_REGEX = /=/g;
const COMMA_REGEX = /,/g;
// Values look like "9.7 ", "1,610.8", "-" or "". An upper bound such as
// "<1.0" is left out rather than stored as a made-up exact value.
const NUMBER_REGEX = /^\d[\d,]*(?:\.\d+)?/;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

// ================================================
// TYPES
// ================================================

interface ApiHeader {
  error_code: string;
  error_text: string;
  result: boolean;
}

interface ApiResponse<T> {
  body: T;
  header: ApiHeader;
}

interface Session {
  cookies: Map<string, string>;
  iv: Buffer;
  key: Buffer;
  token: string;
}

interface Category {
  category_cd: string;
  category_nm: string;
}

interface ListItem {
  menu_cd: string;
  menu_display_cd: string;
  menu_nm: string;
  set_yn: string;
}

interface MenuGroup {
  menu_list: ListItem[] | null;
}

interface MenuDetail {
  cover_menu_list?: MenuDetail[] | null;
  menu_cd: string;
  menu_class_cd1: string;
  menu_class_cd1_nm: string;
  menu_class_cd2_nm: string;
  menu_desc2: string | null;
  menu_en_nm: string | null;
  menu_img_path: string;
  menu_nm: string;
  menu_price: string | null;
}

type NutritionValue = string | null;

interface NutritionRow {
  caffein: NutritionValue;
  calory: NutritionValue;
  natrium: NutritionValue;
  protein: NutritionValue;
  satufat: NutritionValue;
  size_cd: string;
  sugars: NutritionValue;
  weight: NutritionValue;
}

// ================================================
// API CLIENT
// ================================================

function envelope(trcode: string, body: object): string {
  return JSON.stringify({
    header: {
      result: true,
      error_code: "",
      error_text: "",
      info_text: "web",
      message_version: "",
      login_session_id: "",
      trcode,
      // Without these two the menu calls fail with TH03059001
      cd_call_chnn: "01",
      acquisition_path: "B",
    },
    body,
  });
}

function keepCookies(session: Pick<Session, "cookies">, response: Response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    if (index > 0) {
      session.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function post(
  trcode: string,
  form: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<Response> {
  const response = await fetch(`${SITE_CONFIG.apiUrl}/${trcode}.json`, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": FORM_CONTENT_TYPE,
      ...headers,
    },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${trcode}: HTTP ${response.status}`);
  }
  return response;
}

function assertOk<T>(trcode: string, response: ApiResponse<T>): T {
  if (!response.header?.result) {
    throw new Error(
      `${trcode} failed: ${response.header?.error_code} ${response.header?.error_text}`
    );
  }
  return response.body;
}

// Strips PKCS#1 v1.5 padding (00 02 <random non-zero> 00 <data>). Node
// refuses RSA_PKCS1_PADDING for decryption, so it is removed by hand.
function unpadPkcs1(block: Buffer): Buffer {
  const separator = block.indexOf(0, 2);
  if (block[0] !== 0 || block[1] !== 2 || separator < 0) {
    throw new Error("Unexpected RSA padding in handshake response");
  }
  return block.subarray(separator + 1);
}

async function handshake(): Promise<Session> {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: RSA_MODULUS_LENGTH,
  });
  // The server expects the SPKI key as URL-safe base64 with "." padding
  const cryPbKey = publicKey
    .export({ type: "spki", format: "pem" })
    .toString()
    .replace(PEM_ARMOR_REGEX, "")
    .replace(WHITESPACE_REGEX, "")
    .replace(PLUS_REGEX, "-")
    .replace(SLASH_REGEX, "_")
    .replace(EQUALS_REGEX, ".");

  const response = await post(TR.handshake, {
    message: envelope(TR.handshake, { cryPbKey }),
  });
  const cookies = new Map<string, string>();
  keepCookies({ cookies }, response);
  const body = assertOk(
    TR.handshake,
    (await response.json()) as ApiResponse<{
      cryAuthToken: string;
      crySymKey: string;
    }>
  );

  const decrypted = privateDecrypt(
    { key: privateKey, padding: constants.RSA_NO_PADDING },
    Buffer.from(body.crySymKey, "base64")
  );
  // The symmetric key is a base64 string: it decodes to the 16-byte AES key
  // and its first 16 characters are the IV
  const symKey = unpadPkcs1(decrypted).toString("utf8");

  return {
    cookies,
    key: Buffer.from(symKey, "base64"),
    iv: Buffer.from(symKey.slice(0, AES_IV_LENGTH), "utf8"),
    token: body.cryAuthToken,
  };
}

async function call<T>(
  session: Session,
  trcode: string,
  body: object
): Promise<T> {
  const cipher = createCipheriv("aes-128-cbc", session.key, session.iv);
  const message = Buffer.concat([
    cipher.update(envelope(trcode, body), "utf8"),
    cipher.final(),
  ]).toString("base64");

  const response = await post(
    trcode,
    { message, isCrypto: "true" },
    {
      "BzCrypto-Authorization": `BEAR ${session.token}`,
      Cookie: cookieHeader(session.cookies),
    }
  );
  keepCookies(session, response);

  const json = (await response.json()) as
    | { resMessage: string }
    | ApiResponse<T>;
  // Errors come back unencrypted
  if (!("resMessage" in json)) {
    return assertOk(trcode, json);
  }
  const decipher = createDecipheriv("aes-128-cbc", session.key, session.iv);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(json.resMessage, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return assertOk(trcode, JSON.parse(plain) as ApiResponse<T>);
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(value: NutritionValue): number | undefined {
  const match = value?.trim().match(NUMBER_REGEX);
  return match
    ? Number.parseFloat(match[0].replace(COMMA_REGEX, ""))
    : undefined;
}

function pickNutritionRow(rows: NutritionRow[]): NutritionRow | undefined {
  for (const size of SIZE_PREFERENCE) {
    const row = rows.find((candidate) => candidate.size_cd === size);
    if (row) {
      return row;
    }
  }
  return rows[0];
}

function toNutritions(
  rows: NutritionRow[] | null | undefined,
  servingSizeUnit: string
): Nutritions | null {
  const row = pickNutritionRow(rows ?? []);
  // A range ("253~444" kcal) comes with zeros for every other nutrient, so
  // the row is not trusted at all
  if (!row || [row.weight, row.calory].some((v) => v?.includes("~"))) {
    return null;
  }

  const fields: [keyof Nutritions, NutritionValue, string][] = [
    ["servingSize", row.weight, servingSizeUnit],
    ["calories", row.calory, "kcal"],
    ["sugar", row.sugars, "g"],
    ["protein", row.protein, "g"],
    ["saturatedFat", row.satufat, "g"],
    ["natrium", row.natrium, "mg"],
    ["caffeine", row.caffein, "mg"],
  ];

  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;
  for (const [key, raw, unit] of fields) {
    const value = parseNumber(raw);
    if (value !== undefined) {
      record[key] = value;
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  }
  return hasValue ? nutritions : null;
}

function clean(text: string | null | undefined): string {
  return (text ?? "").replace(WHITESPACE_REGEX, " ").trim();
}

// Subcategories are specific enough on their own: "브루 커피", "커피 아이스캡",
// "티베이스 음료", "도넛"
function externalCategory(detail: MenuDetail): string {
  return clean(detail.menu_class_cd2_nm) || clean(detail.menu_class_cd1_nm);
}

function isFood(detail: MenuDetail): boolean {
  return !DRINK_CATEGORIES.has(detail.menu_class_cd1);
}

function isCrawled(item: ListItem): boolean {
  const name = clean(item.menu_nm);
  return (
    item.menu_display_cd !== HIDDEN_DISPLAY_CD &&
    item.set_yn !== COMBO_SET_YN &&
    !COMBO_NAME_REGEX.test(name) &&
    !PACK_NAME_REGEX.test(name)
  );
}

// ================================================
// CRAWLING
// ================================================

async function fetchMenuCodes(session: Session): Promise<string[]> {
  const categories = await call<{ result_data: Category[] }>(
    session,
    TR.categories,
    {}
  );
  const crawled = categories.result_data.filter(
    (category) => !SKIPPED_CATEGORIES.has(category.category_cd)
  );

  const groupsByCategory = await mapWithConcurrency(
    crawled,
    CONCURRENCY,
    (category) =>
      call<{ result_data: MenuGroup[] }>(session, TR.menuList, {
        id_member: "",
        menu_class_cd: category.category_cd,
        stor_cd: "",
      })
  );

  const codes = new Set<string>();
  for (const [index, groups] of groupsByCategory.entries()) {
    let count = 0;
    for (const group of groups.result_data) {
      for (const item of group.menu_list ?? []) {
        if (isCrawled(item)) {
          codes.add(item.menu_cd);
          count += 1;
        }
      }
    }
    logger.info(`📋 ${clean(crawled[index].category_nm)}: ${count} products`);
  }

  const list = [...codes];
  return isTestMode ? list.slice(0, maxProductsInTestMode) : list;
}

// A "cover" item (e.g. 더블더블) wraps its hot and iced versions, which are
// separate menus with their own code, price and nutrition. The cover itself
// has no nutrition, so its versions are crawled instead.
async function fetchMenus(
  session: Session,
  codes: string[]
): Promise<MenuDetail[]> {
  const details = await mapWithConcurrency(codes, CONCURRENCY, (menuCd) =>
    call<{ result_data: MenuDetail[] }>(session, TR.menuDetail, {
      menu_cd: menuCd,
      id_member: "",
      stor_cd: "",
    })
  );

  const menus = new Map<string, MenuDetail>();
  for (const { result_data } of details) {
    for (const detail of result_data) {
      const versions = detail.cover_menu_list?.length
        ? detail.cover_menu_list
        : [detail];
      for (const version of versions) {
        menus.set(version.menu_cd, version);
      }
    }
  }
  return [...menus.values()];
}

async function toProduct(
  session: Session,
  detail: MenuDetail
): Promise<Product> {
  const { nutrition_info } = await call<{
    nutrition_info: NutritionRow[] | null;
  }>(session, TR.nutrition, { menu_cd: detail.menu_cd, stor_cd: "" });
  const nutritions = toNutritions(nutrition_info, isFood(detail) ? "g" : "ml");
  const name = clean(detail.menu_nm);
  const price = Number.parseInt(detail.menu_price ?? "", 10);

  logger.info(
    `✅ Extracted: ${name} (id: ${detail.menu_cd})${nutritions ? " with nutrition data" : ""}`
  );

  return {
    name,
    nameEn: clean(detail.menu_en_nm) || null,
    description: clean(detail.menu_desc2) || null,
    price: Number.isNaN(price) ? null : price,
    externalImageUrl: detail.menu_img_path,
    category: null,
    externalCategory: externalCategory(detail),
    externalId: `timhortons_${detail.menu_cd}`,
    // Details open in an overlay; link the category list instead
    externalUrl: `${SITE_CONFIG.baseUrl}/ORD0101/${detail.menu_class_cd1}`,
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runTimhortonsCrawler = async () => {
  try {
    const session = await handshake();
    const codes = await fetchMenuCodes(session);
    const menus = await fetchMenus(session, codes);
    logger.info(`Fetching nutrition for ${menus.length} menus`);
    const products = await mapWithConcurrency(menus, CONCURRENCY, (menu) =>
      toProduct(session, menu)
    );
    logger.info(`Found ${products.length} products`);
    await writeProductsToJson(products, "timhortons");
  } catch (error) {
    logger.error("Tim Hortons crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTimhortonsCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
