#!/usr/bin/env tsx

/**
 * Script to identify and remove dangling files in Convex storage
 *
 * Dangling files are storage files that exist in Convex storage
 * but are not referenced by any database records.
 */

import { createInterface } from 'node:readline';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { logger } from '../shared/logger';

// Initialize Convex client
const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  logger.error('VITE_CONVEX_URL environment variable is required');
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);

interface StorageReference {
  table: string;
  field: string;
  recordId: string;
  storageId: Id<'_storage'>;
}

interface DanglingFile {
  storageId: Id<'_storage'>;
  filename?: string;
  size?: number;
  contentType?: string;
}

async function getAllStorageFiles(): Promise<Id<'_storage'>[]> {
  try {
    logger.info('Fetching all storage files...');
    const allStorageIds: Id<'_storage'>[] = [];
    let cursor: string | null = null;
    let hasMore = true;
    let pageCount = 0;

    while (hasMore) {
      pageCount++;
      logger.info(
        `Fetching page ${pageCount}${cursor ? ` (cursor: ${cursor.slice(0, 8)}...)` : ''}...`
      );

      const result: {
        files: Id<'_storage'>[];
        nextCursor: Id<'_storage'> | null | undefined;
        hasMore: boolean;
        total: number;
      } = await client.query(api.storage.getAllStorageFiles, {
        cursor: cursor || undefined,
        limit: 8000,
      });

      allStorageIds.push(...result.files);
      cursor = result.nextCursor || null;
      hasMore = result.hasMore;

      logger.info(
        `Page ${pageCount}: Got ${result.files.length} files (total so far: ${allStorageIds.length})`
      );
    }

    logger.info(`Found ${allStorageIds.length} total storage files`);
    return allStorageIds;
  } catch (error) {
    logger.error('Error fetching storage files:', error);
    throw error;
  }
}

async function getCafeReferences(): Promise<StorageReference[]> {
  const references: StorageReference[] = [];
  const cafes = await client.query(api.cafes.getAllWithImages);
  for (const cafe of cafes) {
    references.push({
      table: 'cafes',
      field: 'imageStorageId',
      recordId: cafe._id,
      // biome-ignore lint/style/noNonNullAssertion: safe by query
      storageId: cafe.imageStorageId!,
    });
  }
  return references;
}

async function getProductReferences(): Promise<StorageReference[]> {
  const references: StorageReference[] = [];
  const products = await client.query(api.products.getAllWithImages);
  for (const product of products) {
    references.push({
      table: 'products',
      field: 'imageStorageId',
      recordId: product._id,
      // biome-ignore lint/style/noNonNullAssertion: safe by query
      storageId: product.imageStorageId!,
    });
  }
  return references;
}

async function getReviewReferences(): Promise<StorageReference[]> {
  const references: StorageReference[] = [];
  const reviews = await client.query(api.reviews.getAllWithImages);
  for (const review of reviews) {
    // biome-ignore lint/style/noNonNullAssertion: safe by query
    for (const storageId of review.imageStorageIds!) {
      references.push({
        table: 'reviews',
        field: 'imageStorageIds',
        recordId: review._id,
        storageId,
      });
    }
  }
  return references;
}

async function getUserReferences(): Promise<StorageReference[]> {
  const references: StorageReference[] = [];
  const users = await client.query(api.users.getAllWithImages);
  for (const user of users) {
    references.push({
      table: 'users',
      field: 'imageStorageId',
      recordId: user._id,
      // biome-ignore lint/style/noNonNullAssertion: safe by query
      storageId: user.imageStorageId!,
    });
  }
  return references;
}

async function getStorageReferences(): Promise<StorageReference[]> {
  try {
    logger.info('Scanning database for image references...');

    const [cafeRefs, productRefs, reviewRefs, userRefs] = await Promise.all([
      getCafeReferences(),
      getProductReferences(),
      getReviewReferences(),
      getUserReferences(),
    ]);

    return [...cafeRefs, ...productRefs, ...reviewRefs, ...userRefs];
  } catch (error) {
    logger.error('Error getting storage references:', error);
    throw error;
  }
}

async function findDanglingFiles(): Promise<DanglingFile[]> {
  logger.info('Starting dangling file detection...');

  const [allStorageFiles, references] = await Promise.all([
    getAllStorageFiles(),
    getStorageReferences(),
  ]);

  const referencedStorageIds = new Set(references.map((ref) => ref.storageId));
  const danglingFiles: DanglingFile[] = [];

  const danglingStorageIds = allStorageFiles.filter(
    (id) => !referencedStorageIds.has(id)
  );

  if (danglingStorageIds.length === 0) {
    return [];
  }

  // Get metadata for all dangling files
  logger.info(
    `Getting metadata for ${danglingStorageIds.length} dangling files...`
  );
  try {
    const metadataResults = await client.query(api.storage.getStorageMetadata, {
      storageIds: danglingStorageIds,
    });

    for (const result of metadataResults) {
      danglingFiles.push({
        storageId: result.storageId,
        size: result.metadata?.size,
        contentType: result.metadata?.contentType,
      });
    }
  } catch (error) {
    logger.warn(
      'Could not get metadata for some files, proceeding with basic info:',
      error
    );
    // Fallback to basic storage ID info
    for (const storageId of danglingStorageIds) {
      danglingFiles.push({ storageId });
    }
  }

  return danglingFiles;
}

function promptForConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function displayDanglingFiles(files: DanglingFile[]): void {
  logger.info(`Found ${files.length} dangling file(s):`);

  let totalSize = 0;
  for (const file of files) {
    if (file.size) {
      totalSize += file.size;
    }
  }

  if (totalSize > 0) {
    logger.info(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  }
}

async function performDeletion(files: DanglingFile[]): Promise<void> {
  const uploadSecret = process.env.CONVEX_UPLOAD_SECRET;
  if (!uploadSecret) {
    logger.error(
      'CONVEX_UPLOAD_SECRET environment variable is required for deletion'
    );
    return;
  }

  logger.info('Deleting dangling files...');

  const batchSize = 10;
  let totalDeleted = 0;
  let totalFailed = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const storageIds = batch.map((f) => f.storageId);

    try {
      logger.info(
        `Deleting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${batch.length} files)`
      );

      const result = await client.mutation(api.storage.deleteStorageFiles, {
        storageIds,
        uploadSecret,
      });

      totalDeleted += result.successCount;
      totalFailed += result.failureCount;

      if (result.failureCount > 0) {
        logger.warn(
          `${result.failureCount} files failed to delete in this batch`
        );
        for (const failedResult of result.results.filter((r) => !r.success)) {
          logger.error(
            `Failed to delete ${failedResult.storageId}: ${failedResult.error}`
          );
        }
      }
    } catch (error) {
      logger.error(`Failed to delete batch starting at index ${i}:`, error);
      totalFailed += batch.length;
    }
  }

  logger.info(
    `Deletion complete: ${totalDeleted} successful, ${totalFailed} failed out of ${files.length} total files.`
  );
}

async function deleteDanglingFiles(
  files: DanglingFile[],
  dryRun = true
): Promise<void> {
  if (files.length === 0) {
    logger.info('No dangling files found.');
    return;
  }

  displayDanglingFiles(files);

  if (dryRun) {
    logger.info(
      'DRY RUN: No files were deleted. Use --delete to actually remove them.'
    );
    return;
  }

  const confirmed = await promptForConfirmation(
    `Are you sure you want to delete these ${files.length} dangling file(s)?`
  );

  if (!confirmed) {
    logger.info('Deletion cancelled.');
    return;
  }

  await performDeletion(files);
}

async function showStorageStats() {
  try {
    logger.info('Fetching storage statistics...');
    const stats = await client.query(api.storage.getStorageStats);

    logger.info(`Storage Statistics:
  Total files: ${stats.totalFiles}
  Total size: ${stats.totalSizeMB} MB
  Content types: ${JSON.stringify(stats.contentTypes, null, 2)}`);
  } catch (error) {
    logger.error('Error fetching storage statistics:', error);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--delete');
  const help = args.includes('--help') || args.includes('-h');
  const stats = args.includes('--stats');

  if (help) {
    logger.info(`Usage: tsx scripts/cleanupDanglingStorage.ts [options]

Options:
  --delete    Actually delete dangling files (default is dry run)
  --stats     Show storage statistics only
  --help, -h  Show this help message

This script identifies storage files in Convex that are not referenced
by any database records and optionally removes them.

Environment variables required:
  VITE_CONVEX_URL      Your Convex deployment URL
  CONVEX_UPLOAD_SECRET Upload secret for file operations (required for deletion)

Examples:
  # Dry run (list dangling files without deleting)
  tsx scripts/cleanupDanglingStorage.ts

  # Actually delete dangling files
  tsx scripts/cleanupDanglingStorage.ts --delete

  # Show storage statistics only
  tsx scripts/cleanupDanglingStorage.ts --stats`);
    return;
  }

  try {
    if (stats) {
      await showStorageStats();
      return;
    }

    if (dryRun) {
      logger.info('Running in DRY RUN mode - no files will be deleted');
    } else {
      logger.info('Running in DELETE mode - files will be permanently removed');
    }

    const danglingFiles = await findDanglingFiles();
    await deleteDanglingFiles(danglingFiles, dryRun);
  } catch (error) {
    logger.error('Script failed:', error);
    process.exit(1);
  }
}

// Self-executing async function
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}
