# Project Structure

## 📁 Organized File Structure

```
janjum/
├── 📁 actors/                          # Server-side automation
│   ├── crawler/                        # Web crawlers
│   │   ├── crawl.ts                   # Main crawler script
│   │   ├── *-crawler.ts               # Individual cafe crawlers
│   │   ├── crawlerUtils.ts            # Crawler utility functions
│   │   ├── crawler-outputs/           # Crawler output files
│   │   └── storage/                   # Crawlee storage (local crawler cache)
│   ├── uploader/                       # Data uploader system  
│   │   ├── uploader.ts                # CLI upload tool with image optimization
│   │   └── upload.ts                  # Upload wrapper script
│   └── categorizer/                    # Product categorization
│       ├── categorize.ts              # Auto-categorization script
│       ├── categorizer-rules.json     # Categorization rules
│       └── test/                      # Test data files
│
├── 📁 convex/                          # Convex backend
│   ├── schema.ts                       # Database schema
│   ├── products.ts                     # Product queries & mutations
│   ├── cafes.ts                        # Cafe queries & mutations
│   ├── reviews.ts                      # Review queries & mutations
│   ├── users.ts                        # User queries & mutations
│   ├── dataUploader.ts                 # Data transformation service
│   └── http.ts                         # HTTP endpoints
│
├── 📁 scripts/                         # Utility scripts
│   └── optimizeImages.ts               # Image optimization script
│
├── 📁 shared/                          # Shared utilities
│   ├── logger.ts                       # Pino logger configuration
│   └── constants.ts                    # Shared constants
│
├── 📁 storage/                        # Crawlee storage (crawler cache/state)
│   ├── datasets/                      # Crawlee dataset storage
│   ├── key_value_stores/              # Crawlee key-value storage  
│   └── request_queues/                # Crawlee request queue storage
│
├── 📁 e2e/                            # End-to-end tests
│   ├── basic.spec.ts                  # Basic functionality tests
│   ├── user-settings-journey.spec.ts # User settings flow tests
│   └── helpers/                       # Test helper functions
│
├── 📁 src/                            # Frontend application (TanStack Start)
│   ├── routes/                        # File-based routing
│   │   ├── index.tsx                  # Home page
│   │   ├── cafe.$slug.tsx             # Cafe pages
│   │   ├── product.$shortId.tsx       # Product pages
│   │   ├── review.$reviewId.tsx       # Review pages
│   │   ├── user.$handle.tsx           # User profile pages
│   │   ├── blog/                      # Blog pages
│   │   ├── settings/                  # Settings pages
│   │   ├── search.tsx                 # Search page
│   │   └── privacy.tsx                # Privacy policy
│   │
│   ├── components/                    # React components
│   │   ├── cafe/                      # Cafe-related components
│   │   ├── profile/                   # Profile components
│   │   ├── reviews/                   # Review components
│   │   ├── settings/                  # Settings components
│   │   ├── search/                    # Search components
│   │   └── icons/                     # Icon components
│   │
│   ├── hooks/                         # Custom React hooks
│   │   ├── usePostHogEvents.ts        # Analytics hooks
│   │   └── useSettingsForm.ts         # Form management hooks
│   │
│   ├── utils/                         # Utility functions
│   │   ├── seo.ts                     # SEO metadata utility
│   │   ├── blogData.ts                # Blog data management
│   │   └── categories.ts              # Category utilities
│   │
│   └── app.tsx                        # App root component
│
└── 📁 public/                         # Static assets
    ├── android-chrome-512x512.png     # App icons
    └── favicon.ico                     # Favicon
```

## 🚀 NPM Scripts

```bash
# Development
pnpm dev                        # Start development server
pnpm build                      # Build for production
pnpm start                      # Start production server

# Data Operations
pnpm crawl                      # Run web crawlers
pnpm upload                     # Upload product data (with image optimization)
pnpm categorize                 # Auto-categorize products

# Image Optimization
pnpm optimize-images:prod       # Optimize existing images in production

# Testing
pnpm test                       # Run unit tests
pnpm test:e2e                   # Run E2E tests with Playwright

# Code Quality
pnpm prepare                    # Install husky git hooks
```

## 🔄 Data Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Crawlers  │───▶│  JSON Data Files │───▶│  Data Uploader  │
│   actors/       │    │ crawler-outputs/ │    │  (with image    │
│   crawler/      │    │                  │    │   optimization) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend App  │◀───│  Convex Backend  │◀───│  Database       │
│   (TanStack     │    │  - Auth (Clerk)  │    │  - Products     │
│    Start + React) │    │  - Real-time     │    │  - Reviews      │
│                 │    │  - File Storage  │    │  - Users        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🏗️ Architecture Overview

