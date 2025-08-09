#!/usr/bin/env tsx

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVAILABLE_CAFES } from 'shared/constants';
import { logger } from '../../shared/logger';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CrawlerName = keyof typeof AVAILABLE_CAFES;

// Print help information
function printHelp(): void {
  logger.info(`
🕷️  Multi-Crawler Runner

Usage:
  pnpm crawl                           # Run all crawlers
  pnpm crawl starbucks                 # Run only Starbucks crawler
  pnpm crawl starbucks compose         # Run Starbucks and Compose crawlers

Available Crawlers:
${Object.entries(AVAILABLE_CAFES)
  .map(([key, crawler]) => `  ${key.padEnd(10)} - ${crawler.name}`)
  .join('\n')}

Options:
  --help, -h         Show this help message
`);
}

// Parse command line arguments
function parseArgs(): CrawlerName[] {
  const args = process.argv.slice(2);

  // Check for help flags
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.length === 0) {
    // No arguments - run all crawlers
    return Object.keys(AVAILABLE_CAFES) as CrawlerName[];
  }

  // Validate crawler names
  const validCrawlers: CrawlerName[] = [];
  const invalidCrawlers: string[] = [];

  for (const arg of args) {
    if (arg in AVAILABLE_CAFES) {
      validCrawlers.push(arg as CrawlerName);
    } else {
      invalidCrawlers.push(arg);
    }
  }

  if (invalidCrawlers.length > 0) {
    logger.error(`Invalid crawler names: ${invalidCrawlers.join(', ')}`);
    logger.info(
      `Available crawlers: ${Object.keys(AVAILABLE_CAFES).join(', ')}`
    );
    process.exit(1);
  }

  return validCrawlers;
}

// Run a single crawler
function runCrawler(crawlerName: CrawlerName): Promise<void> {
  return new Promise((resolve, reject) => {
    const crawler = AVAILABLE_CAFES[crawlerName];
    const crawlerPath = path.join(__dirname, `${crawler.slug}-crawler.ts`);

    logger.info(`🚀 Starting ${crawler.name} crawler...`);

    const child = spawn('tsx', [crawlerPath], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info(`✅ ${crawler.name} crawler completed successfully`);
        resolve();
      } else {
        logger.error(
          `❌ ${crawler.name} crawler failed with exit code ${code}`
        );
        reject(
          new Error(`Crawler ${crawlerName} failed with exit code ${code}`)
        );
      }
    });

    child.on('error', (error) => {
      logger.error(
        `❌ Failed to start ${crawler.name} crawler: ${error.message}`
      );
      reject(error);
    });
  });
}

// Main execution function
async function main() {
  try {
    const crawlersToRun = parseArgs();

    logger.info('🎯 Crawler Runner Starting');
    logger.info(`📋 Crawlers to run: ${crawlersToRun.join(', ')}`);
    logger.info('='.repeat(50));

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    // Run crawlers sequentially to avoid resource conflicts
    for (const crawlerName of crawlersToRun) {
      try {
        await runCrawler(crawlerName);
        successCount++;
      } catch (error) {
        logger.error(`Failed to run ${crawlerName}: ${error}`);
        failCount++;
      }

      // Add a small delay between crawlers
      if (crawlersToRun.indexOf(crawlerName) < crawlersToRun.length - 1) {
        logger.info('⏳ Waiting 3 seconds before next crawler...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    const endTime = Date.now();
    const totalTime = Math.round((endTime - startTime) / 1000);

    // Final summary
    logger.info('='.repeat(50));
    logger.info('📊 CRAWLER RUN SUMMARY');
    logger.info(
      `✅ Successful: ${successCount}/${crawlersToRun.length} crawlers`
    );
    logger.info(`❌ Failed: ${failCount}/${crawlersToRun.length} crawlers`);
    logger.info(`⏱️  Total time: ${totalTime} seconds`);

    if (failCount > 0) {
      logger.error('Some crawlers failed. Check logs above for details.');
      process.exit(1);
    } else {
      logger.info('🎉 All crawlers completed successfully!');
    }
  } catch (error) {
    logger.error('Fatal error in crawler runner:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
