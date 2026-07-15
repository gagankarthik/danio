/**
 * The reconciler. This is the engine.
 *
 * A FIBER is one unit of work: one element, plus the bookkeeping needed to pause and
 * resume the work of rendering it. The tree is a linked list —
 *
 *     fiber.child    first child
 *     fiber.sibling  next child of the same parent
 *     fiber.parent   back up
 *
 * — rather than a nested array, so that at any moment we can hold a single pointer
 * (`nextUnitOfWork`), stop, let the browser paint, and resume exactly where we left off.
 * A recursive render() could not be interrupted; a linked list can.
 *
 * Work happens in two phases:
 *
 *   RENDER  — interruptible. Build the new fiber tree, diff it against the last committed
 *             one, tag fibers PLACEMENT / UPDATE / DELETION. Touches no DOM.
 *   COMMIT  — synchronous and atomic. Walk the finished tree once and apply the tags.
 *
 * The split is what makes interruption safe: if we mutated the DOM as we went, yielding
 * halfway would leave the user staring at a half-built UI.
 *
 * ---------------------------------------------------------------------------------------
 * BAILOUTS — why this file is more complicated than the tutorials'
 *
 * The naive version (Didact's) rebuilds the entire tree from the root on every update. It
 * is easy to understand and it does not scale: on a 2,000-component app, one setState in a
 * search box re-runs all 2,000 component functions. We measured 50ms per keystroke. That
 * is not a framework you can ship a product on.
 *
 * So an update does not start by re-rendering everything. Instead:
 *
 *   1. setState marks its own fiber `dirty`, and walks up the parent chain setting
 *      `childDirty` — leaving a trail of breadcrumbs from the root down to the one
 *      component that actually changed.
 *   2. The render pass still starts at the root, but at each fiber it asks: "am I dirty,
 *      and are my props a different object than last time?" If neither, it BAILS OUT —
 *      it does not call the component function at all.
 *   3. A bailed-out fiber with no `childDirty` returns its entire previous subtree
 *      untouched, and we skip it wholesale.
 *
 * The trail of breadcrumbs is what makes step 3 safe: we only skip a subtree when we know
 * nothing inside it asked to change.
 *
 * Two consequences worth understanding, because they explain the rest of this file:
 *
 * - Props are compared by IDENTITY, not deep equality. That works because a parent that
 *   bails out never re-runs, so it never builds new child elements, so its children's
 *   props are literally the same objects. When a parent DOES re-render, it creates fresh
 *   elements and its children re-render too — that is why `memo()` exists.
 *
 * - Fibers are DOUBLE-BUFFERED. Each position in the tree owns exactly two fiber objects
 *   that swap roles every render (`alternate` points at the other one). We need this
 *   because a bailed-out subtree is reused by reference, so its fibers must survive; and
 *   because a setState handler captured a fiber from an old render must still be able to
 *   mark the live one dirty — with only two objects, marking both always hits it.
 */

import { Fragment, TEXT_ELEMENT, normalizeChildren } from './element.js'
import { createDom, updateDom } from './dom.js'
import { scheduleWork, setWorkLoop } from './scheduler.js'
import { current as currentRender, runtime } from './current.js'
import { DEV, warn, nameOf } from './dev.js'

const PLACEMENT = 'PLACEMENT'
const UPDATE = 'UPDATE'
const DELETION = 'DELETION'

const roots = []
let activeRoot = null

/* ------------------------------------------------------------------ *
 * Public entry points
 * ------------------------------------------------------------------ */

function getOrCreateRoot(container) {
  let root = container.__danioRoot

  if (!root) {
    root = {
      container,
      element: null,
      currentRoot: null, // last committed fiber tree
      wipRoot: null, // tree being built right now
      nextUnitOfWork: null,
      deletions: [],
      effects: [],
      layoutEffects: [],
      pending: false,
      fromRender: false, // true when render() was called, vs. an internal setState
      hydrate: false, // true for the one commit that adopts server-rendered DOM
    }
    container.__danioRoot = root
    roots.push(root)
  }

  return root
}

export function render(element, container) {
  const root = getOrCreateRoot(container)

  root.element = element
  root.fromRender = true
  root.pending = true
  scheduleWork()
  return root
}

/**
 * Adopt server-rendered HTML instead of building fresh DOM.
 *
 * `render()` on a container that already holds server markup would create a whole new tree
 * and throw the old one away — a flash, and a waste. `hydrate()` instead walks the existing
 * DOM alongside the fiber tree, reuses each node in place, and only attaches the missing
 * half: event listeners, refs, and any values the HTML couldn't carry. After this one
 * commit the root behaves exactly like any other — updates diff and patch as normal.
 *
 * It runs synchronously (no idle-yielding) so the page is interactive the moment this
 * returns, with no window where the server markup is visible but dead.
 */
