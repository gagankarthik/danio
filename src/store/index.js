/**
 * Phase 7 — The store.
 *
 * Straight out of the Zapier article: the whole thing is about 60 lines, because Redux's
 * value is the *constraint*, not the code. State is one object. The only way to change
 * it is to dispatch an action. The only thing that computes the next state is a pure
 * reducer, `(state, action) => newState`. Everything else — devtools, undo, time travel,
 * replaying a bug from a log — is a free consequence of that discipline.
 *
 * Note this file imports nothing. The store has no idea Danio exists; it's plain
 * JavaScript, and it would work just as well in a Node script. The glue that connects
 * it to components lives in ./bindings.js.
 */

export const INIT = '@@danio/INIT'
export const REPLACE = '@@danio/REPLACE'

export function createStore(reducer, preloadedState, enhancer) {
  // createStore(reducer, applyMiddleware(...)) — the state argument is optional.
  if (typeof preloadedState === 'function' && enhancer === undefined) {
    enhancer = preloadedState
    preloadedState = undefined
  }

  if (typeof enhancer === 'function') {
    return enhancer(createStore)(reducer, preloadedState)
  }

  let state = preloadedState
  let listeners = []
  let dispatching = false

  function getState() {
    return state
  }

  function subscribe(listener) {
    listeners.push(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      listeners.splice(listeners.indexOf(listener), 1)
    }
  }

  function dispatch(action) {
    if (!action || typeof action.type === 'undefined') {
      throw new Error('[danio] Actions must be objects with a `type`. Did you mean to use the thunk middleware?')
    }
    // A reducer that dispatches would recurse forever and make the state machine
    // impossible to reason about. Side effects belong in middleware.
    if (dispatching) {
      throw new Error('[danio] Reducers may not dispatch actions.')
    }

    try {
      dispatching = true
      state = reducer(state, action)
    } finally {
      dispatching = false
    }

    // Copy first: a listener is allowed to unsubscribe itself, which would otherwise
    // mutate the array we're iterating and silently skip the next listener.
    for (const listener of listeners.slice()) listener()
    return action
  }

  function replaceReducer(next) {
    reducer = next
    dispatch({ type: REPLACE })
  }

  // Prime the store: every reducer's `state = initialState` default fires here.
  dispatch({ type: INIT })

  return { getState, dispatch, subscribe, replaceReducer }
}

/**
 * Turn `{ todos: todosReducer, filter: filterReducer }` into one reducer that owns
 * `{ todos, filter }`. Each slice reducer only ever sees its own slice.
 */
export function combineReducers(reducers) {
  const keys = Object.keys(reducers)

  return function combined(state = {}, action) {
    let changed = false
    const next = {}

    for (const key of keys) {
      const previous = state[key]
      const result = reducers[key](previous, action)

      if (result === undefined) {
        throw new Error(`[danio] Reducer "${key}" returned undefined. Return the state unchanged instead.`)
      }

      next[key] = result
      if (result !== previous) changed = true
    }

    // Returning the identical object when nothing changed is what lets `useSelector`
    // and memoisation short-circuit with a cheap `===`.
    return changed || keys.length !== Object.keys(state).length ? next : state
  }
}

/**
 * Middleware sits between `dispatch` and the reducer, so it can log, delay, or swallow
 * an action — or dispatch others first. Each one has the shape
 *
 *   (store) => (next) => (action) => next(action)
 *
 * and we compose them into a chain by wrapping from the inside out: the last middleware
 * wraps the real `dispatch`, the one before it wraps that, and so on. `store.dispatch`
 * ends up being the outermost link.
 */
export function applyMiddleware(...middlewares) {
  return (createStoreFn) => (reducer, preloadedState) => {
    const store = createStoreFn(reducer, preloadedState)

    let dispatch = () => {
      throw new Error('[danio] Cannot dispatch while constructing middleware.')
    }

    // Middleware gets `dispatch` through this indirection so that a middleware which
    // dispatches during setup goes through the *whole* chain, not just the raw store.
    const api = {
      getState: store.getState,
      dispatch: (action) => dispatch(action),
    }

    const chain = middlewares.map((middleware) => middleware(api))
    dispatch = chain.reduceRight((next, middleware) => middleware(next), store.dispatch)

    return { ...store, dispatch }
  }
}
