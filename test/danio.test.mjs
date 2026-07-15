/**
 * Runs the framework against a real DOM (jsdom) and asserts on what actually lands in it.
 * `node --test test/danio.test.mjs`
 *
 * jsdom is a devDependency only — nothing in src/ imports it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

// A real URL, not about:blank — the router calls history.pushState, which needs an origin.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Event = dom.window.Event
globalThis.URLSearchParams = dom.window.URLSearchParams
// We deliberately do NOT copy jsdom's `performance` or `MessageChannel` onto the global.
// Node already provides both, and jsdom's versions misbehave outside a browser (its
// `performance.now` re-enters itself; its `MessageChannel` isn't constructible here).
// The scheduler only needs *a* working MessageChannel, and Node's is one.

const {
  h, render, hydrate, unmount, Fragment,
  renderToString, renderToStaticMarkup,
  useState, useEffect, useMemo, useRef, useReducer,
  createContext, useContext,
  memo, ErrorBoundary,
  createStore, combineReducers, applyMiddleware, thunk,
  StoreProvider, useSelector, useDispatch,
  matchPath, Router, Routes, Route, Link, navigate, useParams, useLocation,
} = await import('../src/index.js')

const { renderToString: serverRenderToString } = await import('../src/server/index.js')

const { resetWarnings } = await import('../src/core/dev.js')

/** Danio renders asynchronously (that's the whole point of the scheduler), so tests wait. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 30))

function mount() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

test('renders elements, props, and text', async () => {
  const container = mount()
  render(h('div', { id: 'greet', className: 'hi' }, 'hello ', 'world'), container)
  await flush()

  const div = container.firstChild
  assert.equal(div.tagName, 'DIV')
  assert.equal(div.id, 'greet')
  assert.equal(div.className, 'hi')
  assert.equal(div.textContent, 'hello world')
})

test('skips null, undefined, and false children', async () => {
  const container = mount()
  render(h('ul', null, h('li', null, 'a'), null, false, undefined, h('li', null, 'b')), container)
  await flush()

  assert.equal(container.querySelectorAll('li').length, 2)
})

test('useState re-renders and preserves the DOM node', async () => {
  const container = mount()

  function Counter() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => setN(n + 1) }, `count ${n}`)
  }

  render(h(Counter), container)
  await flush()

  const button = container.querySelector('button')
  assert.equal(button.textContent, 'count 0')

  button.click()
  await flush()
  assert.equal(button.textContent, 'count 1')
  // Same node, updated in place — not replaced.
  assert.equal(container.querySelector('button'), button)
})

test('two fast clicks both count — no lost update', async () => {
  const container = mount()

  function Counter() {
    const [n, setN] = useState(0)
    // Deliberately the naive form: it closes over `n`. If the framework doesn't render
    // between the two events, the second click reads a stale 0 and we land on 1, not 2.
    return h('button', { onClick: () => setN(n + 1) }, String(n))
  }

  render(h(Counter), container)
  await flush()

  const button = container.querySelector('button')
  button.click()
  button.click() // fires immediately, with no chance for an idle callback in between
  await flush()

  assert.equal(button.textContent, '2')
})

test('updates within a single handler batch into one render', async () => {
  const container = mount()
  let renders = 0

  function Counter() {
    renders++
    const [a, setA] = useState(0)
    const [b, setB] = useState(0)
    return h('button', { onClick: () => { setA(a + 1); setB(b + 1) } }, `${a}${b}`)
  }

  render(h(Counter), container)
  await flush()

  const before = renders
  container.querySelector('button').click()
  await flush()

  assert.equal(container.querySelector('button').textContent, '11')
  assert.equal(renders - before, 1, 'two setStates in one handler should cause one render')
})

test('functional setState sees the latest value', async () => {
  const container = mount()

  function Counter() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => { setN((v) => v + 1); setN((v) => v + 1) } }, String(n))
  }

  render(h(Counter), container)
  await flush()

  container.querySelector('button').click()
  await flush()
  // Both updates apply — the second sees the first, so this is 2, not 1.
  assert.equal(container.querySelector('button').textContent, '2')
})

test('KEYED REORDER moves DOM nodes instead of rewriting them', async () => {
  const container = mount()
  let setItems

  function List() {
    const [items, set] = useState(['a', 'b', 'c'])
    setItems = set
    return h('ul', null, ...items.map((item) => h('li', { key: item }, item)))
  }

  render(h(List), container)
  await flush()

  const before = [...container.querySelectorAll('li')]
  assert.deepEqual(before.map((li) => li.textContent), ['a', 'b', 'c'])

  // Reverse the list. Each <li> should be the *same DOM node*, just relocated.
  setItems(['c', 'b', 'a'])
  await flush()

  const after = [...container.querySelectorAll('li')]
  assert.deepEqual(after.map((li) => li.textContent), ['c', 'b', 'a'])
  assert.equal(after[0], before[2], 'node "c" should be reused, not recreated')
  assert.equal(after[1], before[1], 'node "b" should be reused, not recreated')
  assert.equal(after[2], before[0], 'node "a" should be reused, not recreated')
})

test('keyed insert at the head reuses the existing nodes', async () => {
  const container = mount()
  let setItems

  function List() {
    const [items, set] = useState(['b', 'c'])
    setItems = set
    return h('ul', null, ...items.map((item) => h('li', { key: item }, item)))
  }

  render(h(List), container)
  await flush()
  const before = [...container.querySelectorAll('li')]

  setItems(['a', 'b', 'c'])
  await flush()
  const after = [...container.querySelectorAll('li')]

  assert.deepEqual(after.map((li) => li.textContent), ['a', 'b', 'c'])
  assert.equal(after[1], before[0])
  assert.equal(after[2], before[1])
})

test('removing a keyed item deletes only that node', async () => {
  const container = mount()
  let setItems

  function List() {
    const [items, set] = useState(['a', 'b', 'c'])
    setItems = set
    return h('ul', null, ...items.map((item) => h('li', { key: item }, item)))
  }

  render(h(List), container)
  await flush()
  const before = [...container.querySelectorAll('li')]

  setItems(['a', 'c'])
  await flush()
  const after = [...container.querySelectorAll('li')]

  assert.deepEqual(after.map((li) => li.textContent), ['a', 'c'])
  assert.equal(after[0], before[0])
  assert.equal(after[1], before[2])
})

test('changing type replaces the node', async () => {
  const container = mount()
  let swap

  function Swap() {
    const [isDiv, set] = useState(true)
    swap = () => set(false)
    return isDiv ? h('div', null, 'x') : h('span', null, 'x')
  }

  render(h(Swap), container)
  await flush()
  assert.equal(container.firstChild.tagName, 'DIV')

  swap()
  await flush()
  assert.equal(container.firstChild.tagName, 'SPAN')
  assert.equal(container.childNodes.length, 1, 'old node must be removed, not left behind')
})

test('useEffect runs, re-runs on dep change, and cleans up on unmount', async () => {
  const container = mount()
  const log = []
  let setDep

  function Widget() {
    const [dep, set] = useState(1)
    setDep = set
    useEffect(() => {
      log.push(`setup ${dep}`)
      return () => log.push(`cleanup ${dep}`)
    }, [dep])
    return h('div', null, String(dep))
  }

  render(h(Widget), container)
  await flush()
  assert.deepEqual(log, ['setup 1'])

  setDep(2)
  await flush()
  assert.deepEqual(log, ['setup 1', 'cleanup 1', 'setup 2'])

  unmount(container)
  assert.deepEqual(log, ['setup 1', 'cleanup 1', 'setup 2', 'cleanup 2'])
})

test('an empty dep array runs the effect exactly once', async () => {
  const container = mount()
  let runs = 0
  let bump

  function Widget() {
    const [n, set] = useState(0)
    bump = () => set(n + 1)
    useEffect(() => { runs++ }, [])
    return h('div', null, String(n))
  }

  render(h(Widget), container)
  await flush()
  bump()
  await flush()
  bump()
  await flush()

  assert.equal(runs, 1)
})

test('useMemo recomputes only when deps change', async () => {
  const container = mount()
  let computes = 0
  let bump
  let setDep

  function Widget() {
    const [n, setN] = useState(0)
    const [dep, setD] = useState('a')
    bump = () => setN(n + 1)
    setDep = setD
    const value = useMemo(() => { computes++; return dep.toUpperCase() }, [dep])
    return h('div', null, `${value}${n}`)
  }

  render(h(Widget), container)
  await flush()
  assert.equal(computes, 1)

  bump() // unrelated state change
  await flush()
  assert.equal(computes, 1, 'should not recompute when deps are unchanged')

  setDep('b')
  await flush()
  assert.equal(computes, 2)
})

test('useRef holds a DOM node and survives re-renders', async () => {
  const container = mount()
  let ref
  let bump

  function Widget() {
    const [n, setN] = useState(0)
    const input = useRef(null)
    ref = input
    bump = () => setN(n + 1)
    return h('input', { ref: input, 'data-n': n })
  }

  render(h(Widget), container)
  await flush()

  const node = container.querySelector('input')
  assert.equal(ref.current, node)

  bump()
  await flush()
  assert.equal(ref.current, node, 'ref must still point at the same node')
})

test('fragments render children without a wrapper element', async () => {
  const container = mount()
  render(h('div', null, h(Fragment, null, h('b', null, '1'), h('i', null, '2'))), container)
  await flush()

  const div = container.firstChild
  assert.equal(div.children.length, 2)
  assert.equal(div.children[0].tagName, 'B')
  assert.equal(div.children[1].tagName, 'I')
})

test('context reaches deep consumers', async () => {
  const container = mount()
  const Theme = createContext('light')

  const Deep = () => h('span', null, useContext(Theme))
  const Middle = () => h('div', null, h(Deep))

  render(h(Theme.Provider, { value: 'dark' }, h(Middle)), container)
  await flush()

  assert.equal(container.querySelector('span').textContent, 'dark')
})

test('useContext falls back to the default with no provider', async () => {
  const container = mount()
  const Theme = createContext('light')
  render(h(() => h('span', null, useContext(Theme))), container)
  await flush()

  assert.equal(container.querySelector('span').textContent, 'light')
})

test('event handlers update without duplicating listeners', async () => {
  const container = mount()
  let calls = 0

  function Widget() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => { calls++; setN(n + 1) } }, String(n))
  }

  render(h(Widget), container)
  await flush()

  const button = container.querySelector('button')
  button.click()
  await flush()
  button.click()
  await flush()

  assert.equal(calls, 2, 'handler must fire once per click, not once per render')
  assert.equal(button.textContent, '2')
})

/* ---------------- bailouts ---------------- */

