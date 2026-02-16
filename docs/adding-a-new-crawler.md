# Adding a New Crawler

This guide walks through adding a new cafe crawler to janjum, from initial research to CI integration.

## Prerequisites

- Node.js 22+
- pnpm installed
- Playwright browsers installed (`pnpm exec playwright install chromium`)

## Overview

A crawler collects product data (name, image, category, nutrition) from a cafe's website and outputs a JSON file. The system has three stages:

1. **Crawl** - scrape product data from the website
2. **Categorize** - assign internal categories via LLM
3. **Upload** - push data to the Convex database

You only need to implement the crawl stage. Categorization and upload are handled by existing infrastructure.

## Step 1: Research the Target Website

Before writing code, understand how the cafe's website is structured.

**What to look for:**

| Question | Why it matters |
|----------|----------------|
| Is the menu rendered server-side or loaded via JavaScript/API? | Determines if you need a browser (Playwright) or can fetch directly |
| How are products organized? (tabs, pages, categories) | Determines crawl strategy |
| Are there separate listing and detail pages? | Determines single-phase vs two-phase approach |
| Where is nutrition data? (inline, modal, detail page, API) | Determines extraction method |
| How are images served? (relative URLs, CDN, lazy-loaded) | Determines image URL resolution |
| Does the site use carousels or infinite scroll? | May require special handling for duplicate/dynamic elements |

**Tools for research:**

```bash
# Open the site in Playwright to inspect DOM
pnpm exec playwright open https://example.com/menu
```

Use browser DevTools to inspect elements, check Network tab for API calls, and identify CSS selectors.

## Step 2: Register the Cafe

Add an entry to `AVAILABLE_CAFES` in `shared/constants.ts`:

```typescript
export const AVAILABLE_CAFES = {
  // ... existing cafes
  newcafe: {
    name: '새카페',     // Korean display name
    slug: 'newcafe',   // URL-safe identifier, must match the key
  },
} as const;
```

The `slug` value is critical -- `crawl.ts` uses it to locate the crawler file at `actors/crawler/{slug}-crawler.ts`.

## Step 3: Create the Crawler File

Create `actors/crawler/newcafe-crawler.ts`. The filename **must** match the slug from Step 2.

### Required Imports

```typescript
import type { PlaywrightCrawlingContext } from 'crawlee';
import { PlaywrightCrawler } from 'crawlee';
import type { Nutritions } from '../../shared/nutritions';
import { logger } from '../../shared/logger';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';
```

### Configuration Blocks

Every crawler needs these configuration objects:

```typescript
// Site-specific URLs and settings
const SITE_CONFIG = {
  baseUrl: 'https://www.newcafe.com',
  menuUrl: 'https://www.newcafe.com/menu',
  // Add category URLs, detail URL patterns, etc.
};

// CSS selectors for data extraction
const SELECTORS = {
  productContainer: '.menu-item',
  productName: '.item-name',
  productImage: '.item-image img',
  nutritionTable: '.nutrition-info table',
  // Add all selectors needed for extraction
};

// Test mode support
const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
const MAX_PRODUCTS_TEST = Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS ?? '5', 10);
const MAX_REQUESTS_TEST = Number.parseInt(process.env.CRAWLER_MAX_REQUESTS ?? '10', 10);

// Crawler behavior settings
const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? MAX_REQUESTS_TEST : 300,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 120,
};
```

### Data Extraction Functions

Extract product data using `page.evaluate()` to run code in the browser context:

```typescript
async function extractProductsFromPage(page: PlaywrightCrawlingContext['page']): Promise<Product[]> {
  return page.evaluate((selectors) => {
    const items = document.querySelectorAll(selectors.productContainer);
    return [...items].map((item) => {
      const name = item.querySelector(selectors.productName)?.textContent?.trim() ?? '';
      const image = item.querySelector(selectors.productImage)?.getAttribute('src') ?? '';
      return { name, image };
    });
  }, SELECTORS);
}
```

