import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const resolvePath = (p) => fileURLToPath(new URL(p, import.meta.url))

// Dev/demo config. Builds the example app in index.html.
// The library itself is built with vite.lib.config.js.
export default defineConfig({
  // Compile JSX using Danio's automatic runtime: esbuild emits
  // `import { jsx } from 'danio/jsx-runtime'` into every .jsx file, so app code
  // never imports anything just to use JSX.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'danio',
  },
  resolve: {
    alias: [
      { find: /^danio\/jsx-dev-runtime$/, replacement: resolvePath('./src/jsx-dev-runtime.js') },
      { find: /^danio\/jsx-runtime$/, replacement: resolvePath('./src/jsx-runtime.js') },
      { find: /^danio$/, replacement: resolvePath('./src/index.js') },
    ],
  },
})