test('BAILOUT: setState in a leaf re-renders only that leaf', async () => {
  const container = mount()
  const runs = { app: 0, sidebar: 0, item: 0, leaf: 0 }
  let bump

  const Item = () => { runs.item++; return h('li', null, 'item') }
  const Sidebar = () => { runs.sidebar++; return h('ul', null, h(Item), h(Item), h(Item)) }

  function Leaf() {
    runs.leaf++
    const [n, setN] = useState(0)
    bump = () => setN(n + 1)
    return h('span', null, String(n))
  }

  function App() {
    runs.app++
    return h('div', null, h(Sidebar), h(Leaf))
  }

  render(h(App), container)
  await flush()
  assert.deepEqual(runs, { app: 1, sidebar: 1, item: 3, leaf: 1 })

  bump()
  await flush()

  // Only Leaf re-runs. Everything else bails out — this is the whole point of the rewrite.
  assert.deepEqual(runs, { app: 1, sidebar: 1, item: 3, leaf: 2 })
  assert.equal(container.querySelector('span').textContent, '1')
})

test('a parent that re-renders DOES re-render its children (no free memoisation)', async () => {
  const container = mount()
  let childRuns = 0
  let bump

  const Child = () => { childRuns++; return h('span', null, 'child') }

  function Parent() {
    const [n, setN] = useState(0)
    bump = () => setN(n + 1)
    return h('div', null, String(n), h(Child))
  }

  render(h(Parent), container)
  await flush()
  assert.equal(childRuns, 1)

  bump()
  await flush()
  // Parent re-ran, so it built a fresh <Child/> element with new props. Child re-renders.
  assert.equal(childRuns, 2, 'children of a re-rendered parent must re-render by default')
})

