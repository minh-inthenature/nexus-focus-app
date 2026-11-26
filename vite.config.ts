import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.IS_PREACT': JSON.stringify('false'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('/react/') ||
            id.includes('\\react\\')
          ) {
            return 'vendor-react';
          }
          if (
            (id.includes('@codemirror') &&
              !id.includes('@codemirror/language-data')) ||
            id.includes('\\codemirror\\') ||
            id.includes('/codemirror/') ||
            id.includes('@lezer')
          ) {
            return 'vendor-codemirror';
          }
          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('katex') ||
            id.includes('micromark') ||
            id.includes('mdast-') ||
            id.includes('hast-') ||
            id.includes('unified')
          ) {
            return 'vendor-markdown';
          }
          if (id.includes('dexie')) {
            return 'vendor-dexie';
          }
          if (id.includes('jszip')) {
            return 'vendor-zip';
          }
          return undefined;
        },
      },
    },
  },
});
