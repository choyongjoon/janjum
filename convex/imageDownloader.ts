import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action } from './_generated/server';

export const downloadAndStoreImageAction = action({
  args: {
    imageUrl: v.string(),
    productId: v.id('products'),
  },
  handler: async (ctx, { imageUrl, productId }) => {
    try {
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

      const { storageId } = await uploadResponse.json();

      // Update the product with the storage ID
      await ctx.runMutation(api.products.updateImage, {
        productId,
        storageId: storageId as Id<'_storage'>,
      });

      return { success: true, storageId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
