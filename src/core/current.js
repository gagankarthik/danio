/**
 * Shared mutable state: "which fiber is rendering right now, and which hook are we on".
 *
 * This tiny module exists to break a circular import. The reconciler needs to call the
 * hooks machinery (to reset the hook index before running a component), and the hooks
 * need to call back into the reconciler (to schedule a re-render when you setState).
 * Both import from here instead of from each other.
 *
 * It is also the whole secret behind hooks: `useState` has no idea which component
 * called it. It just reads `current.fiber` and `current.hookIndex++`. That's why hooks
 * must be called in the same order every render, and why they can't live inside an `if`.
 */
export const current = {
  fiber: null,
  hookIndex: 0,
}

/**
 * The reconciler fills these in at module load, so hooks and the DOM layer can reach it
 * without importing it (which would be circular).
 */
export const runtime = {
  markDirty: null,
  flushSync: null,
}
