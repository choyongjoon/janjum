#!/usr/bin/env tsx

import { ConvexClient } from 'convex/browser';
import dotenv from 'dotenv';
import { AVAILABLE_CAFES } from 'shared/constants';
import sharp from 'sharp';
import { api } from '../../convex/_generated/api';
import { logger } from '../../shared/logger';

dotenv.config({ path: '.env.local' });

const CONVEX_URL = process.env.VITE_CONVEX_URL;
const UPLOAD_SECRET = process.env.CONVEX_UPLOAD_SECRET;

type CafeKey = keyof typeof AVAILABLE_CAFES;

interface ParsedArgs {
  cafeKey: CafeKey;
  imageUrl?: string;
}

const OG_IMAGE_REGEX =
  /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i;
const TOUCH_ICON_REGEX =
  /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i;

// Known cafe website URLs for og:image fetching
const CAFE_WEBSITES: Partial<Record<CafeKey, string>> = {
  starbucks: 'https://www.starbucks.co.kr',
  compose: 'https://composecoffee.com',
  mega: 'https://www.mega-mgccoffee.com',
  paik: 'https://paikdabang.com',
  ediya: 'https://www.ediya.com',
  twosome: 'https://www.twosome.co.kr',
  coffeebean: 'https://www.coffeebeankorea.com',
  hollys: 'https://www.hollys.co.kr',
  paulbassett: 'https://www.paulbassett.co.kr',
  mammoth: 'https://mmthcoffee.com',
  gongcha: 'https://www.gong-cha.co.kr',
  oozy: 'https://oozycoffee.com',
};

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    logger.info(`
Usage:
  pnpm add-cafe <cafe-key> [--image-url <url>]

Available cafes:
${Object.entries(AVAILABLE_CAFES)
  .map(([key, cafe]) => `  ${key.padEnd(14)} - ${cafe.name}`)
  .join('\n')}

Options:
  --image-url <url>  Provide a specific image URL (otherwise fetches og:image from website)
`);
    process.exit(0);
  }

  const cafeKey = args[0];
  if (!(cafeKey in AVAILABLE_CAFES)) {
    logger.error(`Invalid cafe key: ${cafeKey}`);
    logger.info(`Available: ${Object.keys(AVAILABLE_CAFES).join(', ')}`);
    process.exit(1);
  }

  let imageUrl: string | undefined;
  const imageUrlIndex = args.indexOf('--image-url');
  if (imageUrlIndex !== -1 && args[imageUrlIndex + 1]) {
    imageUrl = args[imageUrlIndex + 1];
  }

  return { cafeKey: cafeKey as CafeKey, imageUrl };
}

function resolveUrl(url: string, baseUrl: string): string {
  return url.startsWith('http') ? url : new URL(url, baseUrl).href;
}

async function fetchOgImage(siteUrl: string): Promise<string | null> {
  logger.info(`Fetching og:image from ${siteUrl}`);

  const response = await fetch(siteUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!response.ok) {
    logger.warn(`Failed to fetch ${siteUrl}: ${response.status}`);
    return null;
  }

  const html = await response.text();

  const ogMatch = html.match(OG_IMAGE_REGEX);
  if (ogMatch) {
    return resolveUrl(ogMatch[1], siteUrl);
  }

  const touchIconMatch = html.match(TOUCH_ICON_REGEX);
  if (touchIconMatch) {
    return resolveUrl(touchIconMatch[1], siteUrl);
  }

  return null;
}

