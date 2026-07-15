# How Danio is built

Danio is small enough to read end to end, and this document is the guided tour: what the
engine does, why it's shaped the way it is, and the handful of non-obvious problems that
every real framework has to solve. If you just want to *use* Danio, start with the
[Guide](GUIDE.md) instead.

---

## 1. What exactly are we building? (and what we are *not*)

This is the question worth being precise about, because "building a framework" means
very different things depending on which layer you start at.

| Layer | Example | Are we building this? |
|---|---|---|
| **Rendering engine** — turns a description of UI into real DOM, and keeps it in sync as data changes | React, Vue, Svelte | ✅ **Yes. This is the heart of Danio.** |
| **State management** — a predictable place to keep app data | Redux, Zustand, Pinia | ✅ **Yes.** Built on top of our own engine. |
| **Routing** — map the URL to a screen | React Router | ✅ **Yes.** Built on top of our own engine. |
| **Meta-framework** — file-based routing, server rendering, data fetching, bundling | Next.js, Nuxt, Remix | ❌ No. That's a layer *above* us, and a separate project. |
| **Build tooling** — dev server, JSX compiler, bundler | Vite, esbuild, webpack | ❌ No. We *use* Vite, we don't build it. |

So the relationship is:

```
        Next.js          <- a meta-framework, sits ON TOP of React
           |
        React            <- a rendering engine
```

```
        (someday, "DanioKit")   <- a meta-framework you could build later
           |
        Danio  ← WE ARE HERE    <- a rendering engine + store + router
```

**We are building the React layer, not the Next.js layer.** Danio is the thing a Next.js
would one day be built on top of.

### Why is Vite here if we're "from scratch"?

Because of one specific problem: **the browser cannot read JSX.** When you write

```jsx
<div className="card">Hello</div>
```

that is not valid JavaScript — no browser can parse it. Something has to translate it into
a real function call before the browser sees it:

```js
jsx("div", { className: "card", children: "Hello" })
```

That translation is a *compile-time* job, and it is a solved, boring problem. Writing our
own JSX parser would teach us about parsers, not about frameworks. So we let Vite's built-in
compiler (esbuild) do the translation — but we point it at **our** function, not React's.
That's the `jsxImportSource: 'danio-js'` line in `vite.config.js`.

Vite also gives us a dev server with hot reload so the feedback loop is instant.

**Nothing from Vite ends up in the shipped bundle.** `src/` imports nothing but itself.
If you dislike JSX, you can skip the build step entirely and call `h()` by hand
(see §7) — Danio works with a plain `<script type="module">` and no tooling at all.

---

## 2. What we learned from the references

Danio draws on four references, and they map almost exactly onto the four things it needs.