export function hydrate(element, container) {
  const root = getOrCreateRoot(container)

  root.element = element
  root.fromRender = true
  root.pending = true
  root.hydrate = true
  scheduleWork()
  flushSync()
  return root
}

export function unmount(container) {
  const root = container.__danioRoot
  if (!root) return

  if (root.currentRoot && root.currentRoot.child) commitDeletion(root.currentRoot.child)
  roots.splice(roots.indexOf(root), 1)
  if (activeRoot === root) activeRoot = null
  delete container.__danioRoot
}

/* ------------------------------------------------------------------ *
 * Dirty marking — the breadcrumb trail
 * ------------------------------------------------------------------ */

/**
 * A component asked to re-render. Mark it, then walk up to the root marking every ancestor
 * as "something below me changed", so the next render pass knows which branches to descend
 * into and which to skip.
 *
 * We mark both a fiber and its `alternate` at every level. The caller may be holding a
 * fiber from an older render (a setState closure outlives the render that made it), and
 * since double-buffering means only two objects ever exist per position, marking both is
 * guaranteed to hit whichever one the next render treats as current.
 */
function markDirty(fiber) {
  fiber.dirty = true
  if (fiber.alternate) fiber.alternate.dirty = true

  let node = fiber.parent
  while (node) {
    node.childDirty = true
    if (node.alternate) node.alternate.childDirty = true
    node = node.parent
  }
}

/**
 * A component called setState. Mark the trail, then ask for a render pass.
 *
 * Marking and scheduling are deliberately separate. Context propagation also marks fibers
 * dirty, but it does so from *inside* the render phase — and if it set `root.pending`, the
 * work loop would read that as "a setState landed mid-render", tear down the half-built
 * tree, and start again. On the restart the components it had already rendered would have
 * had their dirty flags cleared, so they'd bail out and re-serve their previous output:
 * the update would vanish. Context marks; only this schedules.
 */
export function scheduleUpdateOnFiber(fiber) {
  markDirty(fiber)
  fiber.root.pending = true
  scheduleWork()
}

runtime.markDirty = scheduleUpdateOnFiber

/**
 * Clear the flags on the fiber we are about to render — but NOT on its alternate.
 *
 * The alternate is the last *committed* fiber, and it is the only record that this update
 * exists until we commit. A render pass can be thrown away at any moment (an event arrives,
 * a higher-priority update lands), and when it restarts we rebuild the work-in-progress
 * tree from the committed one. If we had cleared the committed fiber's dirty flag, the
 * restarted pass would see a clean tree, bail out everywhere, and silently drop the update.
 * The stale flag left behind on the alternate is harmless: createWorkInProgress overwrites
 * it from `current` next time round.
 */
function clearWork(fiber) {
  fiber.dirty = false
  fiber.childDirty = false
}

/* ------------------------------------------------------------------ *
 * Fibers
 * ------------------------------------------------------------------ */

function createFiber(element, parent, index) {
  return {
    type: element.type,
    key: element.key,
    ref: element.ref,
    props: element.props,
    dom: null,
    parent,
    child: null,
    sibling: null,
    index,
    alternate: null,
    flags: PLACEMENT,
    moved: false,
    subtreeFlags: false,
    dirty: false,
    childDirty: false,
    hooks: null,
    deps: null,
    boundaryError: null,
    unmounted: false,
    svg: isSvg(parent, element.type),
    root: parent.root,
  }
}

/**
 * Get the work-in-progress twin of a committed fiber, recycling the object from two
 * renders ago rather than allocating. `child` is carried over by reference — if we end up
 * bailing out, that IS the answer; if we render, reconcileChildren overwrites it.
 */
function createWorkInProgress(current, pendingProps) {
  let wip = current.alternate

  if (!wip) {
    wip = {
      type: current.type,
      key: current.key,
      ref: current.ref,
      props: pendingProps,
      dom: current.dom,
      parent: null,
      child: current.child,
      sibling: null,
      index: current.index,
      alternate: current,
      flags: null,
      moved: false,
      subtreeFlags: false,
      dirty: current.dirty,
      childDirty: current.childDirty,
      hooks: current.hooks,
      deps: current.deps,
      boundaryError: current.boundaryError,
      unmounted: false,
      svg: current.svg,
      root: current.root,
    }
    current.alternate = wip
    return wip
  }

  wip.type = current.type
  wip.key = current.key
  wip.ref = current.ref
  wip.props = pendingProps
  wip.dom = current.dom
  wip.child = current.child
  wip.sibling = null
  wip.index = current.index
  wip.flags = null
  wip.moved = false
  wip.subtreeFlags = false
  wip.dirty = current.dirty
  wip.childDirty = current.childDirty
  wip.hooks = current.hooks
  wip.deps = current.deps
  wip.boundaryError = current.boundaryError
  wip.unmounted = false
  wip.svg = current.svg
  wip.root = current.root
  return wip
}

