# The Danio Guide

Everything you need to build and ship a real app with Danio. If you know React, skim the
headings — the model is the same. If you don't, this reads top to bottom.

- [Install](#install)
- [Your first component](#your-first-component)
- [JSX](#jsx)
- [State with useState](#state-with-usestate)
- [Side effects with useEffect](#side-effects-with-useeffect)
- [Lists and keys](#lists-and-keys)
- [The rest of the hooks](#the-rest-of-the-hooks)
- [Context](#context)
- [Performance: memo](#performance-memo)
- [Error boundaries](#error-boundaries)
- [The store](#the-store)
- [The router](#the-router)
- [Deploy](#deploy)
- [Without a build step](#without-a-build-step)

---

## Install

### The fast path — scaffold a new app

```bash
npm create danio@latest my-app
cd my-app
npm install
npm run dev
```

That gives you a Vite project wired for Danio, running at `http://localhost:5173`.

### Add Danio to an existing project

```bash
npm install danio
```

Then tell your bundler to compile JSX with Danio's runtime. With **Vite**:

```js
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'danio' },
})
```

For editor autocomplete and type-checking, add a `jsconfig.json` (or `tsconfig.json`):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "danio",
    "moduleResolution": "Bundler"
  }
}
```

Danio ships its own TypeScript definitions — no `@types/*` package to install.

---

## Your first component

A component is a function that returns markup. Mount it with `render`.

```jsx
import { render } from 'danio'

function Hello({ name }) {
  return <h1>Hello, {name}</h1>
}

render(<Hello name="world" />, document.getElementById('root'))
```

`render(element, container)` mounts into any DOM node. Call it again on the same node to
update in place; call `unmount(container)` to tear it down and run cleanups.

---

## JSX

JSX is HTML-like syntax that compiles to function calls. A few rules:

- Attributes are camelCase: `onClick`, `tabIndex`, `htmlFor`. `class` and `className` both work.
- `style` takes an object: `style={{ color: 'red', fontSize: 16 }}` (numbers get `px` where it
  makes sense).
- A component must return a single root. Wrap siblings in a fragment — `<>…</>` — to avoid an
  extra wrapper element.
- `{expression}` embeds any JavaScript value. `null`, `undefined`, `false`, and `true` render
  nothing, so `{isOpen && <Panel/>}` works.

```jsx
function Card({ title, open }) {
  return (
    <>
      <h2 className="title">{title}</h2>
      {open && <p style={{ color: 'gray' }}>…</p>}
    </>
  )
}
```

---

## State with useState

`useState` gives a component memory. It returns the current value and a setter; calling the
setter re-renders the component.

```jsx
import { useState } from 'danio'

function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

When the next value depends on the previous one, pass a function — it always sees the latest
value, even across rapid updates:

```jsx
setCount((n) => n + 1)
```

Pass a function to `useState` itself to compute the initial value only once:

```jsx
const [rows, setRows] = useState(() => expensiveInitialParse())
```

---

## Side effects with useEffect

`useEffect` runs code after the DOM is updated — for things outside the render, like timers,
subscriptions, or fetches. Return a function to clean up.

```jsx
import { useState, useEffect } from 'danio'

function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id) // runs on unmount and before the next effect
  }, []) // empty deps → run once on mount

  return <time>{now.toLocaleTimeString()}</time>
}
```

The **dependency array** controls when the effect re-runs: it fires again whenever a listed
value changes. Omit it to run after every render; pass `[]` to run once.

Fetching data is just an effect:

```jsx
function Profile({ id }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setUser(data) })
    return () => { cancelled = true } // ignore a stale response after id changes
  }, [id])

  return user ? <h1>{user.name}</h1> : <p>Loading…</p>
}
```

---

## Lists and keys

Render a list with `.map()`. Give each item a stable `key` — a unique id from your data, not
the array index — so that reordering **moves** DOM nodes instead of rebuilding them (which
would lose focus, text selection, and scroll position).

```jsx
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
```

Danio warns in development if a list is missing keys.

---

## The rest of the hooks

| Hook | Use it for |
|---|---|
| `useReducer(fn, init)` | State with more structure than a single value |
| `useMemo(fn, deps)` | Cache an expensive computed value between renders |
| `useCallback(fn, deps)` | Keep a function's identity stable (pair with `memo`) |
| `useRef(initial)` | A mutable box that survives renders; holds DOM nodes |
| `useLayoutEffect(fn, deps)` | Like `useEffect`, but before paint — to measure/adjust layout |

Grabbing a DOM node with `useRef`:

```jsx
import { useRef } from 'danio'

function SearchBox() {
  const input = useRef(null)
  return (
    <>
      <input ref={input} />
      <button onClick={() => input.current.focus()}>Focus</button>
    </>
  )
}
```

**The one rule of hooks:** call them in the same order every render — never inside an `if`, a
loop, or after an early `return`. Danio warns when the order changes.

---

## Context

Pass values deep into the tree without threading props through every level.

```jsx
import { createContext, useContext } from 'danio'

const Theme = createContext('light')

function App() {
  return (
    <Theme.Provider value="dark">
      <Toolbar />
    </Theme.Provider>
  )
}

function Toolbar() {
  const theme = useContext(Theme) // 'dark', from the nearest Provider above
  return <div className={theme}>…</div>
}
```

---

## Performance: memo

By default, when a component re-renders, its children re-render too. `memo` skips a child whose
props haven't changed (compared shallowly).

```jsx
import { memo } from 'danio'

const Row = memo(function Row({ label }) {
  return <li>{label}</li>
})
```

`memo` is defeated by props that are new objects every render — inline functions (`onClick={()
=> …}`), object literals, arrays. Stabilize them with `useCallback`/`useMemo`, or `memo` does
nothing. Reach for it on expensive components and long lists, not everywhere.

---

## Error boundaries

A thrown error in a component would otherwise blank the whole page. An `ErrorBoundary` contains
the failure to one subtree and shows a fallback instead.

```jsx
import { ErrorBoundary } from 'danio'

function App() {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div>
          <p>Something broke: {error.message}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
      onError={(error) => report(error)}
    >
      <Dashboard />
    </ErrorBoundary>
  )
}
```

It catches errors thrown during render and in effects. It does **not** catch errors in event
handlers or async callbacks (those aren't part of rendering) — wrap those in `try/catch`.

---

## The store

For app-wide state, Danio includes a Redux-style store: one state object, changed only by
dispatching actions through pure reducers.

```jsx
import { createStore, combineReducers, applyMiddleware, thunk } from 'danio'

function todos(state = [], action) {
  switch (action.type) {
    case 'add': return [...state, action.todo]
    case 'remove': return state.filter((t) => t.id !== action.id)
    default: return state
  }
}

export const store = createStore(
  combineReducers({ todos }),
  applyMiddleware(thunk), // lets you dispatch async functions
)
```

Put the store on context, then read and dispatch from any component:

```jsx
import { StoreProvider, useSelector, useDispatch } from 'danio'

render(
  <StoreProvider store={store}>
    <App />
  </StoreProvider>,
  document.getElementById('root'),
)

function TodoCount() {
  const count = useSelector((s) => s.todos.length) // re-renders only when this changes
  const dispatch = useDispatch()
  return <button onClick={() => dispatch({ type: 'add', todo: newTodo() })}>{count}</button>
}
```

`useSelector` compares its result and re-renders only when *that slice* changes — an action
touching an unrelated part of the state costs nothing here. If your selector builds a new
object each call, pass `shallowEqual` as the second argument.

Async work goes in a thunk — dispatch a function instead of an action:

```jsx
const loadTodos = () => async (dispatch) => {
  const todos = await fetch('/api/todos').then((r) => r.json())
  dispatch({ type: 'load', todos })
}

dispatch(loadTodos())
```

---

## The router

Map the URL to a screen with the History API — no page reloads.

```jsx
import { Router, Routes, Route, Link } from 'danio'

function App() {
  return (
    <Router>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/todos">Todos</Link>
      </nav>
      <Routes>
        <Route path="/" component={Home} />
        <Route path="/todos" component={Todos} />
        <Route path="/todos/:id" component={TodoDetail} />
        <Route path="*" component={NotFound} />
      </Routes>
    </Router>
  )
}
```

First match wins, so put the catch-all `path="*"` last. Read route data with hooks:

```jsx
import { useParams, useNavigate, useSearchParams } from 'danio'

function TodoDetail() {
  const { id } = useParams()          // /todos/42 → { id: '42' }
  const query = useSearchParams()     // ?tab=notes → { tab: 'notes' }
  const navigate = useNavigate()
  return <button onClick={() => navigate('/todos')}>Back</button>
}
```

`navigate(to)` also works outside components — call it from a thunk after a login succeeds, for
example.

---

## Server rendering (SSR)

For SEO and a fast first paint, render your app to HTML on the server, then make it
interactive on the client. Danio ships two halves.

**On the server** — `renderToString` runs in plain Node, with no DOM and nothing mocked. It
runs your components (so `useState` initial values, `useMemo`, and `useContext` all
resolve), and returns an HTML string. Effects do **not** run on the server, and state never
changes — there's a single render.

```js
// server.js
import { renderToString } from 'danio/server'
import { App } from './App.js'

app.get('*', (req, res) => {
  const html = renderToString(<App />)
  res.send(`<!doctype html>
    <html>
      <head><title>My app</title></head>
      <body>
        <div id="root">${html}</div>
        <script type="module" src="/client.js"></script>
      </body>
    </html>`)
})
```

Importing from `danio/server` (not `danio`) keeps the DOM layer and router out of your
server bundle. `renderToStaticMarkup` is the same function under a different name, for output
you don't intend to hydrate.

**On the client** — `hydrate` adopts the server markup instead of rebuilding it. It walks the
existing DOM alongside your component tree, reuses each node in place, and attaches the parts
HTML can't carry: event handlers, refs, and form-control values. It runs synchronously, so
there's no flash of dead markup.

```jsx
// client.js
import { hydrate } from 'danio'
import { App } from './App.js'

hydrate(<App />, document.getElementById('root'))
```

Render exactly the same tree on both sides. If the markup and the components disagree, Danio
warns in development and rebuilds the mismatched node on the client rather than crashing.

**What's not here yet:** streaming, server data fetching, and React Server Components. This
is static SSR — render, send, hydrate — which is what SEO and first paint actually need.

> Server-rendering the router needs the request URL, which `window.location` can't provide in
> Node. Pass the current path into your app explicitly (e.g. a `<Router location={req.url}>`
> prop or a context value) rather than relying on the browser history on the server.

---

## Deploy

`npm run build` produces a static `dist/` folder. It's plain HTML, JS, and CSS — it hosts
anywhere, no server required.

**Vercel**
- Framework preset: **Other**
- Build command: `npm run build`
- Output directory: `dist`

Or from the CLI: `npm i -g vercel && vercel`.

**Netlify** — build command `npm run build`, publish directory `dist`.

**AWS Amplify** — connect the repo; build command `npm run build`, artifacts base directory
`dist`.

**GitHub Pages / S3 / any static host** — upload the contents of `dist/`.

Because a Danio app is a single-page app, configure the host to rewrite unknown paths to
`index.html` so deep links like `/todos/42` work on refresh. On Vercel add a `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

Netlify: add a `_redirects` file with `/*  /index.html  200`.

---

## Without a build step

JSX needs a compiler, but Danio doesn't require one. `h()` is the function JSX compiles to, so
you can write it directly and open an HTML file — no npm, no Vite:

```html
<script type="module">
  import { h, render, useState } from 'https://esm.sh/danio'

  function Counter() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => setN(n + 1) }, 'clicked ', n, ' times')
  }

  render(h(Counter), document.getElementById('root'))
</script>
```

`h(type, props, ...children)` is the whole API — everything else (hooks, store, router) works
exactly the same.
