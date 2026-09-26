#!/usr/bin/env ts-node
import fs from "node:fs";
import path from "node:path";
import { ConvexClient } from "convex/browser";
import dotenv from "dotenv";
import sharp from "sharp";
import { api } from "../../convex/_generated/api";
import { logger } from "../../shared/logger";
import { dedupeByExternalId } from "./dedupe";
import {
  type PreparedImage,
  type ProductImageDeps,
  resolveProductImage,
  summarizeImageOutcomes,
} from "./product-image";

const IMAGE_CONCURRENCY = process.env.IMAGE_CONCURRENCY
  ? Number(process.env.IMAGE_CONCURRENCY)
  : 10;

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const CONVEX_URL = process.env.VITE_CONVEX_URL;

interface UploadOptions {
  cafeSlug: string;
  dryRun?: boolean;
  file: string;
  verbose?: boolean;
}

interface ProductData {
  category: string;
  description: string | null;
  externalCategory: string | null;
  externalId: string;
  externalImageUrl: string;
  externalUrl: string;
  // added by this script
  imageStorageId?: string;
  name: string;
  nameEn: string | null;
  price: number | null;
}

interface UploadResult {
  created: number;
  errors: string[];
  message?: string;
  processed: number;
  processingTime: number;
  reactivated: number;
  reactivatedProducts?: string[];
  removed: number;
  removedProducts?: string[];
  samples?: Array<{ name: string; category: string }>;
  skipped: number;
  unchanged: number;
  updated: number;
}

class ProductUploader {
  private readonly client: ConvexClient;

  constructor() {
    logger.info(`Initializing ConvexClient with URL: ${CONVEX_URL}`);
    try {
      if (!CONVEX_URL) {
        throw new Error("VITE_CONVEX_URL is not set");
      }
      this.client = new ConvexClient(CONVEX_URL);
      logger.info("ConvexClient initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize ConvexClient:", error);
      throw error;
    }
  }

