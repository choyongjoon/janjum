#!/usr/bin/env tsx

// Saves every cafe's gifticon voucher list to
// actors/crawler/gifticon-vouchers.json, which crawls on GitHub Actions use
// because gifticon refuses connections from GitHub's runners. Run it from a
// machine that can reach gifticon.com and commit the file when it changes.

import {
  fetchGifticonVouchers,
  GIFTICON_CAFES,
  type GifticonItem,
  writeGifticonSnapshot,
} from "../actors/crawler/gifticonPrices";
import { logger } from "../shared/logger";

const brands: Record<string, GifticonItem[]> = {};
for (const cafe of GIFTICON_CAFES) {
  // One brand at a time to stay gentle on the site
  brands[cafe] = await fetchGifticonVouchers(cafe);
  logger.info(`${cafe}: ${brands[cafe].length} vouchers`);
}

const file = writeGifticonSnapshot({
  fetchedAt: new Date().toISOString().slice(0, 10),
  brands,
});
logger.info(`Saved ${file}`);
