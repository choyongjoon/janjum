#!/usr/bin/env ts-node
import fs from 'node:fs';
import path from 'node:path';
import { ConvexClient } from 'convex/browser';
import dotenv from 'dotenv';
import { api } from '../../convex/_generated/api';
import { logger } from '../../shared/logger';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const CONVEX_URL = process.env.VITE_CONVEX_URL;

interface UploadOptions {
  file: string;
  cafeSlug: string;
  dryRun?: boolean;
  verbose?: boolean;
  downloadImages?: boolean;
}

interface UploadResult {
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  removed: number;
  reactivated: number;
  errors: string[];
  processingTime: number;
  message?: string;
  samples?: Array<{ name: string; category: string }>;
  removedProducts?: string[];
  reactivatedProducts?: string[];
}

class ProductUploader {
  private client: ConvexClient;

  constructor() {
    logger.info(`Initializing ConvexClient with URL: ${CONVEX_URL}`);
    try {
      if (!CONVEX_URL) {
        throw new Error('VITE_CONVEX_URL is not set');
      }
      this.client = new ConvexClient(CONVEX_URL);
      logger.info('ConvexClient initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ConvexClient:', error);
      throw error;
    }
  }

  async uploadFromFile(options: UploadOptions): Promise<UploadResult> {
    const {
      file,
      cafeSlug,
      dryRun = false,
      verbose = false,
      downloadImages = false,
    } = options;

    const filePath = this.resolveFilePath(file);
    const products = this.readAndValidateFile(filePath, verbose);

    if (verbose) {
      this.logUploadInfo(filePath, cafeSlug, dryRun);
    }

    logger.info(`Found ${products.length} products in file`);

    try {
      const result = await this.performUpload(
        products,
        cafeSlug,
        dryRun,
        downloadImages
      );
      this.handleUploadResult(result, verbose, dryRun);
      return result;
    } catch (error) {
      logger.error('Upload failed:', error);
      if (error instanceof Error) {
        logger.error('Error message:', error.message);
        logger.error('Error stack:', error.stack);
      }
      throw error;
    }
  }

  private resolveFilePath(file: string): string {
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    return filePath;
  }

