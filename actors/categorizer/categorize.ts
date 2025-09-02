#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { AVAILABLE_CAFES } from '../../shared/constants';
import { logger } from '../../shared/logger';
import { ProductCategorizer } from './categorizer';
import type {
  CategorizeOptions,
  CategorizerResult,
  CategorizeStats,
  Category,
  ProductForCategorize,
} from './types';

// Initialize categorizer
const categorizer = new ProductCategorizer();

// Parse command line arguments
function parseArgs(): {
  options: CategorizeOptions & { file?: string };
  cafeSlugs: string[];
} {
  const args = process.argv.slice(2);
  const options: CategorizeOptions & { file?: string } = {};
  const cafeSlugs: string[] = [];

  // Parse flags and cafe slugs
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--file':
        options.file = args[i + 1];
        i++; // Skip next argument
        break;
      case '--confidence':
        options.confidence = args[i + 1] as 'all' | 'low' | 'medium';
        i++; // Skip next argument
        break;
      case '--limit':
        options.limit = Number.parseInt(args[i + 1], 10);
        i++; // Skip next argument
        break;
      case '--force':
        options.force = true;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        // Check if it's a valid cafe slug
        if (arg in AVAILABLE_CAFES) {
          cafeSlugs.push(arg);
        } else if (!arg.startsWith('--')) {
          logger.error(`Invalid cafe slug: ${arg}`);
          logger.info(
            `Available cafes: ${Object.keys(AVAILABLE_CAFES).join(', ')}`
          );
          process.exit(1);
        }
        break;
    }
  }

  // If no cafes specified and no file specified, use all cafes
  if (cafeSlugs.length === 0 && !options.file) {
    cafeSlugs.push(...Object.keys(AVAILABLE_CAFES));
  }

  return { options, cafeSlugs };
}

// Print help information
function printHelp(): void {
  logger.info(`
🏷️  Product Categorizer

Usage:
  pnpm categorize                           # Process most recent JSON file for each cafe
  pnpm categorize starbucks                 # Process only Starbucks categorization
  pnpm categorize starbucks compose         # Process Starbucks and Compose categorizations

Available Cafes:
${Object.entries(AVAILABLE_CAFES)
  .map(([key, cafe]) => `  ${key.padEnd(10)} - ${cafe.name}`)
  .join('\n')}

Description:
  Categorizes products from crawler JSON files. Runs between crawl and upload commands.
  Assigns Korean categories: 커피, 차, 블렌디드, 스무디, 주스, 에이드, 그 외
  Processes the most recent crawler files for specified cafes.

Options:
  --dry-run              Preview changes without updating files
  --interactive          Ask for human input on uncertain categorizations
  --verbose              Show detailed output during categorization
  --confidence <level>   Process only specific confidence levels (all|low|medium)
  --limit <number>       Limit number of products to process per file
  --force                Override all categories, even if they match current rules
  --help                 Show this help message

Examples:
  pnpm categorize                           # Process most recent files for all cafes
  pnpm categorize starbucks                 # Process only Starbucks
  pnpm categorize --dry-run --verbose       # Preview categorization with detailed output
  pnpm categorize --interactive             # Interactive mode for learning
  pnpm categorize --confidence low          # Only process low confidence items
  pnpm categorize --force                   # Force recategorization of all products
`);
}

