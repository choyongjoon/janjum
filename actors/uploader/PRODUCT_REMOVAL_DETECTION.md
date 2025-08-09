# Product Removal Detection System

## Overview

The upload script now automatically detects when products are removed from cafe websites and marks them as inactive in the database. This prevents outdated products from appearing in search results while preserving historical data.

## How It Works

### 1. **Product Lifecycle States**
- **✅ Active (`isActive: true`)** - Product currently available on cafe website
- **❌ Removed (`isActive: false`)** - Product no longer found on website
- **🔄 Reactivated** - Previously removed product that's back on website

### 2. **Detection Process**
When you run the upload script, it:

1. **Uploads new/updated products** from crawler data
2. **Compares current products** against existing database records
3. **Marks missing products as removed** (`isActive: false`, sets `removedAt` timestamp)
4. **Reactivates returning products** (clears `removedAt`, sets `isActive: true`)

### 3. **Database Schema Changes**
```typescript
// New fields added to products table
{
  isActive: boolean,        // Whether product is currently available
  removedAt?: number,       // Timestamp when product was marked as removed
}
```

## Usage Examples

### **Standard Upload with Removal Detection**
```bash
# Run crawler to get latest data
pnpm run crawler:starbucks

# Upload with automatic removal detection
pnpm upload starbucks
```

**Output:**
```bash
Results:
  Processed: 150
  Created: 2      # New products found
  Updated: 5      # Existing products with changes
  Unchanged: 143  # Products with no changes
  Removed: 3      # Products no longer on website ⭐ NEW
  Reactivated: 1  # Previously removed products that are back ⭐ NEW
  Errors: 0

Upload completed. Created: 2, Updated: 5, Unchanged: 143, Removed: 3, Reactivated: 1
```

### **View Removed Products Summary**
The uploader automatically shows removal information in its output. You don't need a separate command!

### **Verbose Upload (Shows Product Names)**
```bash
pnpm upload starbucks --verbose
```

**Additional Output:**
```bash
❌ Removed Products Summary:
  3 product(s) no longer found on website

Removed products (3):
  1. Holiday Spice Latte
  2. Pumpkin Cream Cold Brew
  3. Summer Berry Lemonade

✅ Reactivated Products Summary:
  1 previously removed product(s) found again

Reactivated products (1):
  1. Iced Brown Sugar Oatmilk Shaken Espresso

📊 Product Lifecycle Summary:
  Products marked as removed: 3
  Products reactivated: 1
```

## Real-World Scenarios

### **Scenario 1: Seasonal Menu Changes**
- **Winter → Spring**: Seasonal drinks removed, new spring items added
- **Result**: Old seasonal drinks marked as removed, new ones created

### **Scenario 2: Permanent Discontinuation**
- **Product discontinued**: No longer available on any menu
- **Result**: Marked as removed, won't appear in active product lists

### **Scenario 3: Temporary Removal**
- **Temporarily out of stock**: Removed from website temporarily
- **Later return**: Automatically reactivated when detected again

### **Scenario 4: Menu Restructuring**
- **Category changes**: Products moved between categories
- **Result**: Updated category, remains active

## Benefits

### **✅ Data Integrity**
- **No stale data**: Users don't see discontinued products
- **Historical preservation**: Removed products kept for analytics
- **Automatic detection**: No manual cleanup required

### **✅ User Experience**
- **Current information**: Only active products in search/browse
- **Accurate menus**: Reflects real cafe offerings
- **No confusion**: Clear distinction between available/unavailable

### **✅ Analytics Value**
- **Product lifecycle tracking**: See when products were added/removed
- **Seasonal patterns**: Identify seasonal menu changes
- **Popularity analysis**: Compare active vs removed products

## API Queries

### **Get Active Products Only**
```typescript
const activeProducts = await client.query(api.products.getActiveProducts, {
  cafeId: cafe._id
});
```

### **Get Removed Products**
```typescript
const removedProducts = await client.query(api.products.getRemovedProducts, {
  cafeId: cafe._id
});
```

### **Get All Products (Active + Removed)**
```typescript
const allProducts = await client.query(api.products.getByCafe, {
  cafeId: cafe._id
});
```

## Migration Notes

### **Existing Data**
- **Existing products**: Automatically set to `isActive: true` during first upload
- **No data loss**: All existing products remain accessible
- **Backward compatibility**: Existing queries continue to work

### **Frontend Updates**
If you want to filter only active products in your frontend:
```typescript
// Before: Shows all products (including removed)
const products = await client.query(api.products.getByCafe, { cafeId });

// After: Shows only active products
const activeProducts = await client.query(api.products.getActiveProducts, { cafeId });
```

## Command Reference

### **Upload Commands**
```bash
pnpm upload                    # Upload all cafes with removal detection
pnpm upload starbucks         # Upload specific cafe with removal detection
pnpm upload --verbose         # Show detailed output including removed products
pnpm upload --dry-run         # Preview changes without actual upload
```

### **No Additional Commands Needed**
All removal detection is now integrated directly into the upload process! The uploader automatically shows removal summaries.

## Performance Notes

- **Efficient queries**: Uses database indexes for fast lookups
- **Minimal overhead**: Removal detection adds ~100ms to upload time
- **Batch processing**: Handles large product catalogs efficiently
- **Safe operations**: All changes logged and reversible

## Troubleshooting

### **False Positives**
If products are incorrectly marked as removed:
1. **Check crawler**: Ensure crawler is finding all products
2. **Run again**: Next upload will reactivate falsely removed products
3. **Manual fix**: Use database admin to correct `isActive` status

### **Missing Removals**
If removed products aren't detected:
1. **Verify external IDs**: Ensure consistent product identification
2. **Check upload logs**: Look for errors in removal detection
3. **Database check**: Verify products exist with correct `cafeId`

This system ensures your product database stays current with real cafe offerings while preserving valuable historical data! 🎯