#!/usr/bin/env tsx

import { ConvexHttpClient } from 'convex/browser';
import sharp from 'sharp';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { logger } from '../shared/logger';

const CONVEX_URL = process.env.VITE_CONVEX_URL;
const UPLOAD_SECRET = process.env.CONVEX_UPLOAD_SECRET;

if (!CONVEX_URL) {
  logger.error('CONVEX_URL environment variable is required');
  process.exit(1);
}

if (!UPLOAD_SECRET) {
  logger.error('CONVEX_UPLOAD_SECRET environment variable is required');
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);

interface ImageOptimizationStats {
  processed: number;
  optimized: number;
  failed: number;
  totalSizeBefore: number;
  totalSizeAfter: number;
}

class ImageOptimizer {
  private stats: ImageOptimizationStats = {
    processed: 0,
    optimized: 0,
    failed: 0,
    totalSizeBefore: 0,
    totalSizeAfter: 0,
  };

  async optimizeImage(imageBuffer: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      const optimizedBuffer = await sharp(imageBuffer)
        .webp({
          quality: 85,
          effort: 6,
        })
        .toBuffer();

      this.stats.totalSizeBefore += imageBuffer.byteLength;
      this.stats.totalSizeAfter += optimizedBuffer.byteLength;

      // Convert Buffer to ArrayBuffer
      const arrayBuffer = new ArrayBuffer(optimizedBuffer.byteLength);
      const view = new Uint8Array(arrayBuffer);
      view.set(optimizedBuffer);
      return arrayBuffer;
    } catch (error) {
      logger.error('Error optimizing image:', error);
      throw error;
    }
  }

  async downloadImage(url: string): Promise<ArrayBuffer> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      return await response.arrayBuffer();
    } catch (error) {
      logger.error(`Error downloading image from ${url}:`, error);
      throw error;
    }
  }

  async uploadOptimizedImage(
    imageBuffer: ArrayBuffer
  ): Promise<Id<'_storage'>> {
    try {
      // Generate upload URL
      const uploadUrl = await convex.mutation(api.http.generateUploadUrl, {
        uploadSecret: UPLOAD_SECRET,
      });

      // Upload the optimized image
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/webp',
        },
        body: new Blob([imageBuffer], { type: 'image/webp' }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to upload optimized image: ${response.statusText}`
        );
      }

      const { storageId } = await response.json();
      return storageId as Id<'_storage'>;
    } catch (error) {
      logger.error('Error uploading optimized image:', error);
      throw error;
    }
  }

  async processStoredImage(
    storageId: Id<'_storage'>
  ): Promise<Id<'_storage'> | null> {
    try {
      // Get the image URL from storage
      const imageUrl = await convex.query(api.http.getStorageUrl, {
        storageId,
      });
      if (!imageUrl) {
        logger.warn(`No URL found for storage ID: ${storageId}`);
        return null;
      }

      // Download the original image
      const originalImageBuffer = await this.downloadImage(imageUrl);

      // Check if it's already optimized (WebP)
      const imageFormat = await sharp(originalImageBuffer).metadata();
      if (imageFormat.format === 'webp') {
        logger.info(`Image ${storageId} is already in WebP format`);
        return null;
      }

      // Optimize the image
      const optimizedImageBuffer =
        await this.optimizeImage(originalImageBuffer);

      // Upload the optimized version
      const newStorageId =
        await this.uploadOptimizedImage(optimizedImageBuffer);

      this.stats.optimized++;

      const sizeBefore = originalImageBuffer.byteLength;
      const sizeAfter = optimizedImageBuffer.byteLength;
      const reduction = (((sizeBefore - sizeAfter) / sizeBefore) * 100).toFixed(
        1
      );

      logger.info(
        `Optimized image ${storageId} -> ${newStorageId}: ${sizeBefore} bytes -> ${sizeAfter} bytes (${reduction}% reduction)`
      );

      return newStorageId;
    } catch (error) {
      logger.error(`Error processing image ${storageId}:`, error);
      this.stats.failed++;
      return null;
    }
  }

  async optimizeProductImages(): Promise<void> {
    logger.info('Starting product image optimization...');

    try {
      // Get all products with images
      const products = await convex.query(api.products.getAllWithImages, {});

      logger.info(`Found ${products.length} products with images to process`);

      for (const product of products) {
        if (!product.imageStorageId) {
          continue;
        }

        this.stats.processed++;
        logger.info(
          `Processing product: ${product.name} (${this.stats.processed}/${products.length})`
        );

        const newStorageId = await this.processStoredImage(
          product.imageStorageId
        );

        if (newStorageId) {
          // Update the product with the new optimized image
          await convex.mutation(api.products.updateImage, {
            productId: product._id,
            storageId: newStorageId,
            uploadSecret: UPLOAD_SECRET,
          });

          logger.info(`Updated product ${product.name} with optimized image`);
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error optimizing product images:', error);
      throw error;
    }
  }

  async optimizeCafeImages(): Promise<void> {
    logger.info('Starting cafe image optimization...');

    try {
      // Get all cafes with images
      const cafes = await convex.query(api.cafes.getAllWithImages, {});

      logger.info(`Found ${cafes.length} cafes with images to process`);

      for (const cafe of cafes) {
        if (!cafe.imageStorageId) {
          continue;
        }

        this.stats.processed++;
        logger.info(
          `Processing cafe: ${cafe.name} (${this.stats.processed}/${cafes.length})`
        );

        const newStorageId = await this.processStoredImage(cafe.imageStorageId);

        if (newStorageId) {
          // Update the cafe with the new optimized image
          await convex.mutation(api.cafes.updateImage, {
            cafeId: cafe._id,
            storageId: newStorageId,
            uploadSecret: UPLOAD_SECRET,
          });

          logger.info(`Updated cafe ${cafe.name} with optimized image`);
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error optimizing cafe images:', error);
      throw error;
    }
  }

  async optimizeUserImages(): Promise<void> {
    logger.info('Starting user image optimization...');

    try {
      // Get all users with images
      const users = await convex.query(api.users.getAllWithImages, {});

      logger.info(`Found ${users.length} users with images to process`);

      for (const user of users) {
        if (!user.imageStorageId) {
          continue;
        }

        this.stats.processed++;
        logger.info(
          `Processing user: ${user.name} (${this.stats.processed}/${users.length})`
        );

        const newStorageId = await this.processStoredImage(user.imageStorageId);

        if (newStorageId) {
          // Update the user with the new optimized image
          await convex.mutation(api.users.updateImage, {
            userId: user._id,
            storageId: newStorageId,
            uploadSecret: UPLOAD_SECRET,
          });

          logger.info(`Updated user ${user.name} with optimized image`);
        }

        // Add a small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error optimizing user images:', error);
      throw error;
    }
  }

  async optimizeReviewImages(): Promise<void> {
    logger.info('Starting review image optimization...');

    try {
      // Get all reviews with images
      const reviews = await convex.query(api.reviews.getAllWithImages, {});

      logger.info(`Found ${reviews.length} reviews with images to process`);

      for (const review of reviews) {
        if (!review.imageStorageIds || review.imageStorageIds.length === 0) {
          continue;
        }

        this.stats.processed++;
        logger.info(
          `Processing review images (${this.stats.processed}/${reviews.length})`
        );

        const optimizedImageIds: Id<'_storage'>[] = [];

        for (const imageStorageId of review.imageStorageIds) {
          const newStorageId = await this.processStoredImage(imageStorageId);
          optimizedImageIds.push(newStorageId || imageStorageId);
        }

        // Update the review with optimized images
        await convex.mutation(api.reviews.updateImages, {
          reviewId: review._id,
          imageStorageIds: optimizedImageIds,
          uploadSecret: UPLOAD_SECRET,
        });

        logger.info('Updated review with optimized images');

        // Add a small delay to avoid overwhelming the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      logger.error('Error optimizing review images:', error);
      throw error;
    }
  }

  printStats(): void {
    logger.info('=== Image Optimization Complete ===');
    logger.info(`Total images processed: ${this.stats.processed}`);
    logger.info(`Successfully optimized: ${this.stats.optimized}`);
    logger.info(`Failed to optimize: ${this.stats.failed}`);

    if (this.stats.totalSizeBefore > 0) {
      const totalReduction = (
        ((this.stats.totalSizeBefore - this.stats.totalSizeAfter) /
          this.stats.totalSizeBefore) *
        100
      ).toFixed(1);
      const sizeMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);

      logger.info(
        `Total size before: ${sizeMB(this.stats.totalSizeBefore)} MB`
      );
      logger.info(`Total size after: ${sizeMB(this.stats.totalSizeAfter)} MB`);
      logger.info(`Total reduction: ${totalReduction}%`);
      logger.info(
        `Space saved: ${sizeMB(this.stats.totalSizeBefore - this.stats.totalSizeAfter)} MB`
      );
    }
  }
}

async function main(): Promise<void> {
  const optimizer = new ImageOptimizer();

  try {
    logger.info('Starting image optimization process...');

    // Process all image types
    await optimizer.optimizeProductImages();
    await optimizer.optimizeCafeImages();
    await optimizer.optimizeUserImages();
    await optimizer.optimizeReviewImages();

    optimizer.printStats();
  } catch (error) {
    logger.error('Image optimization failed:', error);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}