// Find the latest file for a specific cafe (same logic as upload command)
function findLatestFileForCafe(cafeSlug: string): string | null {
  const outputDir = path.join(
    process.cwd(),
    'actors',
    'crawler',
    'crawler-outputs'
  );

  if (!fs.existsSync(outputDir)) {
    return null;
  }

  const cafePattern = `${cafeSlug}-products-`;

  const files = fs
    .readdirSync(outputDir)
    .filter((file) => file.startsWith(cafePattern) && file.endsWith('.json'))
    .map((file) => ({
      name: file,
      path: path.join(outputDir, file),
      mtime: fs.statSync(path.join(outputDir, file)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return files.length > 0 ? files[0].path : null;
}

// Find the most recent files for specified cafes
function findRecentCrawlerFiles(cafeSlugs: string[]): string[] {
  const outputDir = path.join(
    process.cwd(),
    'actors',
    'crawler',
    'crawler-outputs'
  );

  if (!fs.existsSync(outputDir)) {
    logger.warn('Crawler outputs directory does not exist');
    return [];
  }

  try {
    const recentFiles: string[] = [];

    for (const cafeSlug of cafeSlugs) {
      const latestFile = findLatestFileForCafe(cafeSlug);

      if (latestFile) {
        recentFiles.push(latestFile);
      } else {
        logger.warn(`No crawler output found for cafe: ${cafeSlug}`);
      }
    }

    logger.info(
      `🔍 Found ${recentFiles.length} recent crawler files (most recent per cafe):`
    );
    for (const file of recentFiles) {
      logger.info(`  📄 ${path.basename(file)}`);
    }

    return recentFiles;
  } catch (error) {
    logger.error('Failed to find crawler files:', error);
    return [];
  }
}

// Read products from JSON file
function getProductsFromJson(
  filePath: string,
  limit?: number
): ProductForCategorize[] {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`JSON file not found: ${filePath}`);
    }

    const jsonData = fs.readFileSync(filePath, 'utf-8');
    const products: ProductForCategorize[] = JSON.parse(jsonData);

    logger.info(
      `📁 Loaded ${products.length} products from JSON file: ${path.basename(filePath)}`
    );
    return limit ? products.slice(0, limit) : products;
  } catch (error) {
    logger.error('Failed to read products from JSON file:', error);
    throw error;
  }
}

// Write products back to JSON file
function writeProductsToJson(
  filePath: string,
  products: ProductForCategorize[]
) {
  try {
    const jsonData = JSON.stringify(products, null, 2);
    fs.writeFileSync(filePath, jsonData, 'utf-8');
    logger.info(
      `💾 Wrote ${products.length} products to JSON file: ${filePath}`
    );
  } catch (error) {
    logger.error('Failed to write products to JSON file:', error);
    throw error;
  }
}

// Interactive mode for getting human input
function getHumanCategoryChoice(
  productName: string,
  externalCategory?: string
): Promise<Category> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const categories: Category[] = [
    '커피',
    '차',
    '블렌디드',
    '스무디',
    '주스',
    '에이드',
    '그 외',
  ];

  logger.info(`\n📦 Product: ${productName}`);
  if (externalCategory) {
    logger.info(`🏷️  External Category: ${externalCategory}`);
  }
  logger.info('\nAvailable categories:');
  categories.forEach((cat, index) => {
    logger.info(`  ${index + 1}. ${cat}`);
  });

  return new Promise((resolve) => {
    rl.question('\nSelect category (1-7): ', (answer) => {
      const choice = Number.parseInt(answer, 10);
      if (choice >= 1 && choice <= 7) {
        resolve(categories[choice - 1]);
      } else {
        logger.info('Invalid choice, defaulting to "그 외"');
        resolve('그 외');
      }
      rl.close();
    });
  });
}

// Process a single product
async function processProduct(
  product: ProductForCategorize,
  options: CategorizeOptions,
  stats: CategorizeStats
): Promise<void> {
  try {
    stats.processed++;

    const result = categorizer.categorize({
      externalCategory: product.externalCategory,
      name: product.name,
    });

    if (shouldSkipProduct(result, options)) {
      return;
    }

    const finalCategory = await getFinalCategory(
      product,
      result,
      options,
      stats
    );
    updateCategoryStats(result, stats);
    handleCategoryUpdate(product, finalCategory, result, options, stats);
  } catch (error) {
    stats.errors++;
    logger.error(`Error processing product "${product.name}":`, error);
  }
}