  async uploadFromFile(options: UploadOptions): Promise<UploadResult> {
    const { file, cafeSlug, dryRun = false, verbose = false } = options;

    // Images are always downloaded and optimized
    const downloadImages = true;

    const filePath = this.resolveFilePath(file);
    const rawProducts = this.readAndValidateFile(filePath);

    if (verbose) {
      this.logUploadInfo(filePath, cafeSlug, dryRun);
    }

    logger.info(`Found ${rawProducts.length} products in file`);

    const products = this.dedupeProducts(rawProducts, verbose);

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
      logger.error("Upload failed:", error);
      if (error instanceof Error) {
        logger.error("Error message:", error.message);
        logger.error("Error stack:", error.stack);
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

  private readAndValidateFile(filePath: string): ProductData[] {
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let products: ProductData[];

    try {
      products = JSON.parse(fileContent);
    } catch (error) {
      throw new Error(`Invalid JSON in file ${filePath}: ${error}`);
    }

    if (!Array.isArray(products)) {
      throw new Error("JSON file must contain an array of products");
    }

    return products;
  }

  /**
   * Drop repeated rows before uploading. Every extra row for an externalId
   * patches the same record again inside the upload transaction, so this is
   * pure write amplification -- and when the rows differ, whichever came last
   * in the file silently won.
   */
  private dedupeProducts(
    products: ProductData[],
    verbose: boolean
  ): ProductData[] {
    const report = dedupeByExternalId(products);

    if (report.exactDuplicatesDropped > 0) {
      logger.info(
        `Dropped ${report.exactDuplicatesDropped} duplicate row(s) that were identical to a row already being uploaded`
      );
    }

    if (report.conflicts.length > 0) {
      const extras = report.conflicts.reduce(
        (sum, c) => sum + (c.variants - 1),
        0
      );
      logger.warn(
        `${report.conflicts.length} externalId(s) map to ${report.conflicts.length + extras} different products; keeping the first of each and skipping ${extras} row(s). The crawler's externalId scheme cannot tell these apart.`
      );
      const shown = verbose ? report.conflicts : report.conflicts.slice(0, 5);
      for (const conflict of shown) {
        logger.warn(
          `  ${conflict.externalId} -> ${conflict.variants} variants (${conflict.name})`
        );
      }
      if (!verbose && report.conflicts.length > shown.length) {
        logger.warn(
          `  ...and ${report.conflicts.length - shown.length} more; use --verbose to see all`
        );
      }
    }

    if (report.products.length !== products.length) {
      logger.info(`Uploading ${report.products.length} unique product(s)`);
    }

    return report.products;
  }

  private logUploadInfo(
    filePath: string,
    cafeSlug: string,
    dryRun: boolean
  ): void {
    logger.info(`Reading file: ${filePath}`);
    logger.info(`Cafe: ${cafeSlug}`);
    logger.info(`Dry run: ${dryRun ? "Yes" : "No"}`);
  }

  private async performUpload(
    products: ProductData[],
    cafeSlug: string,
    dryRun: boolean,
    downloadImages: boolean
  ): Promise<UploadResult> {
    const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (!uploadSecret) {
      throw new Error("CONVEX_UPLOAD_SECRET environment variable is required");
    }

    // Pre-process images if downloadImages is enabled
    // Download, optimize to WebP, and upload to storage before sending product data.
    // On a dry run images are still downloaded and optimized (to catch broken
    // URLs and report sizes) but never uploaded to storage.
    const processedProducts = downloadImages
      ? await this.preprocessImages(products, cafeSlug, dryRun)
      : products;

    // Send products to server with pre-processed images (already in WebP format)
    // downloadImages=false tells server not to download again since we already did it
    return await this.client.mutation(api.dataUploader.uploadProductsFromJson, {
      products: processedProducts,
      cafeSlug,
      dryRun,
      downloadImages: false, // Images already processed and uploaded
      uploadSecret,
    });
  }

  /**
   * Get existing products from database with their image storage IDs
   */
  private async getExistingProductsWithImages(
    cafeSlug: string,
    externalIds: string[]
  ): Promise<Map<string, { imageStorageId?: string }>> {
    try {
      const existingProducts = await this.client.query(
        api.products.getByExternalIds,
        {
          cafeSlug,
          externalIds,
        }
      );

      const productMap = new Map<string, { imageStorageId?: string }>();
      for (const product of existingProducts) {
        productMap.set(product.externalId, {
          imageStorageId: product.imageStorageId,
        });
      }

      return productMap;
    } catch (error) {
      logger.warn("Failed to fetch existing products from database:", error);
      // Return empty map to continue with normal processing
      return new Map();
    }
  }

  /**
   * Pre-process images for all products
   * Downloads, converts to WebP, and uploads to storage (skipped on dry run)
   * Skips products that already have images in the database
   */
  private async preprocessImages(
    products: ProductData[],
    cafeSlug: string,
    dryRun: boolean
  ): Promise<ProductData[]> {
    logger.info(
      `Pre-processing images for ${products.length} products${dryRun ? " (dry run: nothing will be uploaded to storage)" : ""}...`
    );

    // Get existing products from database to check for images
    const existingProductsMap = await this.getExistingProductsWithImages(
      cafeSlug,
      products.map((p) => p.externalId)
    );

    const deps: ProductImageDeps = {
      prepareImage: (imageUrl, productName) =>
        this.downloadAndOptimizeImage(imageUrl, productName),
      uploadImage: (image) => this.uploadImageToStorage(image),
    };

    const results: Awaited<ReturnType<typeof resolveProductImage>>[] = [];
    const processedProducts: ProductData[] = [];

    for (let i = 0; i < products.length; i += IMAGE_CONCURRENCY) {
      const batch = products.slice(i, i + IMAGE_CONCURRENCY);
      logger.info(
        `Processing image batch ${Math.floor(i / IMAGE_CONCURRENCY) + 1}/${Math.ceil(products.length / IMAGE_CONCURRENCY)} (${batch.length} products)`
      );

      const batchResults = await Promise.all(
        batch.map((product) =>
          resolveProductImage(
            product,
            existingProductsMap.get(product.externalId)?.imageStorageId,
            deps,
            dryRun
          )
        )
      );
      for (const result of batchResults) {
        this.logImageOutcome(result.product.name, result.outcome);
        results.push(result);
        processedProducts.push(result.product);
      }
    }

    const summary = summarizeImageOutcomes(results.map((r) => r.outcome));
    const kb = (summary.bytes / 1024).toFixed(1);
    if (dryRun) {
      logger.info(
        `Image dry run: ${summary.newImages} would be uploaded (${kb} KB WebP), ${summary.reused} already in storage, ${summary.failed} failed to download, ${summary.noImage} without image URL`
      );
    } else {
      logger.info(
        `Completed image pre-processing: ${summary.newImages} uploaded (${kb} KB), ${summary.reused} reused, ${summary.failed} failed, ${summary.noImage} without image URL`
      );
    }

    return processedProducts;
  }

  private logImageOutcome(
    productName: string,
    outcome: Awaited<ReturnType<typeof resolveProductImage>>["outcome"]
  ): void {
    switch (outcome.kind) {
      case "reused":
        logger.info(
          `⏭️  Skipping image for ${productName} (already has image: ${outcome.storageId})`
        );
        break;
      case "uploaded":
        logger.info(
          `✓ Processed image for ${productName}: ${outcome.storageId}`
        );
        break;
      case "would-upload":
        logger.info(
          `✓ Would upload image for ${productName} (${outcome.bytes} bytes)`
        );
        break;
      case "failed":
        if (outcome.error) {
          logger.error(
            `Error processing image for ${productName}:`,
            outcome.error
          );
        } else {
          logger.warn(`✗ Failed to process image for ${productName}`);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Download a single image and optimize it to WebP
   */
  private async downloadAndOptimizeImage(
    imageUrl: string,
    productName: string
  ): Promise<PreparedImage | null> {
    logger.info(`Downloading image for ${productName}: ${imageUrl}`);

    // Handle SSL certificate issues with Gongcha website
    const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    try {
      // Extract the domain from the image URL to set appropriate referer
      const imageUrlObj = new URL(imageUrl);
      const refererUrl = `${imageUrlObj.protocol}//${imageUrlObj.hostname}/`;

      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
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
      if (metadata.format === "webp") {
        logger.info(`Image for ${productName} is already WebP format`);
        return {
          buffer: imageBuffer,
          originalSize,
          optimizedSize: originalSize,
        };
      }

      // Optimize using Sharp
      const optimized = Buffer.from(
        await sharp(imageBuffer).webp({ quality: 85, effort: 6 }).toBuffer()
      );
      const reduction = (
        ((originalSize - optimized.length) / originalSize) *
        100
      ).toFixed(1);
      logger.info(
        `Optimized ${productName}: ${originalSize} bytes → ${optimized.length} bytes (${reduction}% reduction)`
      );

      return {
        buffer: optimized,
        originalSize,
        optimizedSize: optimized.length,
      };
    } finally {
      // Restore original SSL setting
      if (originalRejectUnauthorized === undefined) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = undefined;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
      }
    }
  }

  /**
   * Upload an optimized image to Convex storage
   */
  private async uploadImageToStorage(image: PreparedImage): Promise<string> {
    const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
    const uploadUrl = await this.client.mutation(api.http.generateUploadUrl, {
      uploadSecret,
    });

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "image/webp",
      },
      body: new Uint8Array(image.buffer),
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Failed to upload optimized image: ${uploadResponse.statusText}`
      );
    }

    const { storageId } = await uploadResponse.json();
    return storageId as string;
  }

  private handleUploadResult(
    result: UploadResult,
    verbose: boolean,
    dryRun: boolean
  ): void {
    this.printResults(result, verbose);

    if (!dryRun && result.errors.length === 0) {
      logger.info("Upload completed successfully!");
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
    logger.info("Results:");
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
      logger.info("Sample processed products:");
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
      logger.info("\n❌ Removed Products Summary:");
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
        logger.info("  Use --verbose to see product names");
      }
    }
  }

  private printReactivatedProductsSection(
    result: UploadResult,
    verbose: boolean
  ): void {
    if (result.reactivated && result.reactivated > 0) {
      logger.info("\n✅ Reactivated Products Summary:");
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
        logger.info("  Use --verbose to see product names");
      }
    }
  }

  private printLifecycleSummary(result: UploadResult): void {
    if (
      (result.removed && result.removed > 0) ||
      (result.reactivated && result.reactivated > 0)
    ) {
      logger.info("\n📊 Product Lifecycle Summary:");
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
    logger.info("Starting main function...");
    const args = process.argv.slice(2);

    logger.info("Creating ProductUploader instance...");
    const uploader = new ProductUploader();
    logger.info("ProductUploader created successfully");

    // Default upload command
    const options: UploadOptions = {
      file: "",
      cafeSlug: "",
      dryRun: args.includes("--dry-run"),
      verbose: args.includes("--verbose") || args.includes("-v"),
    };

    // Parse file option
    const fileIndex = args.indexOf("--file");
    if (fileIndex !== -1 && args[fileIndex + 1]) {
      options.file = args[fileIndex + 1];
    }

    const cafeSlugIndex = args.indexOf("--cafe-slug");
    if (cafeSlugIndex !== -1 && args[cafeSlugIndex + 1]) {
      options.cafeSlug = args[cafeSlugIndex + 1];
    }

    await uploader.uploadFromFile(options);
    process.exit(0);
  } catch (error) {
    logger.error("Upload failed:", error);
    if (error instanceof Error) {
      logger.error("Error message:", error.message);
      logger.error("Error stack:", error.stack);
    }
    process.exit(1);
  }
}

// Only run if this file is executed directly (not imported)
if (process.argv[1]?.endsWith("uploader.ts")) {
  main().catch((error) => {
    logger.error("Application error:", error);
    process.exit(1);
  });
}

export { ProductUploader };
