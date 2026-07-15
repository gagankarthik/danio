<p align="center">
  <img src="./assets/danio-logo.svg" alt="Danio" width="340" />
</p>

<p align="center">
  <b>The frontend framework you can actually read.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/danio-js"><img src="https://img.shields.io/npm/v/danio-js.svg?color=1466E0" alt="npm"></a>
  <img src="https://img.shields.io/badge/gzipped-8_kB-1466E0" alt="8 kB gzipped">
  <img src="https://img.shields.io/badge/dependencies-0-1466E0" alt="zero dependencies">
  <img src="https://img.shields.io/badge/types-included-1466E0" alt="TypeScript types included">
  <img src="https://img.shields.io/badge/license-MIT-1466E0" alt="MIT">
</p>

---

**Danio** is a fast, tiny, dependency-free frontend framework built from scratch in plain
JavaScript — a virtual DOM, a fiber reconciler with bailouts, hooks, a store, and a router,
in about 2,000 lines you can read in an afternoon. It isn't a wrapper around React or a fork
of Preact; it's the whole engine, written to be understood. **If you know React, you already
know Danio.**

🌐 **[Website](https://gagankarthik.github.io/danio/)** &nbsp;·&nbsp; 📖 **[Documentation](https://gagankarthik.github.io/danio/docs.html)** &nbsp;·&nbsp; 🎨 **[Brand kit](https://gagankarthik.github.io/danio/brand.html)**

```jsx
import { render, useState } from 'danio-js'

function Counter() {
  const [n, setN] = useState(0)
  return <button onClick={() => setN(n + 1)}>clicked {n} times</button>
}

render(<Counter />, document.getElementById('root'))
```

## Quick start

```bash
# scaffold a new app (Vite + JSX + example + TypeScript types)
npm create danio@latest my-app
cd my-app && npm run dev

# …or add Danio to an existing project
npm install danio-js
```

To compile JSX, point your bundler at Danio's runtime. With **Vite**:

```js
// vite.config.js
export default {
  esbuild: { jsx: 'automatic', jsxImportSource: 'danio-js' },
}
```

Full setup, including a `jsconfig.json` for editor autocomplete, is in the
**[Guide](docs/GUIDE.md)**.

## Why Danio

- **Tiny** — the whole framework is ~8 kB gzipped with **zero** runtime dependencies.
- **Familiar** — components, JSX, `useState`, `useEffect`, context, a Redux-style store, a
  router. Nothing new to learn, only less of it.
- **Readable** — every file is plain, commented JavaScript. Open `node_modules/danio-js/src`
  and the framework is right there. Danio even ships its source, on purpose.
- **Fast** — a fiber reconciler with bailouts means a `setState` re-renders one component,
  not the whole tree (~200× faster updates on a 500-row benchmark).
- **Complete** — hooks, context, `memo`, error boundaries, a store with middleware, a
  History-API router, SSR + hydration, and TypeScript types. All included.
- **Honest** — the docs tell you where Danio *doesn't* fit (see below), not just where it does.

## A fuller taste

State, a store, and routing — all from one import:

```jsx
import {
  render, useState, useEffect,
  createStore, StoreProvider, useSelector, useDispatch,
  Router, Routes, Route, Link,
} from 'danio-js'

function Todos() {
  const todos = useSelector((s) => s.todos)
  const dispatch = useDispatch()
  return (
    <ul>
      {todos.map((t) => (
        <li key={t.id} onClick={() => dispatch({ type: 'toggle', id: t.id })}>
          {t.text}
        </li>
      ))}
    </ul>
  )
}

render(
  <StoreProvider store={store}>
    <Router>
      <nav><Link to="/">Home</Link> <Link to="/todos">Todos</Link></nav>
      <Routes>
        <Route path="/" component={Home} />
        <Route path="/todos/:id" component={TodoDetail} />
      </Routes>
    </Router>
  </StoreProvider>,
  document.getElementById('root'),
)
```

## Server-side rendering

Render to HTML for SEO and first paint, then hydrate on the client. `renderToString` runs in
plain Node with no DOM:

```js
// server
import { renderToString } from 'danio-js/server'
res.send(`<div id="root">${renderToString(<App />)}</div>`)

// client
import { hydrate } from 'danio-js'
hydrate(<App />, document.getElementById('root'))
```

`hydrate` reuses the server DOM instead of rebuilding it. See the
[SSR section of the Guide](docs/GUIDE.md#server-rendering-ssr).

## Where Danio fits

Danio is the right call when **size, control, and understanding** matter more than a giant
ecosystem — size-critical or embedded UIs, controlled internal platforms, or simply learning
how a framework actually works.

Reach for something else when you need streaming SSR or React Server Components today, depend
on a large third-party ecosystem or hiring pool, or want the absolute fastest runtime (a
signals framework like Solid will edge it). A framework's real cost is its ecosystem, and
React's is enormous — Danio doesn't try to out-React React.

## Documentation

- **[Guide](docs/GUIDE.md)** — install, components, hooks, store, router, SSR, and deployment.
- **[How it's built](docs/ARCHITECTURE.md)** — the guided tour of the engine: fibers,
  bailouts, scheduling, and the problems every framework has to solve.
- **[Brand & logo](assets/)** — the Danio mark and palette.

## What's included

| | |
|---|---|
| Rendering | virtual DOM, fiber reconciler, keyed diffing, render/commit split |
| Hooks | `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef` |
| Context | `createContext`, `useContext` |
| Performance | bailouts, `memo`, `shallowEqual` |
| Errors | `<ErrorBoundary>` catching render *and* effect errors |
| Store | `createStore`, `combineReducers`, `applyMiddleware`, `thunk`, `logger`, `useSelector` |
| Router | `<Router>`, `<Routes>`, `<Route>`, `<Link>`, `useParams`, `useNavigate` |
| Server | `renderToString`, `renderToStaticMarkup`, `hydrate` |
| Tooling | JSX automatic runtime, TypeScript types, `create-danio` scaffolder |

**Not yet:** streaming SSR, React Server Components, portals, and Suspense. Tested against a
real DOM (54 unit tests) and a headless-browser pass in Chrome; Safari and Firefox are
untested so far.

## Develop

```bash
npm install      # Vite + jsdom, both dev-only
npm run dev      # http://localhost:5173 — the example app
npm test         # 54 tests against a real DOM
npm run bench    # the bailout benchmark
npm run build    # production build -> dist/
```

## License

[MIT](LICENSE)