test('memo stops the cascade from a re-rendering parent', async () => {
  const container = mount()
  let childRuns = 0
  let bump

  const Child = memo(({ label }) => {
    childRuns++
    return h('span', null, label)
  })

  function Parent() {
    const [n, setN] = useState(0)
    bump = () => setN(n + 1)
    return h('div', null, String(n), h(Child, { label: 'steady' }))
  }

  render(h(Parent), container)
  await flush()
  assert.equal(childRuns, 1)

  bump()
  await flush()
  assert.equal(childRuns, 1, 'memo child with unchanged props must not re-render')
  assert.equal(container.querySelector('div').textContent, '1steady')

  // ...but it must still re-render when its props actually change.
  let setLabel
  function Parent2() {
    const [label, set] = useState('a')
    setLabel = set
    return h('div', null, h(Child, { label }))
  }

  const container2 = mount()
  childRuns = 0
  render(h(Parent2), container2)
  await flush()
  assert.equal(childRuns, 1)

  setLabel('b')
  await flush()
  assert.equal(childRuns, 2, 'memo child must re-render when props change')
  assert.equal(container2.querySelector('span').textContent, 'b')
})

test('CONTEXT reaches a consumer through a bailed-out parent', async () => {
  // This is the case that bailouts break, and the reason context needs a subscription:
  // Middle's props never change, so it bails out — yet Deep must still see the new value.
  const container = mount()
  const Theme = createContext('light')
  let setTheme
  let middleRuns = 0

  const Deep = () => h('span', null, useContext(Theme))

  const Middle = () => {
    middleRuns++
    return h('div', null, h(Deep))
  }

  const stableChild = h(Middle) // same element every render, so Middle's props never change

  function App() {
    const [theme, set] = useState('dark')
    setTheme = set
    return h(Theme.Provider, { value: theme }, stableChild)
  }

  render(h(App), container)
  await flush()
  assert.equal(container.querySelector('span').textContent, 'dark')
  assert.equal(middleRuns, 1)

  setTheme('solarized')
  await flush()

  assert.equal(container.querySelector('span').textContent, 'solarized', 'consumer must see the new value')
  assert.equal(middleRuns, 1, 'the untouched middle component should still have bailed out')
})