/* ------------------------------------------------------------------ *
 * The work loop
 * ------------------------------------------------------------------ */

// An effect may legitimately setState (that's how you react to a committed layout), which
// schedules another render inside the same flush. But an effect that setStates
// *unconditionally* would spin forever and hang the tab, so we cap the chain and fail
// loudly — the same trade React makes with "Maximum update depth exceeded".
const MAX_COMMITS_PER_FLUSH = 50

/**
 * `shouldYield()` comes from the scheduler and answers "am I out of time?". Passing a
 * predicate rather than the raw idle deadline is deliberate: a timed-out idle callback
 * reports 0ms remaining, and a loop that trusted that number would yield forever without
 * doing any work. The scheduler owns that nuance so the reconciler doesn't have to.
 */
function workLoop(shouldYield) {
  let commits = 0

  while (true) {
    if (!activeRoot) {
      activeRoot = roots.find((root) => root.pending)
      if (!activeRoot) break
      beginRootWork(activeRoot)
    }

    // A setState landed while we were mid-render. Throw away the half-built tree and start
    // over — it was never shown, so nothing is lost but the wasted work.
    if (activeRoot.pending) beginRootWork(activeRoot)

    if (!activeRoot.nextUnitOfWork) {
      const root = activeRoot
      activeRoot = null

      if (++commits > MAX_COMMITS_PER_FLUSH) {
        root.pending = false
        throw new Error(
          '[danio] Too many re-renders. An effect is probably calling setState on every ' +
            'render — give it a dependency array, or a condition that eventually stops.',
        )
      }

      if (root.hydrate) commitHydration(root)
      else commitRoot(root)
      continue
    }

    if (shouldYield()) break

    const unit = activeRoot.nextUnitOfWork
    try {
      activeRoot.nextUnitOfWork = performUnitOfWork(unit)
    } catch (error) {
      handleRenderError(activeRoot, unit, error)
    }
  }

  if (activeRoot || roots.some((root) => root.pending)) scheduleWork()
}

setWorkLoop(workLoop)

/**
 * Render everything pending, right now, without yielding.
 *
 * The idle-callback loop is the right default for background work, and the wrong thing for
 * user input. If two clicks arrive before the loop gets a slice of time, the second handler
 * still closes over the state from the first render — so `setCount(count + 1)` twice lands
 * on 1, not 2, and an update is silently lost. The DOM layer therefore calls this at the
 * end of every event handler: by the time the next event fires, the previous one is fully
 * rendered. Updates made *within* one handler still batch into a single render.
 */
const NEVER_YIELD = () => false
let flushing = false

export function flushSync() {
  if (flushing) return
  if (!activeRoot && !roots.some((root) => root.pending)) return

  flushing = true
  try {
    workLoop(NEVER_YIELD)
  } finally {
    flushing = false
  }
}

runtime.flushSync = flushSync

function beginRootWork(root) {
  const currentRoot = root.currentRoot

  if (!currentRoot) {
    root.wipRoot = {
      type: 'ROOT',
      key: null,
      ref: null,
      props: { children: [root.element] },
      dom: root.container,
      parent: null,
      child: null,
      sibling: null,
      index: 0,
      alternate: null,
      flags: null,
      moved: false,
      subtreeFlags: false,
      dirty: false,
      childDirty: false,
      hooks: null,
      deps: null,
      svg: false,
      root,
    }
  } else {
    // A fresh render() call means a new element, so give the root new props and let the
    // diff run. An internal setState reuses the exact same props object, which is what
    // lets the root bail out immediately and descend only where the breadcrumbs lead.
    const props = root.fromRender ? { children: [root.element] } : currentRoot.props
    root.wipRoot = createWorkInProgress(currentRoot, props)
    root.wipRoot.parent = null
  }

  root.fromRender = false
  root.deletions = []
  root.effects = []
  root.layoutEffects = []
  root.nextUnitOfWork = root.wipRoot
  root.pending = false
}

function performUnitOfWork(fiber) {
  const next = beginWork(fiber)
  if (next) return next

  let node = fiber
  while (node) {
    completeWork(node)
    if (node.sibling) return node.sibling
    node = node.parent
  }
  return null
}

/**
 * Either render this fiber, or prove we don't have to.
 * Returns the next fiber to work on, or null to skip this whole subtree.
 */
function beginWork(fiber) {
  const current = fiber.alternate

  if (current && !fiber.dirty && canReuseProps(fiber, current)) {
    // This component's own output cannot have changed. Don't call it.
    fiber.props = current.props // keep props identity stable so children can bail too
    fiber.hooks = current.hooks
    fiber.deps = current.deps

    if (!fiber.childDirty) {
      // And nothing underneath asked to change either. Reuse the committed subtree whole.
      fiber.child = current.child
      return null
    }

    // Something below is dirty. Clone this level's children so the wip tree stays
    // well-formed, and descend — but still without re-running this component.
    clearWork(fiber)
    cloneChildFibers(current, fiber)
    return fiber.child
  }

  clearWork(fiber)

  if (typeof fiber.type === 'function') updateFunctionComponent(fiber, current)
  else if (fiber.type === Fragment) reconcileChildren(fiber, fiber.props.children)
  else updateHostComponent(fiber)

  return fiber.child
}

