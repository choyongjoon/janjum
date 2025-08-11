import { ConvexHttpClient } from 'convex/browser';
import { logger } from '../../shared/logger';
import type { PricerResult, ProductPrice } from './types';

export class PricerUtils {
  private convex: ConvexHttpClient;

  constructor(convexUrl: string) {
    this.convex = new ConvexHttpClient(convexUrl);
  }

  /**
   * Update product price and create price history entry if price changed
   */
  async updateProductPrice(productPrice: ProductPrice): Promise<boolean> {
    try {
      // Find product by name and cafe
      logger.info(
        `Attempting to find product: "${productPrice.productName}" at cafe: "${productPrice.cafeSlug}"`
      );
      const product = await this.convex.query('products:getByNameAndCafe', {
        name: productPrice.productName,
        cafeSlug: productPrice.cafeSlug,
      });

      if (!product) {
        logger.warn(
          `Product not found: ${productPrice.productName} at ${productPrice.cafeSlug}`
        );
        return false;
      }

      const currentPrice = product.price;
      const newPrice = productPrice.price;

      // If price is the same, no update needed
      if (currentPrice === newPrice) {
        logger.info(
          `Price unchanged for ${productPrice.productName}: ${newPrice}`
        );
        return true;
      }

      // Calculate price change (use 0 if no current price)
      const priceChange = currentPrice ? newPrice - currentPrice : 0;
      const priceChangePercent =
        currentPrice && currentPrice > 0
          ? ((newPrice - currentPrice) / currentPrice) * 100
          : 0;

      // Update product price
      await this.convex.mutation('products:updatePrice', {
        productId: product._id,
        price: newPrice,
      });

      // Create price history entry
      await this.convex.mutation('price_history:create', {
        productId: product._id,
        oldPrice: currentPrice,
        newPrice,
        priceChange,
        priceChangePercent,
        source: productPrice.source,
        timestamp: productPrice.timestamp,
        createdAt: Date.now(),
      });

      if (currentPrice) {
        logger.info(
          `Price updated for ${productPrice.productName}: ${currentPrice} → ${newPrice} (${priceChange > 0 ? '+' : ''}${priceChange})`
        );
      } else {
        logger.info(
          `Initial price set for ${productPrice.productName}: ${newPrice}`
        );
      }

      return true;
    } catch (error) {
      logger.error(
        `Failed to update price for ${productPrice.productName}:`,
        error
      );
      return false;
    }
  }

  /**
   * Process multiple product prices
   */
  async processPrices(productPrices: ProductPrice[]): Promise<PricerResult> {
    const result: PricerResult = {
      success: true,
      productsProcessed: 0,
      pricesUpdated: 0,
      priceHistoryEntries: 0,
      errors: [],
    };

    for (const productPrice of productPrices) {
      try {
        const updated = await this.updateProductPrice(productPrice);
        result.productsProcessed++;
        if (updated) {
          result.pricesUpdated++;
          result.priceHistoryEntries++;
        }
      } catch (error) {
        const errorMessage = `Failed to process ${productPrice.productName}: ${error.message}`;
        result.errors.push(errorMessage);
        logger.error(errorMessage);
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    return result;
  }

  /**
   * Parse price string to number (handles Korean won formatting)
   */
  static parsePrice(priceStr: string): number | null {
    if (!priceStr) {
      return null;
    }

    // Remove all non-digit characters except decimal points
    const cleaned = priceStr.replace(/[^\d.]/g, '');
    const price = Number.parseFloat(cleaned);

    return Number.isNaN(price) ? null : price;
  }

  /**
   * Clean and normalize product name
   */
  static normalizeProductName(name: string): string {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s가-힣]/g, '') // Keep only alphanumeric, spaces, and Korean characters
      .trim();
  }
}
