import { getCACertificates, setDefaultCACertificates } from "node:tls";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText } from "./httpUtils";

// The menu pages are a client-rendered app backed by a paginated JSON API
// that already includes names, images and nutrition, so no detail pages are
// fetched.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.tomntoms.com",
  apiUrl: "https://www.tomntoms.com/api/v1/menu",
} as const;

// MD (beans, tumblers) is not food
const MENU_KINDS = [
  { kind: "drink", servingSizeUnit: "ml" },
  { kind: "food", servingSizeUnit: "g" },
] as const;

type MenuKind = (typeof MENU_KINDS)[number];

// www.tomntoms.com serves its leaf certificate without the intermediate.
// Browsers and curl on macOS fetch it themselves; Node does not and fails with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE. Trust that one public intermediate
// (GlobalSign GCC R3 DV TLS CA 2020, valid until 2029-03-18) instead of
// turning off verification. From
// http://secure.globalsign.com/cacert/gsgccr3dvtlsca2020.crt
const MISSING_INTERMEDIATE_CA = `-----BEGIN CERTIFICATE-----
MIIEsDCCA5igAwIBAgIQd70OB0LV2enQSdd00CpvmjANBgkqhkiG9w0BAQsFADBM
MSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xv
YmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0yMDA3MjgwMDAwMDBaFw0y
OTAzMTgwMDAwMDBaMFMxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWdu
IG52LXNhMSkwJwYDVQQDEyBHbG9iYWxTaWduIEdDQyBSMyBEViBUTFMgQ0EgMjAy
MDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKxnlJV/de+OpwyvCXAJ
IcxPCqkFPh1lttW2oljS3oUqPKq8qX6m7K0OVKaKG3GXi4CJ4fHVUgZYE6HRdjqj
hhnuHY6EBCBegcUFgPG0scB12Wi8BHm9zKjWxo3Y2bwhO8Fvr8R42pW0eINc6OTb
QXC0VWFCMVzpcqgz6X49KMZowAMFV6XqtItcG0cMS//9dOJs4oBlpuqX9INxMTGp
6EASAF9cnlAGy/RXkVS9nOLCCa7pCYV+WgDKLTF+OK2Vxw3RUJ/p8009lQeUARv2
UCcNNPCifYX1xIspvarkdjzLwzOdLahDdQbJON58zN4V+lMj0msg+c0KnywPIRp3
BMkCAwEAAaOCAYUwggGBMA4GA1UdDwEB/wQEAwIBhjAdBgNVHSUEFjAUBggrBgEF
BQcDAQYIKwYBBQUHAwIwEgYDVR0TAQH/BAgwBgEB/wIBADAdBgNVHQ4EFgQUDZjA
c3+rvb3ZR0tJrQpKDKw+x3wwHwYDVR0jBBgwFoAUj/BLf6guRSSuTVD6Y5qL3uLd
G7wwewYIKwYBBQUHAQEEbzBtMC4GCCsGAQUFBzABhiJodHRwOi8vb2NzcDIuZ2xv
YmFsc2lnbi5jb20vcm9vdHIzMDsGCCsGAQUFBzAChi9odHRwOi8vc2VjdXJlLmds
b2JhbHNpZ24uY29tL2NhY2VydC9yb290LXIzLmNydDA2BgNVHR8ELzAtMCugKaAn
hiVodHRwOi8vY3JsLmdsb2JhbHNpZ24uY29tL3Jvb3QtcjMuY3JsMEcGA1UdIARA
MD4wPAYEVR0gADA0MDIGCCsGAQUFBwIBFiZodHRwczovL3d3dy5nbG9iYWxzaWdu
LmNvbS9yZXBvc2l0b3J5LzANBgkqhkiG9w0BAQsFAAOCAQEAy8j/c550ea86oCkf
r2W+ptTCYe6iVzvo7H0V1vUEADJOWelTv07Obf+YkEatdN1Jg09ctgSNv2h+LMTk
KRZdAXmsE3N5ve+z1Oa9kuiu7284LjeS09zHJQB4DJJJkvtIbjL/ylMK1fbMHhAW
i0O194TWvH3XWZGXZ6ByxTUIv1+kAIql/Mt29PmKraTT5jrzcVzQ5A9jw16yysuR
XRrLODlkS1hyBjsfyTNZrmL1h117IFgntBA5SQNVl9ckedq5r4RSAU85jV8XK5UL
REjRZt2I6M9Po9QL7guFLu4sPFJpwR1sPJvubS2THeo7SxYoNDtdyBHs7euaGcMa
D/fayQ==
-----END CERTIFICATE-----`;

// ================================================
// REGEX PATTERNS
// ================================================

// Labels come with or without a unit suffix: "열량[kal]", "열량"
const LABEL_UNIT_REGEX = /\[(\w+)\]\s*$/;
const NUMBER_REGEX = /(\d[\d,]*(?:\.\d+)?)/;
const AMOUNT_UNIT_REGEX = /\d\s*(ml|g)\b/i;
const COMMA_REGEX = /,/g;
const WHITESPACE_REGEX = /\s+/g;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