// Check if product should be skipped based on confidence filter
function shouldSkipProduct(
  result: CategorizerResult,
  options: CategorizeOptions
): boolean {
  if (
    options.confidence &&
    options.confidence !== 'all' &&
    result.confidence !== options.confidence
  ) {
    if (options.verbose) {
      logger.info(`⏭️  Skipping product (confidence: ${result.confidence})`);
    }
    return true;
  }
  return false;
}

// Get final category, handling interactive mode
async function getFinalCategory(
  product: ProductForCategorize,
  result: CategorizerResult,
  options: CategorizeOptions,
  stats: CategorizeStats
): Promise<Category> {
  let finalCategory = result.category;

  if (
    options.interactive &&
    (result.confidence === 'low' || result.source === 'fallback')
  ) {
    finalCategory = await getHumanCategoryChoice(
      product.name,
      product.externalCategory
    );

    if (finalCategory !== result.category) {
      categorizer.learnFromHumanInput(
        {
          externalCategory: product.externalCategory,
          name: product.name,
        },
        finalCategory
      );
      stats.sourceBreakdown.human++;
    }
  }

  return finalCategory;
}

// Update category statistics
function updateCategoryStats(
  result: CategorizerResult,
  stats: CategorizeStats
): void {
  stats.confidenceBreakdown[result.confidence]++;
  if (result.source !== 'human') {
    stats.sourceBreakdown[result.source]++;
  }
}

// Handle category update and logging
function handleCategoryUpdate(
  product: ProductForCategorize,
  finalCategory: Category,
  result: CategorizerResult,
  options: CategorizeOptions,
  stats: CategorizeStats
) {
  const shouldUpdate = options.force || product.category !== finalCategory;

  // Format the applied rule for debugging
  const ruleInfo = result.matchedRule ? ` | Rule: ${result.matchedRule}` : '';
  const externalCategoryInfo = product.externalCategory
    ? ` | External: "${product.externalCategory}"`
    : '';

  if (shouldUpdate) {
    // Update the category in memory
    const oldCategory = product.category;
    product.category = finalCategory;
    stats.updated++;

    const action =
      options.force && oldCategory === finalCategory ? 'Forced' : 'Updated';
    logger.info(
      `✅ ${action} "${product.name}": ${oldCategory} → ${finalCategory} | Source: ${result.source} | Confidence: ${result.confidence}${ruleInfo}${externalCategoryInfo}`
    );
  } else {
    stats.unchanged++;
    if (options.verbose) {
      logger.info(
        `➡️  Unchanged "${product.name}": ${finalCategory} | Source: ${result.source} | Confidence: ${result.confidence}${ruleInfo}${externalCategoryInfo}`
      );
    }
  }
}

// Process products from JSON file
async function processJsonProducts(
  filePath: string,
  options: CategorizeOptions,
  stats: CategorizeStats
): Promise<ProductForCategorize[]> {
  logger.info(`📁 Processing products from JSON file: ${filePath}`);

  const products = getProductsFromJson(filePath, options.limit);
  logger.info(`📦 Found ${products.length} products`);

  for (const product of products) {
    await processProduct(product, options, stats);
  }

  return products;
}