test('an interrupted render does not drop the update that interrupted it', async () => {
  const container = mount()
  let bump

  function Counter() {
    const [n, setN] = useState(0)
    bump = (v) => setN(v)
    return h('span', null, String(n))
  }

  render(h(Counter), container)
  await flush()

  // Two updates in a row with no flush between: the second lands while the first may still
  // be rendering. The final DOM must reflect the LAST value, not a discarded intermediate.
  bump(1)
  bump(2)
  await flush()
  assert.equal(container.querySelector('span').textContent, '2')
})

/* ---------------- error boundaries ---------------- */

test('ErrorBoundary catches a render error and shows the fallback', async () => {
  const container = mount()
  const caught = []

  function Boom() {
    throw new Error('kaboom')
  }

  render(
    h(
      'div',
      null,
      h('p', null, 'sibling survives'),
      h(
        ErrorBoundary,
        {
          onError: (error) => caught.push(error.message),
          fallback: (error) => h('p', { id: 'fallback' }, `caught: ${error.message}`),
        },
        h(Boom),
      ),
    ),
    container,
  )
  await flush()

  assert.equal(container.querySelector('#fallback').textContent, 'caught: kaboom')
  assert.deepEqual(caught, ['kaboom'])
  // The rest of the tree must still be on screen — that's the whole point.
  assert.equal(container.querySelector('p').textContent, 'sibling survives')
})

test('ErrorBoundary reset() re-mounts the subtree', async () => {
  const container = mount()
  let shouldThrow = true

  function Flaky() {
    if (shouldThrow) throw new Error('nope')
    return h('p', { id: 'ok' }, 'recovered')
  }

  render(
    h(
      ErrorBoundary,
      { fallback: (error, reset) => h('button', { onClick: reset }, `retry: ${error.message}`) },
      h(Flaky),
    ),
    container,
  )
  await flush()
  assert.equal(container.querySelector('button').textContent, 'retry: nope')

  shouldThrow = false
  container.querySelector('button').click()
  await flush()

  assert.equal(container.querySelector('#ok').textContent, 'recovered')
})