// The API ignores larger page sizes; this bounds a runaway loop
const MAX_PAGES = 100;

// ================================================
// TYPES
// ================================================

interface NutritionEntry {
  amount: string;
  name: string;
}

interface MenuItem {
  category: { menu_id: string; name: string };
  description: string;
  id: number;
  image: string;
  nutritional_ingredients: NutritionEntry[] | null;
  title: string;
  titleEn: string;
}

interface MenuResponse {
  data: { elements: MenuItem[] };
  meta: { hasNextPage: boolean; total: number };
}

type NutrientKey =
  | "calories"
  | "carbohydrates"
  | "sugar"
  | "protein"
  | "fat"
  | "transFat"
  | "saturatedFat"
  | "natrium"
  | "cholesterol"
  | "caffeine";

// Units are fixed per nutrient rather than read from the label: the site
// labels cholesterol "[g]" while listing milligram values (e.g. 25).
// 트랜스지방 and 포화지방 must match before 지방.
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["열량", "calories", "kcal"],
  ["탄수화물", "carbohydrates", "g"],
  ["당류", "sugar", "g"],
  ["단백질", "protein", "g"],
  ["트랜스지방", "transFat", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["지방", "fat", "g"],
  ["나트륨", "natrium", "mg"],
  ["콜레스테롤", "cholesterol", "mg"],
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

// Serving size is "1회 제공량[ml]" "470" or "1회 제공량" "310ml". Food is
// also labelled "[ml]" while listing grams, so only an explicit "[g]" label
// or a unit on the value overrides the per-kind default.
function servingSizeUnit(
  label: string,
  amount: string,
  menuKind: MenuKind
): string {
  const amountUnit = amount.match(AMOUNT_UNIT_REGEX)?.[1];
  if (amountUnit) {
    return amountUnit.toLowerCase();
  }
  return label.match(LABEL_UNIT_REGEX)?.[1] === "g"
    ? "g"
    : menuKind.servingSizeUnit;
}

// Missing values are "" or " - "
function toNutritions(
  entries: NutritionEntry[] | null,
  menuKind: MenuKind
): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  for (const { name, amount } of entries ?? []) {
    const label = name.trim();
    const value = parseNumber(amount);
    if (value === undefined) {
      continue;
    }

    if (label.startsWith("1회 제공량")) {
      nutritions.servingSize = value;
      nutritions.servingSizeUnit = servingSizeUnit(label, amount, menuKind);
      hasValue = true;
      continue;
    }

    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      label.startsWith(prefix)
    );
    if (nutrient) {
      const [, key, unit] = nutrient;
      record[key] = value;
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  }

  return hasValue ? nutritions : null;
}

// Titles and descriptions carry stray spaces and "\r\n"
function clean(text: string | undefined): string {
  return (text ?? "").replace(WHITESPACE_REGEX, " ").trim();
}

async function fetchMenuItems(menuKind: MenuKind): Promise<MenuItem[]> {
  const items: MenuItem[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${SITE_CONFIG.apiUrl}/${menuKind.kind}?page=${page}&category=ALL&search=`;
    // Pages must be fetched in order until the API reports no next page
    const response = JSON.parse(await fetchText(url)) as MenuResponse;
    items.push(...response.data.elements);
    if (!response.meta.hasNextPage || response.data.elements.length === 0) {
      break;
    }
  }
  logger.info(`📋 ${menuKind.kind}: ${items.length} products`);
  return isTestMode ? items.slice(0, maxProductsInTestMode) : items;
}

// Several drinks share a name with a different id: the hot and iced versions
// (told apart only by the image), or a store-format recipe. They are kept as
// separate products under their own ids, as on the site.
function toProduct(item: MenuItem, menuKind: MenuKind): Product {
  const nutritions = toNutritions(item.nutritional_ingredients, menuKind);
  const name = clean(item.title);

  logger.info(
    `✅ Extracted: ${name} (id: ${item.id})${nutritions ? " with nutrition data" : ""}`
  );

  return {
    name,
    nameEn: clean(item.titleEn) || null,
    description: clean(item.description) || null,
    price: null,
    externalImageUrl: item.image,
    category: null,
    externalCategory: item.category.name,
    externalId: `tomntoms_${item.id}`,
    // There is no per-item page; details open in an overlay on the list
    externalUrl: `${SITE_CONFIG.baseUrl}/menu/${menuKind.kind}`,
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runTomntomsCrawler = async () => {
  try {
    // Each crawler runs in its own process, so this only affects this one
    setDefaultCACertificates([
      ...getCACertificates("default"),
      MISSING_INTERMEDIATE_CA,
    ]);

    const products: Product[] = [];
    for (const menuKind of MENU_KINDS) {
      const items = await fetchMenuItems(menuKind);
      products.push(...items.map((item) => toProduct(item, menuKind)));
    }
    logger.info(`Found ${products.length} products`);
    await writeProductsToJson(products, "tomntoms");
  } catch (error) {
    logger.error("Tom N Toms crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTomntomsCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