/**
 * Props are compared by identity. A parent that bailed out did not re-run, so it did not
 * build new child elements — its children's props are literally the same object, and they
 * can bail too. That's how one skip cascades into skipping a whole branch.
 *
 * `memo()` is the escape hatch for the other case: a parent that DID re-render, producing
 * fresh (but equal) props for a child that doesn't care.
 */
function canReuseProps(fiber, current) {
  if (current.props === fiber.props) return true

  const type = fiber.type
  if (typeof type === 'function' && type.__compare) {
    return type.__compare(current.props, fiber.props)
  }
  return false
}

function cloneChildFibers(current, wip) {
  let child = current.child
  if (!child) {
    wip.child = null
    return
  }

  let clone = createWorkInProgress(child, child.props)
  clone.parent = wip
  wip.child = clone

  let previous = clone
  child = child.sibling
  while (child) {
    clone = createWorkInProgress(child, child.props)
    clone.parent = wip
    previous.sibling = clone
    previous = clone
    child = child.sibling
  }
  previous.sibling = null
}

/** Bubble "there is something to commit under me" up to the parent as we finish each fiber. */
function completeWork(fiber) {
  const parent = fiber.parent
  if (!parent) return
  if (fiber.flags !== null || fiber.moved || fiber.subtreeFlags) parent.subtreeFlags = true
}

/* ------------------------------------------------------------------ *
 * Error boundaries
 * ------------------------------------------------------------------ */

/**
 * A component that catches errors thrown while rendering anything beneath it, and shows a
 * fallback instead of taking the whole page down with it.
 *
 *   <ErrorBoundary fallback={(error, reset) => <p>Broke: {error.message} <button onClick={reset}>retry</button></p>}>
 *     <Dashboard />
 *   </ErrorBoundary>
 *
 * The reconciler renders this one itself rather than calling it, because the error arrives
 * from *outside* the component — thrown by a descendant, mid-render — and there is no way
 * for a function component to receive that through its own props or hooks.
 *
 * What it does NOT catch, matching React, because these don't happen during rendering:
 * event handlers, and anything asynchronous (a setTimeout, a rejected promise). Wrap those
 * in try/catch yourself.
 */
export function ErrorBoundary() {
  // Never actually invoked — see renderErrorBoundary. The marker is the whole point.
  return null
}
ErrorBoundary.__errorBoundary = true
ErrorBoundary.displayName = 'ErrorBoundary'

function renderErrorBoundary(fiber) {
  fiber.hooks = []
  fiber.deps = null

  const error = fiber.boundaryError

  if (!error) {
    reconcileChildren(fiber, fiber.props.children)
    return
  }

  const { fallback } = fiber.props
  const reset = () => {
    setBoundaryError(fiber, null)
    scheduleUpdateOnFiber(fiber)
  }

  const children = typeof fallback === 'function' ? fallback(error, reset) : (fallback ?? null)
  reconcileChildren(fiber, normalizeChildren(children))
}

/** Nearest boundary at or above `fiber`. */
function findBoundary(fiber) {
  let node = fiber
  while (node) {
    if (typeof node.type === 'function' && node.type.__errorBoundary) return node
    node = node.parent
  }
  return null
}

// The error has to live on both twins: the failed render pass is about to be thrown away and
// rebuilt from the committed tree, and the fallback must survive that.
function setBoundaryError(fiber, error) {
  fiber.boundaryError = error
  if (fiber.alternate) fiber.alternate.boundaryError = error
}

/**
 * A component threw while rendering. Find the nearest boundary above it, hand it the error,
 * and restart the render — the boundary will now render its fallback instead of the subtree
 * that blew up, which also unmounts the broken component and runs its cleanups.
 *
 * We search from `fiber.parent`, not `fiber`, so that a boundary whose own fallback throws
 * escalates to the boundary above it rather than catching itself in a loop.
 */