test('an error escapes to the NEAREST boundary, leaving outer ones alone', async () => {
  const container = mount()

  const Boom = () => {
    throw new Error('inner')
  }

  render(
    h(
      ErrorBoundary,
      { fallback: () => h('p', null, 'OUTER') },
      h('div', null, h(ErrorBoundary, { fallback: () => h('p', { id: 'inner' }, 'INNER') }, h(Boom))),
    ),
    container,
  )
  await flush()

  assert.equal(container.querySelector('#inner').textContent, 'INNER')
  assert.equal(container.textContent.includes('OUTER'), false, 'outer boundary must not trigger')
})

test('an error in an effect is routed to the boundary', async () => {
  const container = mount()

  function BadEffect() {
    useEffect(() => {
      throw new Error('effect blew up')
    }, [])
    return h('p', null, 'mounted')
  }

  render(
    h(ErrorBoundary, { fallback: (e) => h('p', { id: 'f' }, e.message) }, h(BadEffect)),
    container,
  )
  await flush()

  assert.equal(container.querySelector('#f').textContent, 'effect blew up')
})

test('a throwing component with no boundary does not wedge the work loop', async () => {
  const container = mount()
  const other = mount()

  // An unhandled render error is surfaced asynchronously (to reach window.onerror), so we
  // capture it here rather than let it fail the test — the point is that OTHER roots survive.
  const captured = []
  const onError = (error) => {
    captured.push(error.message)
    return true // handled
  }
  const previous = process.listeners('uncaughtException')
  process.removeAllListeners('uncaughtException')
  process.on('uncaughtException', onError)

  try {
    const Boom = () => {
      throw new Error('unhandled')
    }
    render(h(Boom), container)
    await flush()

    // The failed root must not leave the shared work loop stuck: a healthy root still renders.
    render(h('p', null, 'still alive'), other)
    await flush()
    assert.equal(other.querySelector('p').textContent, 'still alive')
    assert.ok(captured.includes('unhandled'), 'the error should still surface, not vanish')
  } finally {
    process.removeListener('uncaughtException', onError)
    for (const listener of previous) process.on('uncaughtException', listener)
  }
})

/* ---------------- dev warnings ---------------- */

test('warns about a missing key in a dynamic list, but not a static one', async () => {
  const container = mount()
  const messages = []
  const original = console.warn
  console.warn = (msg) => messages.push(msg)
  resetWarnings()

  try {
    // Static siblings: the compiler wrote this list, not a .map(). No key needed.
    render(h('div', null, h('span', null, 'a'), h('span', null, 'b')), container)
    await flush()
    assert.equal(messages.length, 0, 'static children must not warn')

    // A dynamic list: this one genuinely needs keys.
    render(h('ul', null, ['x', 'y'].map((t) => h('li', null, t))), container)
    await flush()
    assert.equal(messages.length, 1)
    assert.match(messages[0], /unique "key" prop/)
  } finally {
    console.warn = original
  }
})

test('warns about duplicate keys', async () => {
  const container = mount()
  const messages = []
  const original = console.warn
  console.warn = (msg) => messages.push(msg)
  resetWarnings()

  try {
    render(h('ul', null, [h('li', { key: 'a' }, '1'), h('li', { key: 'a' }, '2')]), container)
    await flush()
    assert.equal(messages.length, 1)
    assert.match(messages[0], /share the key "a"/)
  } finally {
    console.warn = original
  }
})

test('warns when hooks are called in a different order', async () => {
  const container = mount()
  const messages = []
  const original = console.warn
  console.warn = (msg) => messages.push(msg)
  resetWarnings()

  let flip
  try {
    function Bad() {
      const [on, setOn] = useState(false)
      flip = () => setOn(true)
      // The classic mistake: a hook behind a condition.
      if (on) useRef(null)
      useEffect(() => {}, [on])
      return h('p', null, String(on))
    }

    render(h(Bad), container)
    await flush()
    assert.equal(messages.length, 0)

    flip()
    await flush()
    assert.ok(
      messages.some((m) => /call order/.test(m)),
      `expected a hook-order warning, got: ${JSON.stringify(messages)}`,
    )
  } finally {
    console.warn = original
  }
})

