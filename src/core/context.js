/**
 * Context.
 *
 * A Provider is just a component that renders its children. The value doesn't travel
 * anywhere: `useContext` walks *up* the fiber's parent chain until it finds a Provider of
 * the right context, and reads the `value` prop sitting on it.
 *
 * Reading is the easy half. The hard half is *invalidation*, and it is entirely a
 * consequence of bailouts. A component that consumes a context typically has unchanged
 * props of its own — which is precisely the condition under which the reconciler would skip
 * it. So a new context value would never reach it.
 *
 * The fix is a subscription, and `useContext` registers it: every component that reads a
 * context records that dependency on its fiber (`fiber.deps`). When a Provider's value
 * changes, the reconciler walks its committed subtree, finds the fibers holding that
 * dependency, and marks them dirty by hand — so they re-render even though nothing about
 * their own props changed. See `propagateContextChange` in reconciler.js.
 */

import { current } from './current.js'

export function createContext(defaultValue) {
  const context = { defaultValue }

  function Provider(props) {
    return props.children
  }
  Provider.__context = context
  Provider.displayName = 'Context.Provider'

  function Consumer(props) {
    return props.children(useContext(context))
  }
  Consumer.displayName = 'Context.Consumer'

  context.Provider = Provider
  context.Consumer = Consumer
  return context
}

export function useContext(context) {
  const fiber = current.fiber

  if (!fiber) {
    throw new Error('[danio] useContext can only be called inside a component function.')
  }

  // Record the dependency so a future value change can find us even if we would otherwise
  // bail out. Rebuilt from scratch on every render, so a component that stops reading a
  // context stops being woken by it.
  ;(fiber.deps || (fiber.deps = new Set())).add(context)

  let node = fiber
  while (node) {
    if (typeof node.type === 'function' && node.type.__context === context) {
      return node.props.value
    }
    node = node.parent
  }

  return context.defaultValue
}
