import { defineConfig } from 'vite';

export default defineConfig({
  // The game is a single static page; no base path rewriting on Vercel.
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    // The renderer is one tightly-coupled graph. A single chunk avoids
    // waterfall requests on first paint, which matters for a game.
    chunkSizeWarningLimit: 700,
    sourcemap: true,
  },
  server: {
    port: 5319,
    // Fail loudly on a port clash rather than silently moving: a stray preview
    // server from another project on the expected port will otherwise answer
    // the test suite's requests.
    strictPort: true,
    open: false,
  },
  preview: {
    port: 4318,
    strictPort: true,
  },
});