function handleRenderError(root, fiber, error) {
  const boundary = fiber ? findBoundary(fiber.parent) : null

  if (!boundary) {
    // Nothing to catch it. Abandon this root's pass so it doesn't wedge the work loop, but
    // do NOT throw synchronously here — that would kill the whole tick, and any *other*
    // healthy root scheduled alongside it would never render. Instead surface the error
    // asynchronously, so it still reaches console/window.onerror the way an unhandled error
    // should, while the loop moves on. (Same strategy as an unhandled error in an effect.)
    root.wipRoot = null
    root.nextUnitOfWork = null
    root.pending = false
    activeRoot = null

    if (DEV) {
      warn(
        `An error was thrown while rendering ${nameOf(fiber && fiber.type)} and no ` +
          '<ErrorBoundary> was above it, so that tree failed to render. Wrap a subtree ' +
          'in <ErrorBoundary fallback={...}> to contain failures like this.',
      )
    }

    console.error('[danio] Unhandled error during render:', error)
    setTimeout(() => {
      throw error
    })
    return
  }

  if (typeof boundary.props.onError === 'function') {
    try {
      boundary.props.onError(error)
    } catch (nested) {
      console.error('[danio] <ErrorBoundary onError> itself threw', nested)
    }
  }

  // Resume the SAME render pass from the boundary, rather than tearing down and restarting
  // the root. Restarting is wrong on a first render: with no committed tree to rebuild from,
  // the fresh tree has no memory of the error and just throws again, forever. Rewinding to
  // the boundary keeps the work already done above it (siblings, ancestors) and re-renders
  // only the boundary — which now shows its fallback. We force it dirty so it can't bail.
  setBoundaryError(boundary, error)
  boundary.dirty = true
  root.nextUnitOfWork = boundary
}

/** An effect threw. Same routing, but we're past the render phase. */
function handleEffectError(fiber, error) {
  const boundary = findBoundary(fiber)

  if (!boundary) {
    console.error('[danio] An effect threw and no <ErrorBoundary> was above it.', error)
    // Surface it asynchronously so it reaches window.onerror without corrupting the commit
    // we are in the middle of.
    setTimeout(() => {
      throw error
    })
    return
  }

  setBoundaryError(boundary, error)
  if (typeof boundary.props.onError === 'function') {
    try {
      boundary.props.onError(error)
    } catch (nested) {
      console.error('[danio] <ErrorBoundary onError> itself threw', nested)
    }
  }
  scheduleUpdateOnFiber(boundary)
}

/* ------------------------------------------------------------------ */

function updateHostComponent(fiber) {
  // While hydrating we leave `dom` null and let the hydration commit adopt the existing
  // server node instead of building a throwaway one here.
  if (!fiber.dom && !fiber.root.hydrate) fiber.dom = createDom(fiber)
  reconcileChildren(fiber, fiber.props.children)
}

function updateFunctionComponent(fiber, current) {
  if (fiber.type.__errorBoundary) {
    renderErrorBoundary(fiber)
    return
  }

  // A context Provider whose value changed must reach consumers that would otherwise bail
  // out — they are, by definition, components whose own props did not change. So we hunt
  // them down in the committed subtree and mark them dirty before we get there.
  const context = fiber.type.__context
  if (context && current && current.props.value !== fiber.props.value) {
    propagateContextChange(current, context)
  }

  currentRender.fiber = fiber
  currentRender.hookIndex = 0
  fiber.hooks = []
  fiber.deps = null

  let rawChildren
  try {
    rawChildren = fiber.type(fiber.props)
  } finally {
    // Must be cleared even when the component throws, or the next component to render would
    // inherit a stale "who is rendering" pointer and write its hooks into the wrong fiber.
    currentRender.fiber = null
  }

  if (DEV && current && current.hooks && current.hooks.length !== fiber.hooks.length) {
    warn(
      `${nameOf(fiber.type)} rendered ${fiber.hooks.length} hooks but rendered ` +
        `${current.hooks.length} on the previous pass. Hooks are matched up by call order, ` +
        'so calling one conditionally (inside an if, a loop, or after an early return) makes ' +
        'later hooks read each other\'s state. Move the condition inside the hook instead.',
    )
  }

  // A component's return value is raw — a single element, a string, null, or an array from
  // `.map()`. Normalise it here, which is also the one place a `.map()` return gets its
  // missing-key check. Everything else (host children, provider children) arrives already
  // normalised on props, and must NOT be re-checked — a normalised array is indistinguishable
  // from a user's dynamic list, so re-checking would false-warn on static children.
  reconcileChildren(fiber, normalizeChildren(rawChildren))
}

/**
 * Walk a Provider's committed subtree and dirty every component that read this context.
 * Stops at a nested Provider of the same context, whose value shadows ours.
 */
function propagateContextChange(providerFiber, context) {
  let node = providerFiber.child

  while (node) {
    if (node.deps && node.deps.has(context)) markDirty(node)

    const shadows = node !== providerFiber && node.type && node.type.__context === context
    let next = shadows ? null : node.child

    if (!next) {
      next = node
      while (next && next !== providerFiber) {
        if (next.sibling) {
          next = next.sibling
          break
        }
        next = next.parent
      }
      if (!next || next === providerFiber) return
    }
    node = next
  }
}