test('warns on setState after unmount instead of silently doing nothing', async () => {
  const container = mount()
  const messages = []
  const original = console.warn
  console.warn = (msg) => messages.push(msg)
  resetWarnings()

  let escaped
  try {
    function Leaky() {
      const [n, setN] = useState(0)
      escaped = () => setN(n + 1) // a stray timer/fetch callback would look like this
      return h('p', null, String(n))
    }

    render(h(Leaky), container)
    await flush()

    unmount(container)
    escaped()
    await flush()

    assert.ok(
      messages.some((m) => /after it unmounted/.test(m)),
      `expected an unmount warning, got: ${JSON.stringify(messages)}`,
    )
  } finally {
    console.warn = original
  }
})

test('a bad element type fails with a message that says what to fix', () => {
  const NotExported = undefined
  assert.throws(() => h('div', null, h(NotExported)), /Element type is invalid.*import/s)
})

/* ---------------- store ---------------- */

test('createStore: getState, dispatch, subscribe, unsubscribe', () => {
  const store = createStore((state = 0, action) => (action.type === 'inc' ? state + 1 : state))
  assert.equal(store.getState(), 0)

  let notified = 0
  const off = store.subscribe(() => { notified++ })

  store.dispatch({ type: 'inc' })
  assert.equal(store.getState(), 1)
  assert.equal(notified, 1)

  off()
  store.dispatch({ type: 'inc' })
  assert.equal(store.getState(), 2)
  assert.equal(notified, 1, 'unsubscribed listener must not fire')
})

test('combineReducers keeps identity when nothing changed', () => {
  const store = createStore(
    combineReducers({
      a: (state = 1, action) => (action.type === 'bump' ? state + 1 : state),
      b: (state = 'x') => state,
    }),
  )

  const before = store.getState()
  store.dispatch({ type: 'noop' })
  assert.equal(store.getState(), before, 'same object back when no slice changed')

  store.dispatch({ type: 'bump' })
  assert.notEqual(store.getState(), before)
  assert.equal(store.getState().a, 2)
  assert.equal(store.getState().b, 'x')
})

test('applyMiddleware composes in order and thunk dispatches async', async () => {
  const order = []
  const trace = (name) => () => (next) => (action) => {
    order.push(name)
    return next(action)
  }

  const store = createStore(
    (state = [], action) => (action.type === 'add' ? [...state, action.value] : state),
    applyMiddleware(trace('one'), trace('two'), thunk),
  )

  store.dispatch({ type: 'add', value: 1 })
  assert.deepEqual(order, ['one', 'two'])

  store.dispatch((dispatch) => {
    setTimeout(() => dispatch({ type: 'add', value: 2 }), 5)
  })

  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.deepEqual(store.getState(), [1, 2])
})

test('a reducer that dispatches is rejected', () => {
  const store = createStore((state = 0, action) => {
    if (action.type === 'bad') store.dispatch({ type: 'other' })
    return state
  })
  assert.throws(() => store.dispatch({ type: 'bad' }), /may not dispatch/)
})

test('useSelector re-renders only when its slice changes', async () => {
  const container = mount()
  const store = createStore(
    combineReducers({
      count: (state = 0, action) => (action.type === 'inc' ? state + 1 : state),
      other: (state = 0, action) => (action.type === 'touch' ? state + 1 : state),
    }),
  )

  let renders = 0

  function Count() {
    renders++
    const count = useSelector((state) => state.count)
    const dispatch = useDispatch()
    return h('button', { onClick: () => dispatch({ type: 'inc' }) }, String(count))
  }

  render(h(StoreProvider, { store }, h(Count)), container)
  await flush()

  const initial = renders
  assert.equal(container.querySelector('button').textContent, '0')

  store.dispatch({ type: 'touch' })
  await flush()
  assert.equal(renders, initial, 'an unrelated slice must not trigger a render')

  container.querySelector('button').click()
  await flush()
  assert.equal(container.querySelector('button').textContent, '1')
})

