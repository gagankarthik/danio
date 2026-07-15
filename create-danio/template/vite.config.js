import { defineConfig } from 'vite'

// Danio uses the automatic JSX runtime. Pointing esbuild's jsxImportSource at 'danio-js' makes
// every .jsx file compile to Danio's `jsx()` — you never import anything just to write JSX.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'danio-js',
  },
})
