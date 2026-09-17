import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

/**
 * Race music is an optional, unversioned drop-in (see docs/AUDIO.md). Resolve
 * it at build time so a deployment without the file does not ship an <audio>
 * src that 404s on every page load. Dropping the file in requires a restart of
 * the dev server, which is the same cost as any other config change.
 */
const MUSIC_PATH = 'audio/mute-city.mp3';
const musicSrc = fs.existsSync(path.resolve('public', MUSIC_PATH)) ? '/' + MUSIC_PATH : '';

export default defineConfig({
  // The game is a single static page; no base path rewriting on Vercel.
  base: '/',
  define: {
    __MUSIC_SRC__: JSON.stringify(musicSrc),
  },
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
