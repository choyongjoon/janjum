import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { type ActionCtx, action } from './_generated/server';

type DownloadResult = {
  success: boolean;
  storageId?: Id<'_storage'>;
  message?: string;
  error?: string;
};

export const downloadAndStoreImageAction = action({
  args: {
    imageUrl: v.string(),
    productId: v.id('products'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    { imageUrl, productId, uploadSecret }
  ): Promise<DownloadResult> => {
    let storageId: Id<'_storage'> | null = null;

    try {
      // Verify the product still exists before downloading
      const product: Doc<'products'> | null = await ctx.runQuery(
        api.products.getById,
        { productId }
      );
      if (!product) {
        throw new Error(`Product ${productId} no longer exists`);
      }

      // If product already has an image, don't download again
      if (product.imageStorageId) {
        return {
          success: true,
          storageId: product.imageStorageId,
          message: 'Product already has an image',
        };
      }

      // Fetch the image from the external URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      // Get the image data
      const imageBuffer = await response.arrayBuffer();
      const imageBlob = new Blob([imageBuffer]);

      // Generate upload URL and store the image
      const uploadUrl = await ctx.storage.generateUploadUrl();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': response.headers.get('content-type') || 'image/jpeg',
        },
        body: imageBlob,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload image: ${uploadResponse.statusText}`);
      }

      const { storageId: newStorageId } = await uploadResponse.json();
      storageId = newStorageId as Id<'_storage'>;

      // Update the product with the storage ID
      await ctx.runMutation(api.products.updateImage, {
        productId,
        storageId,
        uploadSecret,
      });

      return { success: true, storageId };
    } catch (error) {
      // Critical: Clean up uploaded image if product update failed
      if (storageId) {
        try {
          await ctx.storage.delete(storageId);
        } catch (_cleanupError) {
          // Cleanup failure - original error is more important so don't throw
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
