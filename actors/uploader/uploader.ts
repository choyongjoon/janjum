#!/usr/bin/env ts-node
import fs from 'node:fs';
import path from 'node:path';
import { ConvexClient } from 'convex/browser';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { logger } from '../../shared/logger';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const CONVEX_URL = process.env.VITE_CONVEX_URL;

interface UploadOptions {
  file: string;
  cafeSlug: string;
  dryRun?: boolean;
  verbose?: boolean;
}

interface ProductData {
  name: string;
  nameEn: string | null;
  description: string | null;
  externalCategory: string | null;
  externalId: string;
  externalImageUrl: string;
  externalUrl: string;
  price: number | null;
  category: string;
  // added by this script
  imageStorageId?: string;
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
    const { file, cafeSlug, dryRun = false, verbose = false } = options;

    // Images are always downloaded and optimized
    const downloadImages = true;
    const optimizeImages = true;

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
        downloadImages,
        optimizeImages
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

  private readAndValidateFile(
    filePath: string,
    _verbose: boolean
  ): ProductData[] {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let products: ProductData[];

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
    products: ProductData[],
    cafeSlug: string,
    dryRun: boolean,
    downloadImages: boolean,
    optimizeImages: boolean
  ): Promise<UploadResult> {
    const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (!uploadSecret) {
      throw new Error('CONVEX_UPLOAD_SECRET environment variable is required');
    }

    // If image optimization is enabled, preprocess the products
    let processedProducts = products;
    if (optimizeImages && downloadImages) {
      logger.info(
        'Image optimization enabled - processing images before upload...'
      );
      processedProducts = await this.optimizeProductImages(products);
    }

    return await this.client.mutation(api.dataUploader.uploadProductsFromJson, {
      products: processedProducts,
      cafeSlug,
      dryRun,
      downloadImages,
      uploadSecret,
    });
  }