// Print categorization summary
function printSummary(
  stats: CategorizeStats,
  startTime: number,
  options: CategorizeOptions
): void {
  const endTime = Date.now();
  const totalTime = Math.round((endTime - startTime) / 1000);

  logger.info('='.repeat(50));
  logger.info('📊 CATEGORIZATION SUMMARY');
  logger.info(`📦 Processed: ${stats.processed} products`);
  logger.info(`✅ Updated: ${stats.updated} products`);
  logger.info(`➡️  Unchanged: ${stats.unchanged} products`);
  logger.info(`❌ Errors: ${stats.errors} products`);
  logger.info(`⏱️  Total time: ${totalTime} seconds`);

  logger.info('\n🎯 Confidence Breakdown:');
  logger.info(`  High: ${stats.confidenceBreakdown.high}`);
  logger.info(`  Medium: ${stats.confidenceBreakdown.medium}`);
  logger.info(`  Low: ${stats.confidenceBreakdown.low}`);

  logger.info('\n🔧 Source Breakdown:');
  logger.info(`  Direct: ${stats.sourceBreakdown.direct}`);
  logger.info(`  Pattern: ${stats.sourceBreakdown.pattern}`);
  logger.info(`  Fallback: ${stats.sourceBreakdown.fallback}`);
  logger.info(`  Human: ${stats.sourceBreakdown.human}`);

  if (options.dryRun) {
    logger.info('\n🔍 DRY RUN MODE - No data was actually updated');
  }

  if (options.force) {
    logger.info(
      '\n⚡ FORCE MODE - All products were processed regardless of current category'
    );
  }

  // Show categorizer statistics
  const categorizerStats = categorizer.getStats();
  logger.info('\n📈 Categorizer Statistics:');
  logger.info(
    `  Total categorizations: ${categorizerStats.totalCategorizations}`
  );
  logger.info(`  Human learnings: ${categorizerStats.humanLearnings}`);
  logger.info(
    `  Average confidence: ${categorizerStats.averageConfidence.toFixed(2)}`
  );
}

// Main categorization function
async function categorizeProducts(
  options: CategorizeOptions & { file?: string },
  cafeSlugs: string[]
): Promise<void> {
  const stats: CategorizeStats = {
    processed: 0,
    updated: 0,
    unchanged: 0,
    errors: 0,
    confidenceBreakdown: { high: 0, medium: 0, low: 0 },
    sourceBreakdown: { direct: 0, pattern: 0, fallback: 0, human: 0 },
  };

  const startTime = Date.now();

  try {
    let filesToProcess: string[] = [];

    if (options.file) {
      // Process specific file
      if (!fs.existsSync(options.file)) {
        logger.error(`File not found: ${options.file}`);
        return;
      }
      filesToProcess = [options.file];
      logger.info(`🗂️  Processing specific file: ${options.file}`);
    } else {
      // Process recent crawler JSON files for specified cafes
      logger.info(
        `🤖 Processing most recent crawler files for cafes: ${cafeSlugs.join(', ')}`
      );
      filesToProcess = findRecentCrawlerFiles(cafeSlugs);

      if (filesToProcess.length === 0) {
        logger.warn('⚠️  No recent crawler files found. Run crawlers first.');
        return;
      }
    }

    // Process each file
    for (const filePath of filesToProcess) {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`🏪 Processing: ${path.basename(filePath)}`);
      logger.info(`${'='.repeat(60)}`);

      try {
        const processedProducts = await processJsonProducts(
          filePath,
          options,
          stats
        );

        // Always write back to file unless dry-run
        if (!options.dryRun) {
          writeProductsToJson(filePath, processedProducts);
        }
      } catch (error) {
        logger.error(
          `Failed to process file ${path.basename(filePath)}:`,
          error
        );
        stats.errors++;
      }
    }
  } catch (error) {
    logger.error('Error during categorization:', error);
    throw error;
  }

  printSummary(stats, startTime, options);
}

// Main execution function
async function main() {
  try {
    const { options, cafeSlugs } = parseArgs();

    logger.info('🏷️  Product Categorizer Starting');
    logger.info(`🏪 Will process cafes: ${cafeSlugs.join(', ')}`);
    logger.info(
      '🤖 Will process most recent crawler file for each specified cafe'
    );

    logger.info(
      '💾 Categories will be written back to JSON files automatically'
    );

    if (options.dryRun) {
      logger.info('🔍 DRY RUN MODE - No data will be updated');
    }

    if (options.interactive) {
      logger.info('🤝 INTERACTIVE MODE - Will ask for human input');
    }

    if (options.force) {
      logger.info('⚡ FORCE MODE - Will override all categories');
    }

    logger.info('='.repeat(50));

    await categorizeProducts(options, cafeSlugs);

    logger.info('🎉 Categorization completed successfully!');
  } catch (error) {
    logger.error('Fatal error in categorizer:', error);
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