async function downloadAndOptimizeImage(
  imageUrl: string
): Promise<Buffer | null> {
  logger.info(`Downloading image: ${imageUrl}`);

  const imageUrlObj = new URL(imageUrl);
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
      Referer: `${imageUrlObj.protocol}//${imageUrlObj.hostname}/`,
    },
  });

  if (!response.ok) {
    logger.warn(`Failed to download image: ${response.status}`);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const imageBuffer = Buffer.from(arrayBuffer);
  const originalSize = imageBuffer.length;

  const metadata = await sharp(imageBuffer).metadata();

  if (metadata.format === 'webp') {
    logger.info(`Image is already WebP (${originalSize} bytes)`);
    return imageBuffer;
  }

  const optimized = Buffer.from(
    await sharp(imageBuffer).webp({ quality: 85, effort: 6 }).toBuffer()
  );

  const reduction = (
    ((originalSize - optimized.length) / originalSize) *
    100
  ).toFixed(1);
  logger.info(
    `Optimized: ${originalSize} -> ${optimized.length} bytes (${reduction}% reduction)`
  );

  return optimized;
}

async function uploadToStorage(
  client: ConvexClient,
  imageBuffer: Buffer
): Promise<string> {
  const uploadUrl = await client.mutation(api.http.generateUploadUrl, {
    uploadSecret: UPLOAD_SECRET,
  });

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'image/webp' },
    body: new Uint8Array(imageBuffer),
  });

  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
  }

  const { storageId } = await uploadResponse.json();
  logger.info(`Uploaded image to storage: ${storageId}`);
  return storageId as string;
}

async function resolveImageUrl(
  cafeKey: CafeKey,
  providedImageUrl?: string
): Promise<string | undefined> {
  if (providedImageUrl) {
    return providedImageUrl;
  }

  const websiteUrl = CAFE_WEBSITES[cafeKey];
  if (websiteUrl) {
    return (await fetchOgImage(websiteUrl)) ?? undefined;
  }

  return;
}

async function fetchAndUploadImage(
  client: ConvexClient,
  imageUrl: string | undefined
): Promise<string | undefined> {
  if (!imageUrl) {
    logger.warn('No image URL found, creating cafe without image');
    return;
  }

  const imageBuffer = await downloadAndOptimizeImage(imageUrl);
  if (!imageBuffer) {
    return;
  }

  return uploadToStorage(client, imageBuffer);
}

async function main() {
  if (!CONVEX_URL) {
    throw new Error('VITE_CONVEX_URL is not set');
  }
  if (!UPLOAD_SECRET) {
    throw new Error('CONVEX_UPLOAD_SECRET is not set');
  }

  const { cafeKey, imageUrl: providedImageUrl } = parseArgs();
  const cafe = AVAILABLE_CAFES[cafeKey];

  logger.info(`Adding cafe: ${cafe.name} (${cafe.slug})`);

  const client = new ConvexClient(CONVEX_URL);

  const existing = await client.query(api.cafes.getBySlug, {
    slug: cafe.slug,
  });

  if (existing?.imageStorageId) {
    logger.info(
      `Cafe "${cafe.name}" already exists with image (id: ${existing._id})`
    );
    logger.info('Nothing to do.');
    process.exit(0);
  }

  if (existing) {
    logger.info(`Cafe "${cafe.name}" exists but has no image, adding one...`);
  }

  const resolvedImageUrl = await resolveImageUrl(cafeKey, providedImageUrl);
  const storageId = await fetchAndUploadImage(client, resolvedImageUrl);

  if (existing) {
    if (storageId) {
      await client.mutation(api.cafes.updateImage, {
        cafeId: existing._id,
        // biome-ignore lint/suspicious/noExplicitAny: Convex Id type from runtime string
        storageId: storageId as any,
        uploadSecret: UPLOAD_SECRET,
      });
      logger.info(`Updated image for "${cafe.name}"`);
    }
  } else {
    const cafeId = await client.mutation(api.cafes.create, {
      name: cafe.name,
      slug: cafe.slug,
      // biome-ignore lint/suspicious/noExplicitAny: Convex Id type from runtime string
      imageStorageId: storageId as any,
      uploadSecret: UPLOAD_SECRET,
    });
    logger.info(`Created cafe "${cafe.name}" (id: ${cafeId})`);
  }

  logger.info('Done!');
  process.exit(0);
}

main().catch((error) => {
  logger.error('Failed to add cafe:', error);
  process.exit(1);
});
