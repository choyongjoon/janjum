#!/usr/bin/env node
/**
 * Crawler CLI - Run crawlers from command line
 *
 * Usage:
 *   pnpm crawl <brand>           Run a specific crawler
 *   pnpm crawl --list            List all available crawlers
 *   pnpm crawl --all             Run all crawlers (sequential)
 *   pnpm crawl --all --parallel  Run all crawlers (parallel)
 *
 * Options:
 *   --test                       Enable test mode (limited products)
 *   --max-products=N             Limit products in test mode
 *   --max-requests=N             Limit requests in test mode
 *
 * Examples:
 *   pnpm crawl starbucks
 *   pnpm crawl paik --test --max-products=5
 *   pnpm crawl --all
 */

import { logger } from '../../shared/logger';

// Import crawlers to register them
import './crawlers';

import {
  getRegisteredBrands,
  hasCrawler,
  runAllCrawlers,
  runCrawler,
} from './core';

// ================================================
// ARGUMENT PARSING
// ================================================

interface CliArgs {
  brand?: string;
  list: boolean;
  all: boolean;
  parallel: boolean;
  test: boolean;
  maxProducts?: number;
  maxRequests?: number;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    list: false,
    all: false,
    parallel: false,
    test: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--list' || arg === '-l') {
      result.list = true;
    } else if (arg === '--all' || arg === '-a') {
      result.all = true;
    } else if (arg === '--parallel' || arg === '-p') {
      result.parallel = true;
    } else if (arg === '--test' || arg === '-t') {
      result.test = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg.startsWith('--max-products=')) {
      result.maxProducts = Number.parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--max-requests=')) {
      result.maxRequests = Number.parseInt(arg.split('=')[1], 10);
    } else if (!arg.startsWith('-')) {
      result.brand = arg;
    }
  }

  return result;
}

// ================================================
// HELP TEXT
// ================================================

function printHelp(): void {
  logger.info(`
Crawler CLI - Run crawlers from command line

Usage:
  pnpm crawl:v2 <brand>           Run a specific crawler
  pnpm crawl:v2 --list            List all available crawlers
  pnpm crawl:v2 --all             Run all crawlers (sequential)
  pnpm crawl:v2 --all --parallel  Run all crawlers (parallel)

Options:
  --test                       Enable test mode (limited products)
  --max-products=N             Limit products in test mode
  --max-requests=N             Limit requests in test mode
  --help                       Show this help message

Examples:
  pnpm crawl:v2 starbucks
  pnpm crawl:v2 paik --test --max-products=5
  pnpm crawl:v2 --all
`);
}

// ================================================
// COMMANDS
// ================================================

function listCrawlers(): void {
  const brands = getRegisteredBrands();

  if (brands.length === 0) {
    logger.info('No crawlers registered.');
  } else {
    logger.info('Available crawlers:');
    for (const brand of brands.sort()) {
      logger.info(`  - ${brand}`);
    }
  }
}

async function runSingleCrawler(brand: string): Promise<void> {
  if (!hasCrawler(brand)) {
    const brands = getRegisteredBrands();
    logger.error(`Crawler '${brand}' not found`);
    logger.info(`Available crawlers: ${brands.join(', ')}`);
    process.exit(1);
  }

  logger.info(`Running ${brand} crawler...`);
  await runCrawler(brand);
}

// ================================================
// MAIN
// ================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Set environment variables for test mode
  if (args.test) {
    process.env.CRAWLER_TEST_MODE = 'true';
    if (args.maxProducts) {
      process.env.CRAWLER_MAX_PRODUCTS = String(args.maxProducts);
    }
    if (args.maxRequests) {
      process.env.CRAWLER_MAX_REQUESTS = String(args.maxRequests);
    }
    logger.info('🧪 Test mode enabled');
  }

  // Handle commands
  if (args.help) {
    printHelp();
    return;
  }

  if (args.list) {
    listCrawlers();
    return;
  }

  if (args.all) {
    logger.info(
      `Running all crawlers (${args.parallel ? 'parallel' : 'sequential'})...`
    );
    await runAllCrawlers({ sequential: !args.parallel });
    return;
  }

  if (args.brand) {
    await runSingleCrawler(args.brand);
    return;
  }

  // No command specified
  printHelp();
}

// Run CLI
main().catch((error) => {
  logger.error('CLI error:', error);
  process.exit(1);
});