**Important `page.evaluate()` rules:**
- Code inside runs in the **browser context**, not Node.js
- You cannot reference outer scope variables -- pass them as arguments
- `querySelectorAll` returns a `NodeList`, not an `Array`. Spread it first: `[...nodeList]`
- Regex objects cannot be passed in. Pass the pattern as a string, construct with `new RegExp()` inside
- Return only serializable data (no DOM elements)

### Nutrition Extraction

The `Nutritions` interface supports these fields (all optional):

| Field | Unit field | Typical unit |
|-------|-----------|--------------|
| `servingSize` | `servingSizeUnit` | `ml` or `g` |
| `calories` | `caloriesUnit` | `kcal` |
| `sugar` | `sugarUnit` | `g` |
| `protein` | `proteinUnit` | `g` |
| `saturatedFat` | `saturatedFatUnit` | `g` |
| `natrium` | `natriumUnit` | `mg` |
| `caffeine` | `caffeineUnit` | `mg` |
| `carbohydrates` | `carbohydratesUnit` | `g` |
| `fat` | `fatUnit` | `g` |
| `transFat` | `transFatUnit` | `g` |
| `cholesterol` | `cholesterolUnit` | `mg` |

Common Korean labels to match:

```typescript
const NUTRITION_FIELD_MAP: Record<string, keyof Nutritions> = {
  '칼로리': 'calories',
  '열량': 'calories',
  '당류': 'sugar',
  '단백질': 'protein',
  '포화지방': 'saturatedFat',
  '나트륨': 'natrium',
  '카페인': 'caffeine',
  '탄수화물': 'carbohydrates',
  '지방': 'fat',
  '트랜스지방': 'transFat',
  '콜레스테롤': 'cholesterol',
  '용량': 'servingSize',
};
```

### Crawler Factory and Runner

```typescript
const collectedProducts: Product[] = [];

export function createNewcafeCrawler() {
  return new PlaywrightCrawler({
    ...CRAWLER_CONFIG,
    launchContext: {
      launchOptions: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },
    async requestHandler({ page, request }) {
      await waitForLoad(page);

      if (request.userData.isDetailPage) {
        // Phase 2: extract product detail
        const product = await extractProductDetail(page, request);
        if (product) {
          collectedProducts.push(product);
        }
      } else {
        // Phase 1: extract listing, enqueue detail pages
        await handleListingPage(page, request, this);
      }
    },
    async failedRequestHandler({ request }) {
      logger.error(`Request failed: ${request.url}`);
    },
  });
}

export async function runNewcafeCrawler() {
  collectedProducts.length = 0;
  const crawler = createNewcafeCrawler();

  const startUrls = [/* listing page URLs */];
  await crawler.run(startUrls);

  logger.info(`Collected ${collectedProducts.length} products`);
  await writeProductsToJson(collectedProducts, 'newcafe');
}

// Direct execution support
if (import.meta.url === `file://${process.argv[1]}`) {
  runNewcafeCrawler().catch((error) => {
    logger.error('Crawler failed:', error);
    process.exit(1);
  });
}
```

### Product Object Structure

Each product must conform to this shape:

```typescript
const product: Product = {
  name: '아메리카노',
  nameEn: 'Americano',            // null if unavailable
  description: 'A classic coffee', // null if unavailable
  price: null,                     // null if unavailable
  externalImageUrl: 'https://...', // full URL required
  category: null,                  // assigned later by categorizer
  externalCategory: '커피',        // the category from the source website
  externalId: 'newcafe_커피_아메리카노', // unique across all products
  externalUrl: 'https://...',      // the page this was scraped from
  nutritions: { calories: 5, caloriesUnit: 'kcal', /* ... */ },
};
```

**`externalId` convention:** `{slug}_{category}_{productName}` -- must be unique per product.

## Step 4: Handle Common Challenges

### Slick.js / Swiper Carousels

Carousel libraries clone slides for infinite scroll, creating duplicate DOM elements. Deduplicate by collecting into a `Map` keyed by product ID:

```typescript
const productMap = new Map<string, { name: string; uid: string }>();
for (const link of links) {
  const uid = extractUid(link.href);
  if (uid && !productMap.has(uid)) {
    productMap.set(uid, { name: link.textContent, uid });
  }
}
```

### Cross-Category Duplicates

Some sites list the same product in multiple categories. Use a global `Set` to track seen IDs:

```typescript
const seenIds = new Set<string>();

