/**
 * Hooks.
 *
 * A hook is a slot in an array hanging off the fiber. `current.hookIndex` counts up as you
 * call them, so the Nth `useState` in a component always reads the Nth slot. That is the
 * entire mechanism — and it is exactly why the rules of hooks exist. Put a `useState`
 * behind an `if` and the indexes shift between renders, so on the next pass slot 1 hands
 * you slot 0's state.
 *
 * We reuse the *same* hook object across renders rather than copying it. That keeps
 * `dispatch` stable (same identity every render, so it's safe in a dep array), means an
 * interrupted render doesn't lose state, and — since a bailed-out component doesn't re-run
 * its hooks at all — gives the hook a stable home to live in while its component is skipped.
 */

import { current, runtime } from './current.js'
import { DEV, warn, nameOf } from './dev.js'

function mountHook(tag, create) {
  const fiber = current.fiber

  if (!fiber) {
    throw new Error(
      '[danio] Hooks can only be called inside a component function. You may be calling one ' +
        'from an event handler, a class, or top-level module code.',
    )
  }

  const previous = fiber.alternate ? fiber.alternate.hooks : null
  const existing = previous && previous[current.hookIndex]

  // The slot we're about to reuse held a different kind of hook last render. That means the
  // call order changed, and every hook from here on is reading someone else's state.
  if (DEV && existing && existing.tag !== tag) {
    warn(
      `${nameOf(fiber.type)} called ${tag} where it called ${existing.tag} on the previous ` +
        'render. Hooks are matched by call order, so a hook inside an if/loop/early-return ' +
        'shifts every later hook onto the wrong slot. Move the condition inside the hook.',
    )
  }

  const hook = existing || create()

  // Re-point the hook at the fiber currently rendering. A setState closure can outlive many
  // renders; when it eventually fires it needs to dirty a fiber that is still in the tree,
  // not the one that existed when it was created.
  hook.fiber = fiber

  fiber.hooks.push(hook)
  current.hookIndex++
  return hook
}

function depsEqual(previous, next) {
  // No dep array at all means "no opinion" — re-run every time.
  if (!previous || !next) return false
  if (previous.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (!Object.is(previous[i], next[i])) return false
  }
  return true
}

/* ------------------------------------------------------------------ */

export function useReducer(reducer, initialArg, init) {
  const hook = mountHook('state', () => {
    const state = {
      tag: 'state',
      state: init ? init(initialArg) : initialArg,
      queue: [],
      fiber: null,
      dispatch: null,
    }

    state.dispatch = (action) => {
      const fiber = state.fiber

      // The component is gone — usually an async callback (a fetch, a timer, a subscription)
      // that resolved after the user navigated away. Re-rendering a detached fiber does
      // nothing, but the leak that caused it is worth knowing about.
      if (fiber.unmounted && (!fiber.alternate || fiber.alternate.unmounted)) {
        if (DEV) {
          warn(
            `setState was called on ${nameOf(fiber.type)} after it unmounted, so it was ` +
              'ignored. Something async is still holding a reference to it — cancel it in ' +
              'the cleanup function your effect returns.',
          )
        }
        return
      }

      state.queue.push(action)
      runtime.markDirty(fiber)
    }

    return state
  })

  // Apply everything dispatched since the last render. We drain with the reducer from
  // *this* render, so a reducer closing over fresh props sees them.
  if (hook.queue.length) {
    for (const action of hook.queue) hook.state = reducer(hook.state, action)
    hook.queue.length = 0
  }

  return [hook.state, hook.dispatch]
}

const basicReducer = (state, action) => (typeof action === 'function' ? action(state) : action)

export function useState(initial) {
  // `useState(() => expensive())` calls the initialiser lazily, only on mount.
  return useReducer(basicReducer, initial, typeof initial === 'function' ? (fn) => fn() : undefined)
}

/* ------------------------------------------------------------------ */

function pushEffect(kind, create, deps) {
  const fiber = current.fiber
  const hook = mountHook('effect', () => ({
    tag: 'effect',
    create: null,
    cleanup: null,
    deps: undefined,
    mounted: false,
    fiber: null,
  }))

  const changed = !hook.mounted || !depsEqual(hook.deps, deps)

  hook.deps = deps
  hook.mounted = true

  if (changed) {
    hook.create = create
    const queue = kind === 'layout' ? fiber.root.layoutEffects : fiber.root.effects
    queue.push(hook)
  }
}

/** Runs after the DOM is committed. Return a function to clean up. */
export function useEffect(create, deps) {
  pushEffect('passive', create, deps)
}

/** Same, but runs before the browser paints — use it to measure or correct layout. */
export function useLayoutEffect(create, deps) {
  pushEffect('layout', create, deps)
}

/* ------------------------------------------------------------------ */

export function useMemo(factory, deps) {
  const hook = mountHook('memo', () => ({
    tag: 'memo',
    value: undefined,
    deps: undefined,
    computed: false,
    fiber: null,
  }))

  if (!hook.computed || !depsEqual(hook.deps, deps)) {
    hook.value = factory()
    hook.deps = deps
    hook.computed = true
  }

  return hook.value
}

export function useCallback(fn, deps) {
  return useMemo(() => fn, deps)
}

/** A mutable box that survives re-renders. Changing `.current` does NOT re-render. */
export function useRef(initial) {
  const hook = mountHook('ref', () => ({ tag: 'ref', ref: { current: initial }, fiber: null }))
  return hook.ref
}
