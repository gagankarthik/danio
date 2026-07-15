/**
 * memo() — opt a component out of re-rendering when its props are equal.
 *
 * Bailouts compare props by *identity*, which handles the case where an ancestor didn't
 * re-render. It cannot handle the case where an ancestor DID re-render: a parent that runs
 * again builds fresh element objects, so its children get brand-new props objects that are
 * equal in value but different in identity, and they all re-render with it.
 *
 * That's the cascade `memo` stops. Wrap a component and the reconciler compares its props
 * by value instead:
 *
 *   const Row = memo(function Row({ label }) { ... })
 *
 * Two things worth knowing before you reach for it:
 *
 * - It is not free. Every render of the parent now costs a shallow compare. On a cheap
 *   component that's a worse trade than just re-rendering it. Memo the expensive ones and
 *   the ones at the top of long lists.
 * - It is defeated by unstable props. `<Row onPick={() => ...}>` creates a new function
 *   every render, so the shallow compare always fails and memo does nothing. Same for
 *   inline objects and arrays. Pair it with `useCallback` / `useMemo`, or it's dead weight.
 */

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  return keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]))
}

export function memo(Component, areEqual = shallowEqual) {
  // A plain function wrapper, not a special element type: the hooks inside `Component` run
  // against this fiber exactly as they would have anyway, so memo composes with everything.
  function Memo(props) {
    return Component(props)
  }

  Memo.__compare = areEqual
  Memo.displayName = `memo(${Component.displayName || Component.name || 'Component'})`
  return Memo
}
