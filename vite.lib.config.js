import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const entry = (p) => fileURLToPath(new URL(p, import.meta.url))

// Library build. Produces optimized bundles in dist/ for CDN / <script type=module>
// use and for consumers who prefer a prebuilt artifact over source.
//
// Bundler users (Vite, webpack, Next, Rollup) resolve the package's ESM source directly
// via the "exports" map — they don't need this build, and get better tree-shaking from
// source. This exists for the no-bundler path and for a minified production drop-in.
export default defineConfig({
  define: {
    // Folds every `DEV` guard to false and lets the minifier drop the warning bodies.
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    lib: {
      entry: {
        'danio-js': entry('./src/index.js'),
        'jsx-runtime': entry('./src/jsx-runtime.js'),
        'jsx-dev-runtime': entry('./src/jsx-dev-runtime.js'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
})
