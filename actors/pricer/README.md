# Price Collector

This module collects product prices from various sources and updates the database with current pricing information. When prices change, it automatically tracks the price history.

## Features

- **Price Collection**: Scrapes product prices from external sources
- **Price History**: Tracks price changes over time
- **Database Updates**: Updates product prices and creates price history entries
- **Multiple Sources**: Supports different pricing data sources
- **Error Handling**: Robust error handling and logging

## Available Pricers

### Starbucks Pricer

Collects Starbucks product prices from Naver Map.

**Source**: Naver Map (https://map.naver.com)
**Target**: Starbucks location data
**Data**: Product names and prices

## Usage

### Command Line Interface

Run price collection for specific cafes:

```bash
# Run Starbucks price collection
pnpm price starbucks

# Or use tsx directly
tsx actors/pricer/price.ts starbucks
```

### Environment Variables

Make sure these environment variables are set:

- `CONVEX_URL` or `VITE_CONVEX_URL` - Convex database URL

### Database Schema

The pricer uses these database tables:

#### products
- Contains product information including current price
- Updated when price changes are detected

#### price_history
- Tracks all price changes over time
- Records old price, new price, change amount and percentage
- Includes timestamp and data source information

## Architecture

### Core Components

1. **PricerUtils**: Database operations and price comparison logic
2. **StarbucksPricer**: Starbucks-specific price collection from Naver Map
3. **CLI Interface**: Command-line tool for running price collection

### Data Flow

1. **Crawl**: Extract product names and prices from external source
2. **Compare**: Check current prices against database
3. **Update**: Update product prices if changed
4. **Track**: Create price history entries for changes
5. **Log**: Record results and any errors

### Price Change Detection

- Compares new prices with existing database prices
- Calculates price change amount and percentage
- Only creates history entries when prices actually change
- Handles initial price setting (when product has no price)

## Error Handling

- Graceful handling of network failures
- Retry logic for transient errors
- Detailed logging of all operations
- Debug screenshots for troubleshooting
- Comprehensive error reporting

## Extending

To add a new cafe pricer:

1. Create a new pricer class (e.g., `CafeXPricer`)
2. Implement the crawling logic for the specific source
3. Add command to CLI interface
4. Update README with new pricer information

Example:

```typescript
export class CafeXPricer {
  private pricerUtils: PricerUtils;
  
  constructor(convexUrl: string) {
    this.pricerUtils = new PricerUtils(convexUrl);
  }
  
  async run(): Promise<PricerResult> {
    // Implementation specific to CafeX
  }
}
```