/* ------------------------------------------------------------------ *
 * Reconciliation — the diff
 * ------------------------------------------------------------------ */

/**
 * Compare the new children against the old ones and build the next row of fibers.
 *
 * The interesting part is KEYS. Without them we match children by position, so prepending
 * a row to a list looks like "every row's text changed, plus one new row at the end" —
 * every DOM node gets rewritten, and any focused input, text selection, or scroll position
 * inside them is destroyed. With keys we recognise that the same row is simply somewhere
 * else now, reuse its DOM node, and move it.
 *
 * `lastPlacedIndex` is how we work out what actually moved. Walking the new children in
 * order, we track the highest old-index we've placed. A child whose old position is behind
 * that watermark must have jumped backwards, so it needs a DOM move; one at or beyond it
 * can stay. That keeps a single item moving to the front from being reported as "every
 * other item moved back one".
 */
function reconcileChildren(wipFiber, elements) {
  const root = wipFiber.root

  const oldFibers = []
  const oldByKey = new Map()
  let oldFiber = wipFiber.alternate ? wipFiber.alternate.child : null
  while (oldFiber) {
    oldFiber.index = oldFibers.length
    oldFibers.push(oldFiber)
    if (oldFiber.key !== null) oldByKey.set(oldFiber.key, oldFiber)
    oldFiber = oldFiber.sibling
  }

  const claimed = new Set()
  const usedKeys = DEV ? new Set() : null
  let previous = null
  let lastPlacedIndex = 0

  elements.forEach((element, index) => {
    let matched = null

    if (DEV && element.key !== null) {
      if (usedKeys.has(element.key)) {
        warn(
          `Two children of ${nameOf(wipFiber.type)} share the key "${element.key}". Keys must ` +
            'be unique among siblings — with a duplicate, only one of the two can be matched ' +
            'to its previous DOM node and the other gets rebuilt from scratch.',
        )
      }
      usedKeys.add(element.key)
    }

    if (element.key !== null) {
      const candidate = oldByKey.get(element.key)
      if (candidate && !claimed.has(candidate)) matched = candidate
    } else {
      // No key: match by position, but never steal a keyed fiber.
      const candidate = oldFibers[index]
      if (candidate && candidate.key === null && !claimed.has(candidate)) matched = candidate
    }

    // A different type is a different thing — no key matching makes an <input> reusable as
    // a <div>. Tear it down and build fresh.
    const reusable = matched && matched.type === element.type

    let fiber
    if (reusable) {
      claimed.add(matched)
      fiber = createWorkInProgress(matched, element.props)
      fiber.ref = element.ref
      fiber.parent = wipFiber
      fiber.index = index
      fiber.flags = UPDATE
      fiber.svg = isSvg(wipFiber, element.type)

      if (matched.index < lastPlacedIndex) fiber.moved = true
      else lastPlacedIndex = matched.index
    } else {
      fiber = createFiber(element, wipFiber, index)
    }

    if (index === 0) wipFiber.child = fiber
    else previous.sibling = fiber
    previous = fiber
  })

  if (previous) previous.sibling = null
  else wipFiber.child = null

  for (const fiber of oldFibers) {
    if (claimed.has(fiber)) continue
    fiber.flags = DELETION
    root.deletions.push(fiber)
  }
}

// SVG-ness is inherited from the parent, started by <svg>, broken by <foreignObject>. We
// track it because SVG nodes must be created with createElementNS, not createElement.
function isSvg(parent, type) {
  if (type === 'svg') return true
  if (type === 'foreignObject') return false
  return parent.svg === true
}

/* ------------------------------------------------------------------ *
 * Commit — the only place the DOM gets mutated
 * ------------------------------------------------------------------ */

function commitRoot(root) {
  for (const fiber of root.deletions) commitDeletion(fiber)
  root.deletions = []

  commitWork(root.wipRoot.child)
  root.wipRoot.subtreeFlags = false

  root.currentRoot = root.wipRoot
  root.wipRoot = null

  // Layout effects see a committed DOM but run before the browser paints, so they can
  // measure and correct without the user seeing a flash.
  flushEffects(root.layoutEffects)
  flushEffects(root.effects)
  root.layoutEffects = []
  root.effects = []
}

/* ------------------------------------------------------------------ *
 * Hydration commit — adopt server DOM instead of creating it
 * ------------------------------------------------------------------ */

const TEXT_NODE = 3
const ELEMENT_NODE = 1

/**
 * The first render of a hydrating root. The fiber tree was built normally (components ran,
 * hooks mounted, effects queued) but with no DOM attached. Here we walk it against the
 * markup already sitting in the container, claiming each node in place.
 */
