export interface ProductPrice {
  productName: string;
  price: number;
  productId?: string;
  externalId?: string;
  cafeSlug: string;
  source: string;
  timestamp: number;
}

export interface PriceChange {
  productId: string;
  oldPrice: number | null;
  newPrice: number;
  priceChange: number | null;
  priceChangePercent: number | null;
  source: string;
  timestamp: number;
}

export interface PricerResult {
  success: boolean;
  productsProcessed: number;
  pricesUpdated: number;
  priceHistoryEntries: number;
  errors: string[];
}

export interface PricerConfig {
  cafeSlug: string;
  source: string;
  targetUrl: string;
  selectors: {
    productContainer: string;
    productName: string;
    productPrice: string;
  };
}