// In handler:
if (seenIds.has(uid)) return;
seenIds.add(uid);
```

### Lazy-Loaded Images

If images use `data-src` or `loading="lazy"`:

```typescript
const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
```

### Relative URLs

Always resolve to absolute URLs:

```typescript
const imageUrl = new URL(relativePath, SITE_CONFIG.baseUrl).href;
```

## Step 5: Test Locally

```bash
# Test mode -- limits requests and products
CRAWLER_TEST_MODE=true tsx actors/crawler/newcafe-crawler.ts

# Full crawl
pnpm crawl newcafe

# Verify output
cat actors/crawler/crawler-outputs/newcafe-products-*.json | jq length

# Check data quality (should output 0)
cat actors/crawler/crawler-outputs/newcafe-products-*.json | \
  jq '[.[] | select(.name == "" or .externalImageUrl == "")] | length'

# Format check
npx ultracite format actors/crawler/newcafe-crawler.ts shared/constants.ts
```

## Step 6: Add to CI Workflow

Edit `.github/workflows/daily-data-sync.yml`. Add the cafe slug to **4 places**:

### 1. Manual trigger dropdown

```yaml
workflow_dispatch:
  inputs:
    target_cafe:
      options:
        # ... existing cafes
        - "newcafe"
```

### 2-4. Matrix arrays in crawl, categorize, and upload jobs

Search for `fromJSON('[` and add the slug to all three arrays:

```yaml
cafe: ${{ ... && fromJSON('["starbucks", ..., "newcafe"]') || ... }}
```

## Step 7: Format and Commit

```bash
npx ultracite format actors/crawler/newcafe-crawler.ts shared/constants.ts
git add shared/constants.ts actors/crawler/newcafe-crawler.ts .github/workflows/daily-data-sync.yml
git commit -m "Add newcafe crawler"
```

## Crawler Architecture Patterns

Choose the pattern that matches the target website:

### Single-Phase (simple sites)

Best when all product data is available on listing pages.

```
Listing Page → Extract all products → Done
```

Examples: `mega-crawler.ts`, `paik-crawler.ts`

### Two-Phase (listing + detail)

Best when listing pages only show names/thumbnails and detail pages have nutrition data.

```
Listing Pages → Collect product URLs → Enqueue detail pages → Extract full data
```

Examples: `hollys-crawler.ts`, `theventi-crawler.ts`, `starbucks-crawler.ts`

### API-Based

Some sites expose JSON APIs for their menus. Check the Network tab in DevTools.

```
API call → Parse JSON response → Map to Product interface
```

## File Reference

| File | Purpose |
|------|---------|
| `shared/constants.ts` | Cafe registry (`AVAILABLE_CAFES`) |
| `shared/nutritions.ts` | `Nutritions` interface definition |
| `shared/logger.ts` | Pino logger (use instead of `console.log`) |
| `actors/crawler/crawlerUtils.ts` | `Product` interface, `waitForLoad`, `writeProductsToJson` |
| `actors/crawler/crawl.ts` | CLI dispatcher -- maps slug to `{slug}-crawler.ts` |
| `.github/workflows/daily-data-sync.yml` | CI pipeline (crawl, categorize, upload) |

## Lint Rules to Watch

The project uses Biome via ultracite. Common issues when writing crawlers:

| Rule | What it catches | Fix |
|------|----------------|-----|
| `useTopLevelRegex` | Regex literals inside functions | Move to top-level `const` or use string + `new RegExp()` |
| `noExcessiveCognitiveComplexity` | Functions with complexity > 15 | Extract helper functions |
| `useAtIndex` | `arr[arr.length - 1]` | Use `arr.at(-1)` (but ensure it's an Array, not NodeList) |
| `noConsole` | `console.log` usage | Use `logger` from `shared/logger.ts` |
| `useAwait` | `async` function without `await` | Remove `async` if returning a Promise directly |
