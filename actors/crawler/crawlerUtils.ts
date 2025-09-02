import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { logger } from 'shared/logger';
import type { Nutritions } from 'shared/nutritions';

export interface Product {
  name: string;
  nameEn: string | null;
  description: string | null;
  price: number | null;
  externalImageUrl: string;
  category: string | null;
  externalCategory: string;
  externalId: string;
  externalUrl: string;
  nutritions?: Nutritions | null;
}

export const waitFor = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const waitForLoad = async (page: Page, timeout = 15_000) => {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
    // Skip additional wait - content should be available after domcontentloaded
  } catch {
    logger.warn(`⚠️ Page load timeout after ${timeout}ms, continuing anyway...`);
    // Don't throw - continue with whatever content is available
  }
};

export const takeDebugScreenshot = async (page: Page, key: string) => {
  // Take a screenshot for debugging
  const screenshotPath = path.join(
    process.cwd(),
    'actors',
    'crawler',
    'crawler-outputs',
    `${key}-debug-screenshot.png`
  );
  await page.screenshot({ path: screenshotPath, fullPage: true });
  logger.info(`Screenshot saved to: ${screenshotPath}`);
};

export const writeProductsToJson = async (products: Product[], key: string) => {
  if (products.length === 0) {
    logger.warn('No products extracted');
    return;
  }

  const outputDir = path.join(
    process.cwd(),
    'actors',
    'crawler',
    'crawler-outputs'
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `${key}-products-${timestamp}.json`;
  const filepath = path.join(outputDir, filename);

  await new Promise((resolve, reject) => {
    fs.writeFile(filepath, JSON.stringify(products, null, 2), (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    });
  });

  logger.info(`Saved ${products.length} products to ${filename}`);
  logger.info('=== CRAWL SUMMARY ===');
  logger.info(`Total products extracted: ${products.length}`);
};