/* ---------------- router ---------------- */

test('matchPath: exact, params, wildcard', () => {
  assert.deepEqual(matchPath('/', '/'), { params: {} })
  assert.equal(matchPath('/todos', '/other'), null)
  assert.deepEqual(matchPath('/todos', '/todos/'), { params: {} })
  assert.deepEqual(matchPath('/todos/:id', '/todos/42'), { params: { id: '42' } })
  assert.equal(matchPath('/todos/:id', '/todos'), null)
  assert.deepEqual(matchPath('/u/:a/p/:b', '/u/7/p/9'), { params: { a: '7', b: '9' } })
  assert.deepEqual(matchPath('*', '/anything/here'), { params: { '*': 'anything/here' } })
  assert.deepEqual(matchPath('/todos/:id', '/todos/a%20b'), { params: { id: 'a b' } })
})

test('the router renders the matching route, and Link navigates without reloading', async () => {
  window.history.replaceState({}, '', '/')
  const container = mount()

  const Home = () => h('h1', null, 'home')
  const Detail = () => h('h1', null, `todo ${useParams().id}`)
  const Missing = () => h('h1', null, `404 ${useLocation().pathname}`)

  render(
    h(
      Router,
      null,
      h(Link, { to: '/todos/7' }, 'go'),
      h(
        Routes,
        null,
        h(Route, { path: '/', component: Home }),
        h(Route, { path: '/todos/:id', component: Detail }),
        h(Route, { path: '*', component: Missing }),
      ),
    ),
    container,
  )
  await flush()
  assert.equal(container.querySelector('h1').textContent, 'home')

  // A left-click on a <Link> should be intercepted, not followed.
  const link = container.querySelector('a')
  assert.equal(link.getAttribute('href'), '/todos/7', 'must be a real href, so middle-click still works')
  link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  await flush()

  assert.equal(window.location.pathname, '/todos/7')
  assert.equal(container.querySelector('h1').textContent, 'todo 7', ':id param should reach the component')

  navigate('/nowhere')
  await flush()
  assert.equal(container.querySelector('h1').textContent, '404 /nowhere', 'catch-all route should win')

  unmount(container)
})

/* ================================================================== *
 * Server-side rendering
 * ================================================================== */

test('renderToString: elements, attributes, text, and nesting', () => {
  const html = renderToString(
    h('div', { id: 'card', className: 'box' }, h('h1', null, 'Hi'), h('p', null, 'there')),
  )
  assert.equal(html, '<div id="card" class="box"><h1>Hi</h1><p>there</p></div>')
})

test('renderToString: escapes text and attribute values', () => {
  const html = renderToString(h('a', { title: 'a "quote" & more' }, '1 < 2 & 3 > 0'))
  assert.equal(html, '<a title="a &quot;quote&quot; &amp; more">1 &lt; 2 &amp; 3 &gt; 0</a>')
})

test('renderToString: void elements self-close and omit children', () => {
  assert.equal(renderToString(h('img', { src: '/x.png', alt: 'x' })), '<img src="/x.png" alt="x"/>')
  assert.equal(renderToString(h('input', { value: 'hi', disabled: true })), '<input value="hi" disabled/>')
  assert.equal(renderToString(h('br', null)), '<br/>')
})

test('renderToString: boolean false and null props are dropped', () => {
  assert.equal(renderToString(h('input', { disabled: false, hidden: null })), '<input/>')
})

test('renderToString: style objects serialise with units', () => {
  const html = renderToString(h('div', { style: { marginTop: 8, opacity: 0.5, color: 'red' } }))
  assert.equal(html, '<div style="margin-top:8px;opacity:0.5;color:red;"></div>')
})

test('renderToString: runs components and reads useState/useMemo initial values', () => {
  function Widget({ label }) {
    const [n] = useState(3)
    const doubled = useMemo(() => n * 2, [n])
    return h('span', null, `${label}: ${doubled}`)
  }
  assert.equal(renderToString(h(Widget, { label: 'x' })), '<span>x: 6</span>')
})