function commitHydration(root) {
  const rootFiber = root.wipRoot
  let cursor = root.container.firstChild

  for (let fiber = rootFiber.child; fiber; fiber = fiber.sibling) {
    cursor = hydrateWalk(fiber, root.container, cursor)
  }

  // Anything the server rendered that the fiber tree didn't account for is stale — drop it.
  removeRemaining(root.container, cursor)

  rootFiber.subtreeFlags = false
  root.currentRoot = rootFiber
  root.wipRoot = null
  root.hydrate = false // subsequent commits are ordinary client updates

  flushEffects(root.layoutEffects)
  flushEffects(root.effects)
  root.layoutEffects = []
  root.effects = []
}

/**
 * Claim the DOM for one fiber and return the next unclaimed sibling node. A function
 * component or Fragment owns no node of its own, so it just threads the cursor through its
 * children under the same DOM parent.
 */
function hydrateWalk(fiber, parentDom, cursor) {
  const type = fiber.type
  fiber.flags = null

  if (type === TEXT_ELEMENT) {
    const node = claimText(parentDom, cursor, fiber.props.nodeValue)
    fiber.dom = node
    return node.nextSibling
  }

  if (typeof type === 'string') {
    const node = claimElement(parentDom, cursor, fiber)
    fiber.dom = node
    if (fiber.ref) attachRef(fiber.ref, node)

    // `dangerouslySetInnerHTML` owns the node's contents wholesale; there are no child
    // fibers to line up against, so don't walk (or prune) what's inside.
    if (fiber.props.dangerouslySetInnerHTML == null) {
      let childCursor = node.firstChild
      for (let child = fiber.child; child; child = child.sibling) {
        childCursor = hydrateWalk(child, node, childCursor)
      }
      removeRemaining(node, childCursor)
    }

    return node.nextSibling
  }

  // Component or Fragment: no DOM node, children live directly under our DOM parent.
  let childCursor = cursor
  for (let child = fiber.child; child; child = child.sibling) {
    childCursor = hydrateWalk(child, parentDom, childCursor)
  }
  return childCursor
}

function claimElement(parentDom, cursor, fiber) {
  const type = fiber.type

  if (cursor && cursor.nodeType === ELEMENT_NODE && cursor.tagName.toLowerCase() === type) {
    // Attach events, set IDL properties the HTML can't carry (value/checked), and fix any
    // attribute drift. updateDom from an empty baseline is idempotent for markup that
    // already matches, so this is safe to run over server output.
    updateDom(cursor, {}, fiber.props)
    return cursor
  }

  // Mismatch: the server didn't render what the client expected here. Rather than throw,
  // build the node fresh and slot it in — the subtree below it will client-render too,
  // because it will find no markup to adopt.
  if (DEV) {
    warn(
      `Hydration mismatch: expected <${type}> but the server markup had ` +
        `${cursor ? describeNode(cursor) : 'nothing'} here. Rebuilding this node on the ` +
        'client. Make sure the same tree renders on the server and the client.',
    )
  }
  const created = createDom(fiber)
  if (cursor) parentDom.insertBefore(created, cursor)
  else parentDom.appendChild(created)
  return created
}

function claimText(parentDom, cursor, rawValue) {
  const value = rawValue == null ? '' : String(rawValue)

  // An empty text node carries nothing in the markup, so insert a fresh one without
  // consuming whatever the cursor points at.
  if (value === '') {
    const empty = document.createTextNode('')
    if (cursor) parentDom.insertBefore(empty, cursor)
    else parentDom.appendChild(empty)
    return empty
  }

  if (cursor && cursor.nodeType === TEXT_NODE) {
    const data = cursor.data
    if (data === value) return cursor
    // Adjacent text elements ("clicked ", n, " times") collapse into one server text node.
    // Peel off exactly this fiber's slice and leave the rest for the next one.
    if (data.length > value.length && data.startsWith(value)) {
      cursor.splitText(value.length)
      return cursor
    }
    // Genuine text mismatch — correct it so the DOM matches what the client believes.
    if (DEV) {
      warn(
        `Hydration text mismatch: server sent "${data}" where the client rendered ` +
          `"${value}". Using the client value.`,
      )
    }
    cursor.data = value
    return cursor
  }

  const created = document.createTextNode(value)
  if (cursor) parentDom.insertBefore(created, cursor)
  else parentDom.appendChild(created)
  return created
}

function removeRemaining(parentDom, cursor) {
  while (cursor) {
    const next = cursor.nextSibling
    parentDom.removeChild(cursor)
    cursor = next
  }
}

function describeNode(node) {
  if (node.nodeType === TEXT_NODE) return `the text "${node.data}"`
  if (node.nodeType === ELEMENT_NODE) return `<${node.tagName.toLowerCase()}>`
  return 'another node'
}

/**
 * Walk the new tree applying flags. `subtreeFlags` is what keeps this cheap: a branch that
 * bailed out has nothing to commit and nothing below it to commit, so we don't even walk
 * it. Without that, every update would still cost a full O(tree) traversal — we'd have
 * fixed the render phase and left the commit phase linear.
 */
