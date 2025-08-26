#!/usr/bin/env tsx

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVAILABLE_CAFES } from 'shared/constants';
import { logger } from '../../shared/logger';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CafeSlug = keyof typeof AVAILABLE_CAFES;

interface UploadOptions {
  dryRun?: boolean;
  downloadImages?: boolean;
  verbose?: boolean;
  file?: string;
}

// Helper function to handle cafe name validation and addition
function handleCafeSlug(arg: string, cafeSlugs: CafeSlug[]): void {
  if (arg in AVAILABLE_CAFES) {
    cafeSlugs.push(arg as CafeSlug);
  } else {
    logger.error(`Invalid cafe name: ${arg}`);
    logger.info(`Available cafes: ${Object.keys(AVAILABLE_CAFES).join(', ')}`);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): { cafeSlugs: CafeSlug[]; options: UploadOptions } {
  const args = process.argv.slice(2);
  const options: UploadOptions = {
    downloadImages: true, // Default to true
  };
  const cafeSlugs: CafeSlug[] = [];

  // Parse flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--download-images':
        options.downloadImages = true;
        break;
      case '--no-download-images':
        options.downloadImages = false;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--file':
        options.file = args[i + 1];
        i++; // Skip next argument as it's the file path
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        // This should be a cafe name
        handleCafeSlug(arg, cafeSlugs);
        break;
    }
  }

  // If no cafes specified, upload all available cafes
  if (cafeSlugs.length === 0) {
    cafeSlugs.push(...(Object.keys(AVAILABLE_CAFES) as CafeSlug[]));
  }

  return { cafeSlugs, options };
}

// Find the latest file for a specific cafe
function findLatestFile(cafeSlug: string): string | null {
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

// Upload products for a single cafe
function uploadCafe(cafeSlug: CafeSlug, options: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const cafe = AVAILABLE_CAFES[cafeSlug];
    const uploaderPath = path.join(__dirname, 'uploader.ts');

    // Find the appropriate file
    let filePath = options.file;
    if (!filePath) {
      const foundPath = findLatestFile(cafe.slug);
      if (!foundPath) {
        logger.error(`No ${cafe.name} products file found in crawler-outputs/`);
        reject(new Error(`No products file found for ${cafeSlug}`));
        return;
      }
      filePath = foundPath;
    }

    logger.info(`🚀 Starting ${cafe.name} upload...`);
    logger.info(`📁 File: ${path.basename(filePath)}`);

    // Build command arguments
    const args = [uploaderPath, '--cafe-slug', cafe.slug, '--file', filePath];

    if (options.dryRun) {
      args.push('--dry-run');
    }

    // Download images by default, unless explicitly disabled
    if (options.downloadImages !== false) {
      args.push('--download-images');
    } else {
      args.push('--no-download-images');
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    const child = spawn('tsx', args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info(`✅ ${cafe.name} upload completed successfully`);
        resolve();
      } else {
        logger.error(`❌ ${cafe.name} upload failed with exit code ${code}`);
        reject(new Error(`Upload ${cafeSlug} failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      logger.error(`❌ Failed to start ${cafe.name} upload: ${error.message}`);
      reject(error);
    });
  });
}

// Print help information
function printHelp(): void {
  logger.info(`
🚀 Multi-Cafe Uploader Runner

Usage:
  pnpm upload                             # Upload all cafes
  pnpm upload starbucks                   # Upload only Starbucks
  pnpm upload starbucks compose           # Upload Starbucks and Compose

Available Cafes:
${Object.entries(AVAILABLE_CAFES)
  .map(([key, cafe]) => `  ${key.padEnd(10)} - ${cafe.name}`)
  .join('\n')}

Options:
  --dry-run              Preview changes without uploading to database
  --download-images      Download external images to Convex storage (default: enabled)
  --no-download-images   Disable image downloading (use external URLs)
  --verbose, -v          Show detailed output during upload
  --file <path>          Use specific file instead of latest from crawler-outputs/
  --help, -h             Show this help message
`);
}

// Main execution function
async function main() {
  try {
    const { cafeSlugs, options } = parseArgs();

    logger.info('🎯 Multi-Cafe Uploader Starting');
    logger.info(`📋 Cafes to upload: ${cafeSlugs.join(', ')}`);
    if (options.dryRun) {
      logger.info('🔍 DRY RUN MODE - No data will be uploaded');
    }
    logger.info('='.repeat(50));

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    // Upload cafes sequentially to avoid database conflicts
    for (const cafeSlug of cafeSlugs) {
      try {
        await uploadCafe(cafeSlug, options);
        successCount++;
      } catch (error) {
        logger.error(`Failed to upload ${cafeSlug}: ${error}`);
        failCount++;
      }

      // Add a small delay between uploads
      if (cafeSlugs.indexOf(cafeSlug) < cafeSlugs.length - 1) {
        logger.info('⏳ Waiting 2 seconds before next upload...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    const endTime = Date.now();
    const totalTime = Math.round((endTime - startTime) / 1000);

    // Final summary
    logger.info('='.repeat(50));
    logger.info('📊 UPLOAD RUN SUMMARY');
    logger.info(`✅ Successful: ${successCount}/${cafeSlugs.length} cafes`);
    logger.info(`❌ Failed: ${failCount}/${cafeSlugs.length} cafes`);
    logger.info(`⏱️  Total time: ${totalTime} seconds`);

    if (failCount > 0) {
      logger.error('Some uploads failed. Check logs above for details.');
      process.exit(1);
    } else if (options.dryRun) {
      logger.info('🔍 Dry run completed - no data was uploaded');
    } else {
      logger.info('🎉 All uploads completed successfully!');
    }
  } catch (error) {
    logger.error('Fatal error in uploader runner:', error);
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