  private readAndValidateFile(filePath: string, _verbose: boolean): unknown[] {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let products: unknown[];

    try {
      products = JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Invalid JSON in file ${filePath}: ${error}`);
    }

    if (!Array.isArray(products)) {
      throw new Error('JSON file must contain an array of products');
    }

    return products;
  }

  private logUploadInfo(
    filePath: string,
    cafeSlug: string,
    dryRun: boolean
  ): void {
    logger.info(`Reading file: ${filePath}`);
    logger.info(`Cafe: ${cafeSlug}`);
    logger.info(`Dry run: ${dryRun ? 'Yes' : 'No'}`);
  }

  private async performUpload(
    products: unknown[],
    cafeSlug: string,
    dryRun: boolean,
    downloadImages: boolean
  ): Promise<UploadResult> {
    const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (!uploadSecret) {
      throw new Error('CONVEX_UPLOAD_SECRET environment variable is required');
    }

    return await this.client.mutation(api.dataUploader.uploadProductsFromJson, {
      products,
      cafeSlug,
      dryRun,
      downloadImages,
      uploadSecret,
    });
  }

  private handleUploadResult(
    result: UploadResult,
    verbose: boolean,
    dryRun: boolean
  ): void {
    this.printResults(result, verbose);

    if (!dryRun && result.errors.length === 0) {
      logger.info('Upload completed successfully!');
    } else if (result.errors.length > 0) {
      logger.warn(`Upload completed with ${result.errors.length} errors`);
      if (verbose) {
        for (const error of result.errors) {
          logger.error(`  ${error}`);
        }
      }
    }
  }

  private printBasicResults(result: UploadResult): void {
    logger.info('Results:');
    logger.info(`  Processed: ${result.processed}`);
    logger.info(`  Created: ${result.created}`);
    logger.info(`  Updated: ${result.updated}`);
    logger.info(`  Unchanged: ${result.unchanged}`);
    logger.info(`  Skipped: ${result.skipped}`);
    logger.info(`  Removed: ${result.removed || 0}`);
    logger.info(`  Reactivated: ${result.reactivated || 0}`);
    logger.info(`  Errors: ${result.errors.length}`);
    logger.info(`  Processing time: ${result.processingTime}ms`);

    if (result.message) {
      logger.info(result.message);
    }
  }

  private printSampleProducts(result: UploadResult, verbose: boolean): void {
    if (verbose && result.samples) {
      logger.info('Sample processed products:');
      for (const [index, product] of result.samples.entries()) {
        logger.info(`  ${index + 1}. ${product.name} (${product.category})`);
      }
    }
  }

  private printRemovedProductsSection(
    result: UploadResult,
    verbose: boolean
  ): void {
    if (result.removed && result.removed > 0) {
      logger.info('\n❌ Removed Products Summary:');
      logger.info(`  ${result.removed} product(s) no longer found on website`);

      if (
        verbose &&
        result.removedProducts &&
        result.removedProducts.length > 0
      ) {
        logger.info(`\nRemoved products (${result.removedProducts.length}):`);
        for (const [index, productName] of result.removedProducts.entries()) {
          logger.info(`  ${index + 1}. ${productName}`);
        }
      } else if (!verbose && result.removed > 0) {
        logger.info('  Use --verbose to see product names');
      }
    }
  }

  private printReactivatedProductsSection(
    result: UploadResult,
    verbose: boolean
  ): void {
    if (result.reactivated && result.reactivated > 0) {
      logger.info('\n✅ Reactivated Products Summary:');
      logger.info(
        `  ${result.reactivated} previously removed product(s) found again`
      );

      if (
        verbose &&
        result.reactivatedProducts &&
        result.reactivatedProducts.length > 0
      ) {
        logger.info(
          `\nReactivated products (${result.reactivatedProducts.length}):`
        );
        for (const [
          index,
          productName,
        ] of result.reactivatedProducts.entries()) {
          logger.info(`  ${index + 1}. ${productName}`);
        }
      } else if (!verbose && result.reactivated > 0) {
        logger.info('  Use --verbose to see product names');
      }
    }
  }

  private printLifecycleSummary(result: UploadResult): void {
    if (
      (result.removed && result.removed > 0) ||
      (result.reactivated && result.reactivated > 0)
    ) {
      logger.info('\n📊 Product Lifecycle Summary:');
      if (result.removed && result.removed > 0) {
        logger.info(`  Products marked as removed: ${result.removed}`);
      }
      if (result.reactivated && result.reactivated > 0) {
        logger.info(`  Products reactivated: ${result.reactivated}`);
      }
    }
  }

  private printResults(result: UploadResult, verbose: boolean): void {
    this.printBasicResults(result);
    this.printSampleProducts(result, verbose);
    this.printRemovedProductsSection(result, verbose);
    this.printReactivatedProductsSection(result, verbose);
    this.printLifecycleSummary(result);
  }
}

// CLI Interface
async function main() {
  try {
    logger.info('Starting main function...');
    const args = process.argv.slice(2);

    logger.info('Creating ProductUploader instance...');
    const uploader = new ProductUploader();
    logger.info('ProductUploader created successfully');

    // Default upload command
    const options: UploadOptions = {
      file: '',
      cafeSlug: '',
      dryRun: args.includes('--dry-run'),
      verbose: args.includes('--verbose') || args.includes('-v'),
      downloadImages: args.includes('--download-images'),
    };

    // Parse file option
    const fileIndex = args.indexOf('--file');
    if (fileIndex !== -1 && args[fileIndex + 1]) {
      options.file = args[fileIndex + 1];
    }

    const cafeSlugIndex = args.indexOf('--cafe-slug');
    if (cafeSlugIndex !== -1 && args[cafeSlugIndex + 1]) {
      options.cafeSlug = args[cafeSlugIndex + 1];
    }

    await uploader.uploadFromFile(options);
    process.exit(0);
  } catch (error) {
    logger.error('Upload failed:', error);
    if (error instanceof Error) {
      logger.error('Error message:', error.message);
      logger.error('Error stack:', error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Application error:', error);
    process.exit(1);
  });
}

export { ProductUploader };
