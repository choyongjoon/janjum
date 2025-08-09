# Product Categorizer

A smart categorization system for cupscore products that learns from human input and improves over time.

## Overview

The categorizer automatically assigns categories to products based on:
- **Direct mapping**: `externalCategory` → `category` exact matches
- **Pattern matching**: Product name contains specific keywords  
- **Human learning**: Stores user decisions for future automation
- **Fallback**: Defaults to '그 외' for unmatched items

## Categories

- 커피 (Coffee)
- 차 (Tea) 
- 블렌디드 (Blended)
- 스무디 (Smoothie)
- 주스 (Juice)
- 에이드 (Ade)
- 그 외 (Others)

## Usage

### Basic Commands

```bash
# Categorize all products (dry run)
pnpm categorize --dry-run

# Categorize all products 
pnpm categorize

# Categorize specific cafe
pnpm categorize starbucks

# Categorize with detailed output
pnpm categorize --verbose

# Interactive mode for learning
pnpm categorize --interactive

# Process only low confidence items  
pnpm categorize --confidence low

# Limit number of products
pnpm categorize --limit 100

# Force recategorization of all products
pnpm categorize --force
```

### Available Options

- `--dry-run`: Preview changes without updating database
- `--interactive`: Ask for human input on uncertain categorizations
- `--verbose`: Show detailed output during categorization  
- `--confidence <level>`: Process only specific confidence levels (all|low|medium)
- `--limit <number>`: Limit number of products to process
- `--force`: Override all categories, even if they match current rules
- `--help`: Show help message

### Available Cafes

- `starbucks` - 스타벅스
- `compose` - 컴포즈커피  
- `mega` - 메가커피
- `paik` - 빽다방

## How It Works

### 1. Direct Mapping (High Confidence)
If `externalCategory` exactly matches a known category:
```
externalCategory: "커피" → category: "커피"
```

### 2. Pattern Matching (High/Medium Confidence)  
Searches product name for keywords:
```
name: "아이스 아메리카노" → category: "커피" (contains "아메리카노")
name: "딸기 스무디" → category: "스무디" (contains "스무디")
```

### 3. Human Learning (High Confidence)
Interactive mode captures human decisions and creates new rules:
```bash
pnpm categorize --interactive
# Shows uncertain products and asks for category
# Stores decisions in categorizer-rules.json
```

### 4. Fallback (Low Confidence)
Unknown products default to "그 외"

## Configuration

### Rules File: `categorizer-rules.json`

Contains categorization rules and statistics:

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "direct-coffee",
      "type": "direct", 
      "condition": { "externalCategory": "커피" },
      "targetCategory": "커피",
      "confidence": "high"
    },
    {
      "id": "pattern-coffee-keywords",
      "type": "pattern",
      "condition": { "nameContains": ["아메리카노", "라떼"] },
      "targetCategory": "커피", 
      "confidence": "high"
    }
  ],
  "stats": {
    "totalCategorizations": 0,
    "humanLearnings": 0,
    "averageConfidence": 0
  }
}
```

### Built-in Patterns

**Coffee Keywords**: 아메리카노, 라떼, 카푸치노, 에스프레소, 모카, 마키아또, 콜드브루

**Tea Keywords**: 차이, 얼그레이, 녹차, 홍차, 허브티, 캐모마일, 페퍼민트

**Blended Keywords**: 프라푸치노, 블렌디드, 쉐이크, 프라페

**Smoothie Keywords**: 스무디, 요거트, 딸기, 망고, 바나나

**Juice Keywords**: 주스, 오렌지, 자몽, 토마토, 당근

**Ade Keywords**: 에이드, 레모네이드, 자몽에이드, 청포도에이드

## Examples

### Dry Run (Preview Mode)
```bash
pnpm categorize --dry-run --verbose
```
Shows what would be updated without making changes.

### Interactive Learning
```bash  
pnpm categorize --interactive --confidence low
```
Asks human input for low confidence categorizations and learns from decisions.

### Specific Cafe Processing
```bash
pnpm categorize starbucks compose --verbose
```
Processes only Starbucks and Compose products with detailed output.

### Force Recategorization
```bash
pnpm categorize --force --dry-run
```
Forces recategorization of all products with updated rules, preview mode.

```bash
pnpm categorize starbucks --force
```
Forces recategorization of all Starbucks products (useful after rule updates).

## Output

The categorizer provides detailed statistics:

```
📊 CATEGORIZATION SUMMARY
📦 Processed: 250 products
✅ Updated: 45 products  
➡️  Unchanged: 200 products
❌ Errors: 5 products
⏱️  Total time: 12 seconds

🎯 Confidence Breakdown:
  High: 180
  Medium: 50  
  Low: 20

🔧 Source Breakdown:
  Direct: 120
  Pattern: 80
  Fallback: 30
  Human: 20

📈 Categorizer Statistics:
  Total categorizations: 1250
  Human learnings: 45
  Average confidence: 2.65
```

## Environment Setup

Ensure `CONVEX_URL` environment variable is set:

```bash
export CONVEX_URL="your-convex-deployment-url"
```

## Testing

Test the categorizer logic:

```bash
npx tsx actors/categorizer/test-categorizer.ts
```

## Architecture

- **`categorizer.ts`**: Core categorization engine with rules and learning
- **`categorize.ts`**: CLI interface with Convex integration  
- **`types.ts`**: TypeScript interfaces and types
- **`categorizer-rules.json`**: Rules configuration and statistics
- **`test-categorizer.ts`**: Testing utility

## Integration

The categorizer integrates with:
- **Convex Database**: Reads products, updates categories
- **Pino Logger**: Consistent logging with other cupscore components
- **CLI Pattern**: Follows same pattern as `upload.ts` and `crawl.ts`