### Frontend (TanStack Start + React)
- **File-based routing** with dynamic routes
- **Server-side rendering** for better SEO
- **Real-time data** with Convex React Query
- **Authentication** via Clerk
- **Responsive design** with Tailwind CSS + DaisyUI
- **Analytics** with PostHog
- **SEO optimization** with dynamic metadata

### Backend (Convex)
- **Real-time database** with automatic sync
- **File storage** for images with optimization
- **Authentication** integration with Clerk
- **HTTP endpoints** for external integrations
- **Mutations** for data modification
- **Queries** with caching and reactivity

### Data Processing Pipeline
- **Web crawlers** extract product data from cafe websites
- **Image optimization** converts images to WebP format (85% quality)
- **Auto-categorization** classifies products using AI
- **Data validation** ensures data quality before upload
- **Real-time sync** updates the frontend immediately

## 📂 Key Features

### ✅ **SEO & Metadata**
- Dynamic page titles and descriptions
- Open Graph and Twitter Card support
- Optimized images for social sharing
- Site-wide SEO configuration

### ✅ **Image Optimization**
- Automatic WebP conversion during upload
- 85% quality compression for optimal balance
- Sharp-based server-side processing
- Configurable optimization settings

### ✅ **Real-time Reviews**
- User authentication with Clerk
- Real-time review updates
- Image upload support for reviews
- Rating aggregation and statistics

### ✅ **Search & Discovery**
- Full-text product search
- Category-based filtering
- Cafe-specific product listings
- Related product recommendations

### ✅ **User Profiles**
- Handle-based user profiles
- Review history and statistics
- Profile image upload with optimization
- Privacy controls

## 🔧 Configuration Files

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build && tsc --noEmit", 
    "crawl": "tsx actors/crawler/crawl.ts",
    "upload": "tsx actors/uploader/upload.ts",
    "categorize": "tsx actors/categorizer/categorize.ts",
    "optimize-images:prod": "dotenv -e .env.prod-upload -- tsx scripts/optimizeImages.ts"
  }
}
```

### Environment Configuration
- **`.env.local`** - Development environment
- **`.env.prod-upload`** - Production upload configuration
- **`convex/auth.config.js`** - Clerk authentication setup

## 🧪 Testing Strategy

### Unit Testing
- **Vitest** for fast unit testing
- Component testing with React Testing Library
- Utility function testing

### E2E Testing  
- **Playwright** for cross-browser testing
- User workflow testing
- Performance testing
- Visual regression testing

### Quality Gates
- **Biome** for linting and formatting
- **TypeScript** for type checking
- **Husky** for git hooks
- **Lint-staged** for pre-commit checks

## 🚀 Deployment

### Production Build
```bash
pnpm build                      # Build optimized production bundle
```

### Environment Setup
- **Convex** for backend deployment
- **Vercel** for frontend hosting
- **Clerk** for authentication service
- **PostHog** for analytics

## 📚 Documentation

- **`PROJECT-STRUCTURE.md`** (this file): Overall project organization
- **`CLAUDE.md`**: Project-specific rules and guidelines
- **Component documentation**: Inline JSDoc comments
- **API documentation**: Convex function documentation

## 🔄 Data Updates

### Automated Pipeline
1. **Daily crawlers** collect latest product data
2. **Image optimization** processes new images  
3. **Auto-categorization** classifies new products
4. **Data validation** ensures quality
5. **Database sync** updates live data
6. **Cache invalidation** refreshes frontend

### Manual Operations
```bash
# Run specific crawler
pnpm crawl -- --cafe starbucks

# Upload with optimization (default)
pnpm upload -- --file crawler-outputs/starbucks-products.json --cafe-slug starbucks

# Disable optimization (if needed)
pnpm upload -- --file products.json --cafe-slug starbucks --no-optimize-images

# Categorize products  
pnpm categorize -- --cafe starbucks
```

## 🎯 Performance Optimizations

### Image Optimization
- **WebP conversion** for smaller file sizes
- **Quality optimization** at 85% for optimal balance
- **Automatic processing** during upload
- **CDN delivery** via Convex file storage

### Frontend Performance
- **Server-side rendering** for faster initial load
- **Code splitting** for optimal bundle sizes
- **Image lazy loading** for better performance
- **Caching strategies** for repeated requests

### Database Performance
- **Indexed queries** for fast data retrieval
- **Real-time subscriptions** for live updates
- **Optimized mutations** for write performance
- **Query batching** for reduced overhead

This modern architecture provides a scalable, maintainable, and performant platform for cafe product discovery and reviews! 🎉