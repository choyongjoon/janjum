import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  server: {
    port: 3000,
  },
  build: {
    // Disable sourcemaps in production for smaller bundles
    sourcemap: process.env.NODE_ENV !== 'production',

    // Simple chunk splitting for better caching
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('convex')) {
              return 'vendor-convex';
            }
            return 'vendor';
          }
        },
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