**[pomb.us/build-your-own-react](https://pomb.us/build-your-own-react/) and
[github.com/pomber/didact](https://github.com/pomber/didact)** (same author, same material —
the repo is the code, the post is the prose). This is our blueprint for the rendering engine.
It builds React in eight steps, and every step is a load-bearing idea:

1. `createElement` — describe UI as plain objects `{ type, props: { children } }`
2. `render` — walk that object tree and create real DOM nodes
3. **Concurrent mode** — do the work in a loop driven by `requestIdleCallback`, so a big
   render can be paused and resumed instead of freezing the page
4. **Fibers** — to pause and resume, you need the tree as a linked list you can hold a
   pointer into. Each fiber points to `child`, `sibling`, and `parent`.
5. **Render / commit split** — build the whole new tree in memory first, touch the DOM only
   at the very end, in one atomic pass. Otherwise a paused render shows a half-built UI.
6. **Reconciliation** — compare the new tree against the previous one (`alternate`) and tag
   each fiber `PLACEMENT`, `UPDATE`, or `DELETION`
7. **Function components** — a component is just a function whose children you compute by calling it
8. **Hooks** — `useState` is an array of state slots hanging off the fiber, indexed by call order

**[zapier.com/blog/how-to-build-redux](https://zapier.com/blog/how-to-build-redux/)** is our
blueprint for the store. The lesson is that Redux is ~140 lines: `createStore` holds one state
object and exposes `getState` / `dispatch` / `subscribe`; a reducer is a pure
`(state, action) => newState`; `combineReducers` and `applyMiddleware` are small compositions
on top. Its power is in the *constraint* (pure functions, immutable updates), not the code.

**[mfrachet.github.io/create-frontend-framework](https://mfrachet.github.io/create-frontend-framework/)**
takes the lighter path — template literals, a VDOM with diff/patch (it leans on Snabbdom), a
hand-rolled store. Same destination, no fibers. We take its framing (a framework is
*templating + VDOM + state + glue*) but use Didact's fiber engine instead, because fibers are
what let us add keys, interruption, and effects without repainting ourselves into a corner.

### Where Danio goes beyond Didact

Didact stops at "educational." To actually *build applications* with Danio, we add:

- **Keyed reconciliation** — Didact matches children by position, so reordering a list
  destroys and rebuilds every row (losing focus, input state, and scroll). We match by `key`
  and *move* the existing DOM node instead.
- **The full hook set** — `useEffect` (with cleanup), `useReducer`, `useMemo`, `useCallback`,
  `useRef`, `useContext`. Didact only ships `useState`.
- **Fragments** — return several elements without a wrapper `<div>`.
- **Real event handling** — capture phase, correct add/remove on prop change, SVG support.
- **A store and a router**, so a real app has somewhere to put its data and its URLs.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Your app  (example/)                                        │
│  <App/>, <Todos/> …  JSX, hooks, useSelector, <Link/>        │
└──────────────────────────────────────────────────────────────┘
        │                    │                     │
┌───────▼────────┐  ┌────────▼────────┐  ┌─────────▼─────────┐
│  src/router/   │  │   src/store/    │  │    src/core/      │
│  Router,Route  │  │  createStore    │  │  hooks, context   │
│  Link,navigate │  │  combineReducers│  │                   │
│  (History API) │  │  applyMiddleware│  │                   │
└───────┬────────┘  └────────┬────────┘  └─────────┬─────────┘
        └────────────────────┴─────────────────────┘
                             │
                 ┌───────────▼────────────┐
                 │   src/core/reconciler  │   ← the engine
                 │   fibers, work loop,   │
                 │   diff, commit         │
                 └───────────┬────────────┘
                             │
                    ┌────────▼────────┐
                    │  src/core/dom   │   ← the only place we touch the browser
                    └─────────────────┘
```

### The data flow, end to end

```
JSX  ──compile──▶  jsx("div", {...})  ──▶  element  { type, key, props }
                                                │
                                    render(element, container)
                                                │
                             ┌──────────────────▼──────────────────┐
                             │  RENDER PHASE  (interruptible)      │
                             │  build a fiber tree, diff it        │
                             │  against the last one, tag each     │
                             │  fiber PLACEMENT / UPDATE / DELETION│
                             └──────────────────┬──────────────────┘
                                                │  (all work done)
                             ┌──────────────────▼──────────────────┐
                             │  COMMIT PHASE  (synchronous, atomic)│
                             │  apply every tag to the real DOM,   │
                             │  attach refs, run effects           │
                             └──────────────────┬──────────────────┘
                                                │
                                          browser paints
                                                │
                            setState / store.dispatch ──▶ back to RENDER
```

### File map

```
src/
  index.js              public API — the single thing apps import
  jsx-runtime.js        what the JSX compiler calls (jsx, jsxs, Fragment)
  jsx-dev-runtime.js    same, for dev builds
  core/
    element.js          createElement / h / jsx / Fragment — UI as plain objects
    dom.js              createDom, updateDom — props, events, styles, SVG
    scheduler.js        requestIdleCallback with a MessageChannel fallback
    reconciler.js       fibers, the work loop, keyed diffing, the commit phase
    hooks.js            useState, useReducer, useEffect, useMemo, useRef, …
    context.js          createContext / useContext
    current.js          shared mutable "who is rendering right now" state
  store/
    index.js            createStore, combineReducers, applyMiddleware
    middleware.js       thunk, logger
    bindings.js         <StoreProvider>, useSelector, useDispatch
  router/
    index.js            <Router>, <Routes>, <Route>, <Link>, useNavigate, useParams

example/                a real app using all of it — routing + store + hooks
```

---

## 4. Build plan

Each phase is independently runnable, so we always have something working.

| Phase | What lands | Status |
|---|---|---|
| **0. Scaffold** | `package.json`, `vite.config.js`, `index.html` | ✅ |
| **1. Elements** | `createElement` / `h` / `jsx`, `Fragment`, text-node wrapping | ✅ |
| **2. DOM layer** | `createDom` / `updateDom`: props, events, style objects, SVG | ✅ |
| **3. Scheduler** | idle-callback work loop with a `MessageChannel` fallback for Safari | ✅ |
| **4. Reconciler** | fiber tree, render/commit split, **keyed** diffing, deletions, refs | ✅ |
| **5. Hooks** | `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useRef` | ✅ |
| **6. Context** | `createContext`, `useContext` | ✅ |
| **7. Store** | `createStore`, `combineReducers`, `applyMiddleware`, thunk + logger | ✅ |
| **8. Bindings** | `<StoreProvider>`, `useSelector`, `useDispatch` | ✅ |
| **9. Router** | History API, `<Router>`, `<Routes>`, `<Route>`, `<Link>`, `useParams`, `useNavigate` | ✅ |
| **10. Demo app** | Todo app: routing, store, forms, keyed lists, effects | ✅ |

All ten shipped, plus an eleventh that wasn't in the original plan:

| **11. Bailouts** | double-buffered fibers, dirty-marking, `memo`, context subscriptions, benchmark | ✅ |

Verified two ways: 40 unit tests against a real DOM, and a headless Chrome pass that drives
the actual demo (clicks, typing, routing, reordering). The core is **24 kB minified /
8 kB gzipped**.

Plus SSR, which wasn't in the original plan either:

| **12. Server rendering** | `renderToString` / `renderToStaticMarkup` (DOM-free, runs in plain Node) and `hydrate` (adopts the server DOM instead of rebuilding it) | ✅ |

**Explicitly out of scope for v1** (each is a fine follow-up):
streaming SSR, React Server Components, portals, suspense, class components, a file-based
router, or our own bundler.

---

## 5. The API we're aiming for

The whole point is that this should feel obvious to write. If you know React, you already
know Danio — that familiarity *is* the design goal, not a coincidence.

```jsx
import { render, useState, useEffect } from 'danio-js'

function Counter({ label }) {
  const [n, setN] = useState(0)

  useEffect(() => {
    document.title = `${label}: ${n}`
  }, [n])

  return (
    <button onClick={() => setN(n + 1)}>
      {label} — clicked {n} times
    </button>
  )
}

render(<Counter label="Danio" />, document.getElementById('root'))
```

With the store and router:

```jsx
import { render, createStore, StoreProvider, useSelector, useDispatch,
         Router, Routes, Route, Link } from 'danio-js'

const store = createStore(reducer)

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
        <Route path="/todos" component={Todos} />
        <Route path="/todos/:id" component={TodoDetail} />
      </Routes>
    </Router>
  </StoreProvider>,
  document.getElementById('root'),
)
```

---

## 6. Running it

```bash
npm install     # Vite (to compile JSX) and jsdom (to test) — both dev-only
npm run dev     # http://localhost:5173
npm test        # 40 tests against a real DOM
npm run bench   # proves the bailout claim in §8
npm run build   # -> dist/
```

The test suite is worth a look, because it asserts on the parts that are easy to get
subtly wrong: that a keyed reorder **moves** the existing `<li>` nodes rather than
rewriting them, that an effect's cleanup runs on unmount, that `useSelector` ignores an
action which only touched a different slice of the store, and that clicking a `<Link>`
changes the URL without a page load.

---

## 7. Using Danio without a build step

JSX is a convenience, not a requirement. `h` is the same function the compiler calls,
so you can write the tree by hand and open the HTML file directly — no npm, no Vite:

```html
<script type="module">
  import { h, render, useState } from './src/index.js'

  function Counter() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => setN(n + 1) }, 'clicked ', n, ' times')
  }

  render(h(Counter), document.getElementById('root'))
