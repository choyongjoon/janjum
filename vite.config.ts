import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

// Helper function for manual chunk splitting to reduce complexity
function getManualChunks(id: string) {
  if (id.includes('node_modules')) {
    return getVendorChunk(id);
  }

  return getComponentChunk(id);
}

function getVendorChunk(id: string) {
  if (id.includes('convex')) {
    return 'vendor-convex';
  }
  if (id.includes('@clerk') || id.includes('clerk')) {
    return 'vendor-clerk';
  }
  if (id.includes('@tanstack')) {
    return 'vendor-tanstack';
  }
  if (id.includes('react') || id.includes('react-dom')) {
    return 'vendor-react';
  }
  if (id.includes('posthog')) {
    return 'vendor-posthog';
  }
  return 'vendor';
}

function getComponentChunk(id: string) {
  if (id.includes('/components/auth/')) {
    return 'components-auth';
  }
  if (id.includes('/components/reviews/')) {
    return 'components-reviews';
  }
  if (id.includes('/components/settings/')) {
    return 'components-settings';
  }
}

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    // Disable sourcemaps in production for smaller bundles
    sourcemap: process.env.NODE_ENV !== 'production',

    // Optimize bundle size
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },

    // Advanced chunk splitting for better caching and loading
    rollupOptions: {
      output: {
        manualChunks: getManualChunks,
      },
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      customViteReactPlugin: true,
      target: 'vercel',
    }),
    viteReact(),
    tailwindcss(),
  ],
});
