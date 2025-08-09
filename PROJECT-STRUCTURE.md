# Project Structure

## 📁 Organized File Structure

```
subdomain/cupscore/
├── 📁 convex/                      # Convex backend
│   ├── schema.ts                   # Database schema (enhanced with timestamps)
│   ├── products.ts                 # Product queries & upsert mutations
│   ├── dataUploader.ts             # Upload service & data transformation
│   ├── cafes.ts                    # Cafe queries & mutations
│   └── stats.ts                    # Statistics queries
│
├── 📁 uploader/                    # Data uploader system
│   ├── upload-products.ts          # CLI upload tool
│   ├── daily-sync.ts              # Automated daily sync service
│   ├── test-uploader.cjs          # Data processing test script
│   ├── README-uploader.md         # Uploader documentation
│   └── IMPLEMENTATION-SUMMARY.md  # Implementation overview
│
├── 📁 crawler/                     # Web crawler system
│   ├── starbucks-crawler.ts       # Main crawler script
│   ├── crawler-outputs/           # Crawler output files
│   │   └── starbucks-*.json       # Daily product data
│   └── storage/                   # Crawler storage
│
├── 📁 logs/                       # Log files
│   └── daily-sync.log             # Daily sync operation logs
│
├── 📁 src/                        # Frontend application
│   ├── routes/                    # TanStack Router routes
│   ├── components/                # React components
│   └── utils/                     # Utility functions
│
└── package.json                   # Updated with new scripts
```

## 🚀 NPM Scripts

```bash
# Uploader Operations
npm run upload-products        # Manual product upload
npm run sync-once             # Run sync once
npm run sync-daemon           # Start daily sync daemon
npm run test-uploader         # Test data processing

# Crawler Operations  
npm run crawler               # Run Starbucks crawler

# Development
npm run dev                   # Start development server
npm run build                 # Build for production
```

## 🔄 Data Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Crawler   │───▶│  JSON Data Files │───▶│  Data Uploader  │
│  crawler/       │    │  crawler-outputs/│    │  uploader/      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │◀───│  Convex Backend  │◀───│ Database Schema │
│    src/         │    │     convex/      │    │   Enhanced      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📂 File Organization Benefits

### ✅ **Clear Separation of Concerns**
- **`uploader/`**: Data processing and upload logic
- **`crawler/`**: Web scraping and data collection  
- **`convex/`**: Database schema and backend logic
- **`src/`**: Frontend user interface

### ✅ **Maintainable Structure**
- Related files grouped together
- Easy to find and modify specific functionality
- Clear dependencies between components

### ✅ **Scalable Architecture**
- Easy to add new crawlers in `crawler/`
- Simple to extend uploader functionality
- Frontend remains independent of data processing

## 🔧 Configuration Updates

### Package.json Scripts
```json
{
  "scripts": {
    "upload-products": "ts-node uploader/upload-products.ts",
    "sync-once": "ts-node uploader/daily-sync.ts --once", 
    "sync-daemon": "ts-node uploader/daily-sync.ts --daemon",
    "test-uploader": "node uploader/test-uploader.cjs",
    "crawler": "ts-node crawler/starbucks-crawler.ts"
  }
}
```

### Path Updates
- Upload scripts now reference `../crawler/crawler-outputs/`
- Log files stored in `../logs/`
- Convex API imports use `../convex/_generated/api`

## 🧪 Testing

All functionality verified after reorganization:

```bash
✅ npm run test-uploader         # Data processing works
✅ File paths correctly updated  # All references fixed
✅ Scripts executable           # NPM scripts work
✅ Directory structure clean    # Organized by function
```

## 📚 Documentation

- **`uploader/README-uploader.md`**: Comprehensive uploader guide
- **`uploader/IMPLEMENTATION-SUMMARY.md`**: Technical implementation details
- **`PROJECT-STRUCTURE.md`** (this file): Overall project organization

## 🚀 Quick Start

```bash
# Test data processing
npm run test-uploader

# Run crawler (if needed)
npm run crawler

# Upload products (with Convex auth)
npm run upload-products -- --dry-run
npm run upload-products

# Start daily automation
npm run sync-daemon
```

This organized structure makes the project more maintainable and easier to understand! 🎉