</script>
```

---

## 8. Bailouts: why an update doesn't re-render everything

This is the biggest thing Danio does that the tutorials don't, and it is the difference
between a teaching toy and something you can put a product on.

Didact rebuilds the entire fiber tree from the root on every update. It's easy to follow
and it does not scale. We measured it (`npm run bench`, 500-row app, 2,002 components):

```text
BEFORE          one setState  ->  2002 component calls,  4.81ms
AFTER           one setState  ->     1 component call,   0.024ms       ~200x
```

Every keystroke in a search box re-ran all two thousand components. So an update no longer
starts by re-rendering everything:

1. **setState leaves a trail.** It marks its own fiber `dirty`, then walks up the parent
   chain setting `childDirty` — breadcrumbs from the root down to the one component that
   actually changed.
2. **The render pass follows the trail.** It still starts at the root, but at each fiber it
   asks "am I dirty, and are my props a *different object* than last time?" If neither, it
   **bails out** — it never calls the component function.
3. **A clean subtree is skipped whole.** A bailed-out fiber with no `childDirty` hands back
   its entire previous subtree by reference. We don't even walk it.

Three consequences fall out of this, and they explain most of the code:

**Props are compared by identity, not value.** That works because a parent that bails out
never re-runs, so it never builds new child elements — its children's props are literally
the same objects, and they bail too. One skip cascades into skipping a branch.

**`memo()` exists for the other case.** When a parent *does* re-render, it creates fresh
elements, so its children get new-but-equal props objects and re-render with it. `memo`
swaps the identity check for a shallow value compare. It is not free (you pay a compare on
every parent render) and it is defeated by inline callbacks and object literals, which are
new objects each time — pair it with `useCallback`/`useMemo` or it's dead weight.

**Context needs a real subscription now.** Before bailouts, `useContext` was free: we
re-rendered everything, so every consumer re-read the value on its way past. Now a consumer
is exactly the kind of component that bails out — its own props didn't change — so a new
value would never reach it. `useContext` therefore records the dependency on its fiber, and
when a Provider's value changes the reconciler walks its subtree and dirties the consumers
by hand.

**Fibers are double-buffered.** Each position owns two fiber objects that swap roles each
render (`alternate` points at the other). We need this because bailed-out subtrees are
reused by reference and must survive, and because a setState closure captured from an old
render must still be able to dirty the live fiber — with only two objects, marking both
always hits it.

## 9. Scheduling: two things the tutorials don't tell you

Didact schedules *all* work on `requestIdleCallback`. That is elegant, and in a real
browser it is broken in two ways that only show up when you actually drive the UI. Both
cost us a debugging session, so they're worth writing down.

**1. User input must render synchronously.** Consider the most ordinary code in the world:

```jsx
const [count, setCount] = useState(0)
<button onClick={() => setCount(count + 1)}>{count}</button>
```

Click it twice, fast. Each handler closes over `count` *as of its last render*. If the
idle callback hasn't run in between, the second click still sees `count === 0`, computes
`0 + 1`, and you land on 1 instead of 2. The update is silently lost — and it is not the
user's bug to fix.

React solves this by rendering discrete input events synchronously, and so do we: the
event proxy in `dom.js` calls `flushSync()` after every handler. Updates made *within* one
handler still batch into a single render; the guarantee is only that the **next** event
sees fresh state.

**2. A timed-out idle callback reports zero time remaining.** `requestIdleCallback(cb)`
alone can be starved indefinitely, so an update from a `setInterval` or a `fetch` may
never render. The fix is `{ timeout: 50 }` — but that introduces a nastier bug. When the
callback fires *because the timeout expired*, the browser is telling you it is **not**
idle, and `deadline.timeRemaining()` returns `0`. A work loop that yields when
`timeRemaining() < 1` will therefore yield immediately, do no work, reschedule, and get
another 0ms budget — forever. A livelock: the loop spins at full speed and the UI never
updates again.

So the scheduler checks `deadline.didTimeout` and, when set, spends a fixed 5ms slice of
its own instead of trusting the browser's number. The reconciler is handed a
`shouldYield()` predicate rather than the raw deadline, so this nuance lives in exactly
one place.

## 10. Known gaps

Honest list of what's missing before this carries a real product.

**Correctness**
- ✅ ~~No error boundaries.~~ **Done.** `<ErrorBoundary fallback={(err, reset) => ...}>`
  catches render *and* effect errors in its subtree, isolates them to the nearest boundary,
  and supports `reset()` and an `onError` callback. An uncaught error surfaces to
  `window.onerror` without wedging other roots.
- ✅ ~~No dev warnings.~~ **Done.** Warns on missing keys in dynamic lists (but not static
  children), duplicate keys, hooks called out of order, and setState after unmount; throws a
  helpful message on an invalid element type. All behind a `DEV` flag.
- A component that both moves and changes shape in the same update may do one redundant DOM
  insertion. Correct, just not minimal.

**Missing features**
- No `forwardRef`, portals, Suspense, or lazy loading.
- Effects run synchronously after commit, not after paint like React's passive effects.
- The router has no nested routes, scroll restoration, or code splitting.

**Not yet proven**
- **Only tested in Chrome and jsdom.** Safari and Firefox are genuinely untested.

TypeScript types (`.d.ts` for the API and the JSX runtime) now ship in the package.

**SSR + hydration now ship.** `renderToString`/`renderToStaticMarkup` run in plain Node with
no DOM, and `hydrate()` adopts the server markup on the client — reusing each node and
splitting collapsed text runs rather than rebuilding the tree. What's still missing is the
*hard* end of SSR: streaming, server data fetching, and RSC. Basic static SSR for SEO and
fast first paint is done and tested.

**The thing that isn't a code problem**
A framework's cost isn't the reconciler; it's the ecosystem. React has form libraries, date
pickers, testing tools, error reporting integrations, and people you can hire who already
know it. Danio can be a genuinely good 21 kB framework. It cannot be that. Choose it for a
constrained target — size-critical, embedded, a controlled internal platform — not to
out-React React.