test('renderToString: event handlers and dangerouslySetInnerHTML', () => {
  const html = renderToString(
    h('button', { onClick: () => {}, type: 'button', dangerouslySetInnerHTML: { __html: '<b>raw</b>' } }),
  )
  assert.equal(html, '<button type="button"><b>raw</b></button>')
})

test('renderToString: context provider value reaches a deep consumer', () => {
  const Theme = createContext('light')
  function Label() {
    return h('em', null, useContext(Theme))
  }
  const html = renderToString(
    h(Theme.Provider, { value: 'dark' }, h('div', null, h(Label, null))),
  )
  assert.equal(html, '<div><em>dark</em></div>')
})

test('renderToString: fragments and arrays flatten with no wrapper', () => {
  const html = renderToString(
    h('ul', null, [h('li', { key: 'a' }, 'a'), h('li', { key: 'b' }, 'b')]),
  )
  assert.equal(html, '<ul><li>a</li><li>b</li></ul>')
})

test('danio/server exposes the same renderToString (DOM-free entry)', () => {
  assert.equal(serverRenderToString(h('p', null, 'ok')), '<p>ok</p>')
})

/* ================================================================== *
 * Hydration
 * ================================================================== */

test('HYDRATE reuses the server DOM node instead of rebuilding it', () => {
  function App() {
    const [n, setN] = useState(0)
    return h('button', { onClick: () => setN(n + 1) }, `clicked ${n} times`)
  }

  const container = mount()
  container.innerHTML = renderToString(h(App))
  const serverButton = container.querySelector('button')
  serverButton.setAttribute('data-mark', 'server') // a marker only the original node carries

  hydrate(h(App), container)

  const afterButton = container.querySelector('button')
  assert.equal(afterButton, serverButton, 'the same DOM node must be adopted, not replaced')
  assert.equal(afterButton.getAttribute('data-mark'), 'server', 'the server node survives hydration')

  // And it is now interactive — the split "clicked / n / times" text updates in place.
  afterButton.click()
  assert.equal(container.querySelector('button').textContent, 'clicked 1 times')
  assert.equal(container.querySelector('button'), serverButton, 'still the same node after an update')

  unmount(container)
})

test('HYDRATE wires a click handler that the static markup could not carry', () => {
  let clicks = 0
  function App() {
    return h('button', { onClick: () => clicks++ }, 'go')
  }

  const container = mount()
  container.innerHTML = renderToString(h(App)) // <button>go</button> — no handler in the HTML
  hydrate(h(App), container)

  container.querySelector('button').click()
  assert.equal(clicks, 1, 'the handler must be attached to the existing node')

  unmount(container)
})

test('HYDRATE matches split text nodes across a mixed subtree', () => {
  function App() {
    const [name] = useState('Ada')
    return h('p', null, 'Hi ', name, ', welcome ', h('b', null, 'back'))
  }

  const container = mount()
  container.innerHTML = renderToString(h(App))
  const p = container.querySelector('p')
  const b = container.querySelector('b')

  hydrate(h(App), container)

  assert.equal(container.querySelector('p'), p, 'element node reused')
  assert.equal(container.querySelector('b'), b, 'nested element reused')
  assert.equal(container.querySelector('p').textContent, 'Hi Ada, welcome back')

  unmount(container)
})

test('HYDRATE then update patches the adopted tree normally', () => {
  function List() {
    const [items, setItems] = useState(['a', 'b'])
    return h(
      'div',
      null,
      h('button', { onClick: () => setItems([...items, 'c']) }, 'add'),
      h('ul', null, items.map((t) => h('li', { key: t }, t))),
    )
  }

  const container = mount()
  container.innerHTML = renderToString(h(List))
  const ul = container.querySelector('ul')
  assert.equal(container.querySelectorAll('li').length, 2)

  hydrate(h(List), container)
  container.querySelector('button').click()

  assert.equal(container.querySelectorAll('li').length, 3, 'update after hydration adds the row')
  assert.equal(container.querySelector('ul'), ul, 'the existing <ul> was kept, not rebuilt')
  assert.equal(container.querySelectorAll('li')[2].textContent, 'c')

  unmount(container)
})
