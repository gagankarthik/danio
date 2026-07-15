// What the JSX compiler imports. `jsxImportSource: 'danio'` in vite.config.js makes esbuild
// emit `import { jsx as _jsx } from 'danio/jsx-runtime'` into every .jsx file, so app code
// never has to import anything just to write JSX.
//
// `jsxs` is the multi-child form. We keep it distinct from `jsx` (rather than aliasing it)
// because it tells us the children array came from the compiler rather than from a `.map()`
// — which is how the missing-key warning avoids firing on every static `<div><a/><b/></div>`.
export { jsx, jsxs, Fragment } from './core/element.js'