  /**
   * Optimize images in product data before upload
   * Downloads images, optimizes them using Sharp (same approach as imageOptimizer), and returns base64 data
   */
  private async optimizeProductImages(
    products: ProductData[]
  ): Promise<ProductData[]> {
    const optimizedProducts: ProductData[] = [];
    const stats = { optimizedCount: 0, totalSizeBefore: 0, totalSizeAfter: 0 };

    for (const [index, product] of products.entries()) {
      const result = await this.processProductImage(
        product,
        index + 1,
        products.length,
        stats
      );
      optimizedProducts.push(result);

      // Add small delay to avoid overwhelming servers
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logOptimizationResults(stats);
    return optimizedProducts;
  }

  /**
   * Process a single product's image optimization
   */
  private async processProductImage(
    product: ProductData,
    currentIndex: number,
    totalCount: number,
    stats: {
      optimizedCount: number;
      totalSizeBefore: number;
      totalSizeAfter: number;
    }
  ): Promise<ProductData> {
    const imageUrl = product.externalImageUrl;
    const existingStorageId = product.imageStorageId;
    logger.info(
      `Processing product ${currentIndex}/${totalCount}: ${product.name || 'Unknown'} (Image: ${imageUrl ? 'Yes' : 'No'}, Storage: ${existingStorageId ? 'Yes' : 'No'})`
    );

    const optimizedProduct = { ...product };

    // Try to process existing storage first
    if (existingStorageId) {
      const result = await this.processExistingStorage(
        existingStorageId,
        product.name || 'Unknown',
        stats
      );
      if (result) {
        return { ...optimizedProduct, imageStorageId: result.storageId };
      }
    }

    // Fallback to downloading from external URL
    return await this.processExternalImage(optimizedProduct, imageUrl, stats);
  }

  private async processExistingStorage(
    storageId: string,
    productName: string,
    stats: {
      optimizedCount: number;
      totalSizeBefore: number;
      totalSizeAfter: number;
    }
  ): Promise<{ storageId: string } | null> {
    try {
      const needsOptimization =
        await this.checkIfStorageNeedsOptimization(storageId);
      if (!needsOptimization) {
        logger.info(
          `Image for ${productName} is already optimized (WebP), skipping`
        );
        return { storageId };
      }

      logger.info(
        `Image for ${productName} needs optimization, processing stored image...`
      );
      const imageResult = await this.downloadAndOptimizeStoredImage(
        storageId,
        productName
      );

      if (imageResult) {
        this.updateStats(stats, imageResult);
        return { storageId: imageResult.storageId };
      }
    } catch (error) {
      logger.warn(
        `Failed to optimize stored image for ${productName}, will re-download: ${error}`
      );
    }
    return null;
  }

  private async processExternalImage(
    product: ProductData,
    imageUrl: string | null,
    stats: {
      optimizedCount: number;
      totalSizeBefore: number;
      totalSizeAfter: number;
    }
  ): Promise<ProductData> {
    if (!imageUrl || typeof imageUrl !== 'string') {
      return product;
    }

    try {
      const imageResult = await this.downloadAndOptimizeImage(
        imageUrl,
        product.name || 'Unknown'
      );
      if (imageResult) {
        this.updateStats(stats, imageResult);
        return { ...product, imageStorageId: imageResult.storageId };
      }
    } catch (error) {
      logger.error(`Failed to optimize image for ${product.name}:`, error);
    }

    return product;
  }

  private updateStats(
    stats: {
      optimizedCount: number;
      totalSizeBefore: number;
      totalSizeAfter: number;
    },
    imageResult: {
      originalSize: number;
      optimizedSize: number;
      wasOptimized: boolean;
    }
  ): void {
    stats.totalSizeBefore += imageResult.originalSize;
    stats.totalSizeAfter += imageResult.optimizedSize;
    if (imageResult.wasOptimized) {
      stats.optimizedCount++;
    }
  }

  /**
   * Check if stored image needs optimization by checking its metadata
   */
  private async checkIfStorageNeedsOptimization(
    storageId: string
  ): Promise<boolean> {
    try {
      const metadata = await this.client.query(api.http.getStorageMetadata, {
        storageId: storageId as Id<'_storage'>,
      });

      if (!metadata) {
        logger.warn(`No metadata found for storage ID: ${storageId}`);
        return true; // Re-download if we can't get metadata
      }

      // Check if the stored file is already WebP
      const contentType = metadata.contentType;
      const isWebP = contentType === 'image/webp';

      logger.debug(
        `Storage ${storageId} metadata: ${contentType}, isWebP: ${isWebP}`
      );

      return !isWebP; // Return true if needs optimization (not WebP)
    } catch (error) {
      logger.error(`Error checking storage metadata for ${storageId}:`, error);
      return true; // Re-download on error
    }
  }

  /**
   * Download and optimize an existing stored image
   */
  private async downloadAndOptimizeStoredImage(
    storageId: string,
    productName: string
  ): Promise<{
    originalSize: number;
    optimizedSize: number;
    storageId: string;
    wasOptimized: boolean;
  } | null> {
    try {
      logger.info(
        `Downloading stored image for optimization: ${productName} (${storageId})`
      );

      // Get URL for the stored image
      const imageUrl = await this.client.query(api.http.getStorageUrl, {
        storageId: storageId as Id<'_storage'>,
      });

      if (!imageUrl) {
        throw new Error(`No URL found for storage ID: ${storageId}`);
      }

      // Download and optimize the stored image
      return await this.downloadAndOptimizeImage(imageUrl, productName);
    } catch (error) {
      logger.error(
        `Failed to download and optimize stored image ${storageId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Download, optimize and upload a single image to Convex storage
   */
  private async downloadAndOptimizeImage(
    imageUrl: string,
    productName: string
  ): Promise<{
    originalSize: number;
    optimizedSize: number;
    storageId: string;
    wasOptimized: boolean;
  } | null> {
    logger.info(`Downloading image for ${productName}: ${imageUrl}`);

    // Handle SSL certificate issues with Gongcha website
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    try {
      // Extract the domain from the image URL to set appropriate referer
      const imageUrlObj = new URL(imageUrl);
      const refererUrl = `${imageUrlObj.protocol}//${imageUrlObj.hostname}/`;

      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          Referer: refererUrl,
        },
      });

      if (!response.ok) {
        logger.warn(
          `Failed to download image for ${productName}: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);
      const originalSize = imageBuffer.length;

      // Check if already WebP
      const metadata = await sharp(imageBuffer).metadata();
      let finalBuffer: Buffer = imageBuffer;
      let wasOptimized = false;
      let finalSize = originalSize;

      if (metadata.format !== 'webp') {
        // Optimize using Sharp
        finalBuffer = Buffer.from(
          await sharp(imageBuffer).webp({ quality: 85, effort: 6 }).toBuffer()
        );
        finalSize = finalBuffer.length;
        wasOptimized = true;

        const reduction = (
          ((originalSize - finalSize) / originalSize) *
          100
        ).toFixed(1);

        logger.info(
          `Optimized ${productName}: ${originalSize} bytes → ${finalSize} bytes (${reduction}% reduction)`
        );
      } else {
        logger.info(`Image for ${productName} is already WebP format`);
      }

      // Upload to Convex storage
      const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
      const uploadUrl = await this.client.mutation(api.http.generateUploadUrl, {
        uploadSecret,
      });

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/webp',
        },
        body: new Uint8Array(finalBuffer),
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Failed to upload optimized image: ${uploadResponse.statusText}`
        );
      }

      const { storageId } = await uploadResponse.json();

      logger.info(`Uploaded ${productName} image to storage: ${storageId}`);

      return {
        originalSize,
        optimizedSize: finalSize,
        storageId: storageId as string,
        wasOptimized,
      };
    } finally {
      // Restore original SSL setting
      if (originalRejectUnauthorized !== undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = undefined;
      }
    }
  }

  /**
   * Log optimization results
   */
  private logOptimizationResults(stats: {
    optimizedCount: number;
    totalSizeBefore: number;
    totalSizeAfter: number;
  }): void {
    if (stats.optimizedCount === 0) {
      return;
    }

    const totalReduction =
      stats.totalSizeBefore > 0
        ? (
            ((stats.totalSizeBefore - stats.totalSizeAfter) /
              stats.totalSizeBefore) *
            100
          ).toFixed(1)
        : '0';
    const sizeMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

    logger.info('=== Image Optimization Results ===');
    logger.info(`Images optimized: ${stats.optimizedCount}`);
    logger.info(`Total size before: ${sizeMB(stats.totalSizeBefore)} MB`);
    logger.info(`Total size after: ${sizeMB(stats.totalSizeAfter)} MB`);
    logger.info(`Total reduction: ${totalReduction}%`);
    logger.info(
      `Space saved: ${sizeMB(stats.totalSizeBefore - stats.totalSizeAfter)} MB`
    );
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

// Only run if this file is executed directly (not imported)
if (process.argv[1]?.endsWith('uploader.ts')) {
  main().catch((error) => {
    logger.error('Application error:', error);
    process.exit(1);
  });
}

export { ProductUploader };
