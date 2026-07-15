/**
 * Phase 8 — Connecting the store to components.
 *
 * The store knows nothing about Danio and Danio knows nothing about the store. This file
 * is the entire bridge: put the store on the context, and let components subscribe.
 */

import { createContext, useContext } from '../core/context.js'
import { useEffect, useReducer, useRef } from '../core/hooks.js'
import { jsx } from '../core/element.js'
import { shallowEqual } from '../core/memo.js'

const StoreContext = createContext(null)

export function StoreProvider(props) {
  return jsx(StoreContext.Provider, { value: props.store, children: props.children })
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) {
    throw new Error('[danio] No store found. Wrap your app in <StoreProvider store={store}>.')
  }
  return store
}

export function useDispatch() {
  return useStore().dispatch
}

/**
 * Read a slice of the store, and re-render when *that slice* changes.
 *
 * The equality check is the whole point. Without it, every component that touched the
 * store would re-render on every action in the app. With it, a component selecting
 * `state.todos` ignores an action that only changes `state.filter`.
 *
 * Default equality is `Object.is`, so a selector must return something stable — return
 * `state.todos` (same array identity when unchanged), not `state.todos.map(...)`, which
 * builds a fresh array every call and so never compares equal. For derived data, pass
 * a custom `equalityFn` such as `shallowEqual`.
 */
export function useSelector(selector, equalityFn = Object.is) {
  const store = useStore()
  const [, forceRender] = useReducer((n) => n + 1, 0)

  const selected = selector(store.getState())

  // The subscription is set up once, but must always call the *latest* selector — the
  // one from the most recent render, closing over the most recent props. Refs let the
  // long-lived callback reach forward to it.
  const selectorRef = useRef(selector)
  const selectedRef = useRef(selected)
  const equalityRef = useRef(equalityFn)
  selectorRef.current = selector
  selectedRef.current = selected
  equalityRef.current = equalityFn

  useEffect(
    () =>
      store.subscribe(() => {
        const next = selectorRef.current(store.getState())
        if (equalityRef.current(selectedRef.current, next)) return
        selectedRef.current = next
        forceRender()
      }),
    [store],
  )

  return selected
}

// Re-exported for selectors that build a new object or array every call:
//   useSelector((s) => ({ a: s.a, b: s.b }), shallowEqual)
export { shallowEqual }
