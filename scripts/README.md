# Storage Cleanup Script

This directory contains maintenance scripts for the janjum project.

## cleanupStorage.ts

A script to identify and remove dangling files in Convex storage.

### What are dangling files?

Dangling files are storage files that exist in your Convex storage but are not referenced by any database records in:
- `cafes.imageStorageId`
- `products.imageStorageId`
- `reviews.imageStorageIds`
- `users.imageStorageId`

These files can accumulate over time when:
- Records are deleted but associated files aren't cleaned up
- File uploads fail after the file is stored but before the database record is created
- Development/testing creates temporary files that aren't properly cleaned up

### Usage

```bash
# Show help
pnpm cleanup-storage --help

# Dry run (recommended first) - shows what would be deleted
pnpm cleanup-storage

# Show storage statistics only
pnpm cleanup-storage --stats

# Actually delete dangling files (PERMANENT)
pnpm cleanup-storage --delete

# For production environment
pnpm cleanup-storage:prod --delete
```

### Environment Variables

- `VITE_CONVEX_URL` - Your Convex deployment URL (required)
- `CONVEX_UPLOAD_SECRET` - Upload secret for file operations (required for deletion)

### Safety Features

1. **Dry run by default** - The script shows what would be deleted without actually deleting anything
2. **Confirmation prompt** - When using `--delete`, you must confirm the deletion
3. **Batch processing** - Files are deleted in batches of 10 for better error handling
4. **Detailed logging** - Full details of what's being deleted and any errors
5. **Upload secret protection** - Requires `CONVEX_UPLOAD_SECRET` to prevent unauthorized deletions

### Output Example

```
[INFO] Scanning database for image references...
[INFO] Found 1250 storage files
[INFO] Starting dangling file detection...
[INFO] Getting metadata for 23 dangling files...
[INFO] Found 23 dangling file(s):
  - product-image-old.jpg (45.2KB, image/jpeg) - ID: k123...
  - user-avatar-temp.png (12.8KB, image/png) - ID: k456...
[INFO] Total size: 1.24MB
[INFO] DRY RUN: No files were deleted. Use --delete to actually remove them.
```

### How It Works

1. **Scan database** - Queries all tables to find storage file references (optimized to only fetch records with images)
2. **Get all storage files** - Retrieves list of all files in Convex storage using pagination (handles 15K+ files)
3. **Find dangling files** - Identifies files not referenced by any database record
4. **Get metadata** - Fetches file information (name, size, type) in batches
5. **Display results** - Shows what files would be deleted with sizes
6. **Delete (if requested)** - Removes files in batches with error handling

### Important Production Notes

**Pagination Support**: The script automatically handles large storage collections using cursor-based pagination. In production with 15K+ files, it will fetch in chunks of 8,000 files per page to avoid Convex query limits.

**Deployment Required**: After updating the script, you must deploy the new Convex functions:
```bash
npx convex deploy
```

### Convex Functions Added

The script requires these new Convex functions that were added:

**Storage Functions** (in `convex/storage.ts`):
- `getAllStorageFiles` - Lists all storage file IDs with cursor-based pagination
- `getStorageMetadata` - Gets metadata for multiple files in batches
- `deleteStorageFiles` - Batch delete storage files with upload secret protection
- `getStorageStats` - Storage usage statistics

**Optimized Database Queries**:
- `cafes.getAllWithImages` - Get only cafes with images
- `products.getAllWithImages` - Get only products with images
- `reviews.getAllWithImages` - Get only reviews with images
- `users.getAllWithImages` - Get only users with images

These optimized queries reduce data transfer and improve performance by only fetching records that actually reference storage files.

### Warning

**This script permanently deletes files from Convex storage. Always run with dry run first and verify the list of files to be deleted before using `--delete`.**