function commitWork(fiber) {
  while (fiber) {
    const hasWork = fiber.flags !== null || fiber.moved

    if (hasWork) {
      if (fiber.flags === PLACEMENT || fiber.moved) commitPlacement(fiber)
      else if (fiber.flags === UPDATE && fiber.dom) {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
      }
      if (fiber.ref && fiber.dom) attachRef(fiber.ref, fiber.dom)
    }

    if (fiber.subtreeFlags) commitWork(fiber.child)

    fiber.flags = null
    fiber.moved = false
    fiber.subtreeFlags = false

    fiber = fiber.sibling
  }
}

function commitPlacement(fiber) {
  const parentDom = hostParentDom(fiber)
  if (!parentDom) return
  const anchor = hostSibling(fiber)

  if (fiber.dom) {
    if (anchor) parentDom.insertBefore(fiber.dom, anchor)
    else parentDom.appendChild(fiber.dom)
    return
  }

  // A function component or Fragment that MOVED. It owns no DOM node, so we move each DOM
  // subtree beneath it. (A newly *created* one needs nothing here: its children carry their
  // own PLACEMENT flags and will insert themselves.)
  if (fiber.moved) {
    for (let child = fiber.child; child; child = child.sibling) {
      moveSubtree(child, parentDom, anchor)
    }
  }
}

function moveSubtree(fiber, parentDom, anchor) {
  if (fiber.dom) {
    if (anchor) parentDom.insertBefore(fiber.dom, anchor)
    else parentDom.appendChild(fiber.dom)
    return
  }
  for (let child = fiber.child; child; child = child.sibling) {
    moveSubtree(child, parentDom, anchor)
  }
}

function hostParentDom(fiber) {
  let node = fiber.parent
  while (node && !node.dom) node = node.parent
  return node ? node.dom : null
}

/**
 * Find the DOM node this fiber should be inserted *before*.
 *
 * We can't count positions, because function components and fragments produce no DOM node —
 * a fiber's next DOM neighbour may live several levels down inside a sibling, or several
 * levels up. So we walk forward looking for the next fiber that owns a DOM node AND is
 * already sitting in the right place. Anything being inserted or moved this pass is not a
 * reliable anchor, so we skip it. Finding nothing means "you go last" — append.
 */
function hostSibling(fiber) {
  let node = fiber

  outer: while (true) {
    while (!node.sibling) {
      // A parent that owns a DOM node means we've left our own element.
      if (!node.parent || node.parent.dom) return null
      node = node.parent
    }
    node = node.sibling

    while (!node.dom) {
      if (node.flags === PLACEMENT || node.moved) continue outer
      if (!node.child) continue outer
      node = node.child
    }

    if (node.flags !== PLACEMENT && !node.moved) return node.dom
  }
}

/**
 * Remove a fiber and everything under it. Two things must happen, in this order: every
 * effect cleanup in the subtree runs, and the topmost DOM nodes are detached. We only need
 * to remove the *top* nodes — their descendants go with them — but we still walk the whole
 * subtree, because cleanups live on fibers that may own no DOM node.
 */
function commitDeletion(fiber) {
  destroy(fiber, hostParentDom(fiber), false)
}

function destroy(fiber, parentDom, detached) {
  // Flag both twins so a setState closure that outlives the component can tell it's gone.
  fiber.unmounted = true
  if (fiber.alternate) fiber.alternate.unmounted = true

  if (fiber.hooks) {
    for (const hook of fiber.hooks) {
      if (hook.tag === 'effect' && typeof hook.cleanup === 'function') {
        try {
          hook.cleanup()
        } catch (error) {
          console.error('[danio] effect cleanup threw during unmount', error)
        }
      }
    }
  }

  if (fiber.ref) attachRef(fiber.ref, null)

  if (fiber.dom && !detached) {
    if (parentDom && fiber.dom.parentNode === parentDom) parentDom.removeChild(fiber.dom)
    detached = true
  }

  for (let child = fiber.child; child; child = child.sibling) {
    destroy(child, parentDom, detached)
  }
}

function attachRef(ref, value) {
  if (typeof ref === 'function') ref(value)
  else if (ref && typeof ref === 'object') ref.current = value
}

function flushEffects(effects) {
  // All cleanups first, then all setups — so an effect that grabs a resource never runs
  // before the previous effect has released it.
  for (const hook of effects) {
    if (typeof hook.cleanup === 'function') {
      try {
        hook.cleanup()
      } catch (error) {
        console.error('[danio] effect cleanup threw', error)
      }
    }
    hook.cleanup = null
  }

  for (const hook of effects) {
    try {
      const cleanup = hook.create()
      hook.cleanup = typeof cleanup === 'function' ? cleanup : null
    } catch (error) {
      handleEffectError(hook.fiber, error)
    }
  }
}
