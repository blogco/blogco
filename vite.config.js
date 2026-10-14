import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/blogco/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'static/assets/build',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      input: {
        app: 'assets/js/main.js',
        site: 'assets/css/site.css',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
