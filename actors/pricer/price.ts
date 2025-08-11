#!/usr/bin/env tsx

import { logger } from '../../shared/logger';
import StarbucksPricer from './starbucks-pricer';

const CONVEX_URL = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;

async function main() {
  if (!CONVEX_URL) {
    logger.error(
      'CONVEX_URL or VITE_CONVEX_URL environment variable is required'
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    logger.info('Usage: tsx actors/pricer/price.ts <command>');
    logger.info('Commands:');
    logger.info('  starbucks  - Run Starbucks price collection from Naver Map');
    process.exit(1);
  }

  try {
    switch (command.toLowerCase()) {
      case 'starbucks': {
        logger.info('🚀 Starting Starbucks price collection...');
        const pricer = new StarbucksPricer(CONVEX_URL);
        const result = await pricer.run();

        // Log results
        logger.info('📊 Price collection results:');
        logger.info(`  ✅ Success: ${result.success}`);
        logger.info(`  📦 Products processed: ${result.productsProcessed}`);
        logger.info(`  💰 Prices updated: ${result.pricesUpdated}`);
        logger.info(
          `  📈 Price history entries: ${result.priceHistoryEntries}`
        );

        if (result.errors.length > 0) {
          logger.error(`  ❌ Errors (${result.errors.length}):`);
          for (const error of result.errors) {
            logger.error(`    - ${error}`);
          }
        }

        process.exit(result.success ? 0 : 1);
        break;
      }

      default:
        logger.error(`Unknown command: ${command}`);
        logger.info('Available commands: starbucks');
        process.exit(1);
    }
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
