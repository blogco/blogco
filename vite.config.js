import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/blogco/',
  plugins: [tailwindcss()],
  // `public/` is Hugo's build output, not Vite's. Copying it here causes the
  // whole site (and stale pages) to be re-published under /assets/build/.
  publicDir: false,
  build: {
    outDir: 'static/assets/build',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    assetsInlineLimit: 4096,
    // Emit a manifest so Hugo can resolve the content-hashed filenames below.
    // Fixed names (app.js / site.css) let browsers serve a stale bundle for up
    // to 10 minutes after a deploy; hashing busts that cache automatically.
    manifest: 'manifest.json',
    rollupOptions: {
      input: {
        app: 'assets/js/main.js',
        site: 'assets/css/site.css',
      },
      output: {
        entryFileNames: '[name].[hash].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[hash][extname]',
      },
    },
  },
});
