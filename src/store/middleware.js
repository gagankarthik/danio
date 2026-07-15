/**
 * Two middlewares that cover most of what apps actually need.
 */

/**
 * Lets you dispatch a *function* instead of an action object. The function gets
 * `dispatch` and `getState`, so it can do async work and dispatch when it finishes:
 *
 *   const loadTodos = () => async (dispatch) => {
 *     dispatch({ type: 'todos/loading' })
 *     const todos = await fetch('/api/todos').then((r) => r.json())
 *     dispatch({ type: 'todos/loaded', todos })
 *   }
 *
 *   dispatch(loadTodos())
 *
 * This is the standard answer to "reducers must be pure, so where does async go?"
 */
export const thunk = ({ dispatch, getState }) => (next) => (action) => {
  if (typeof action === 'function') return action(dispatch, getState)
  return next(action)
}

/** Prints every action with the state before and after it. */
export const logger = ({ getState }) => (next) => (action) => {
  console.groupCollapsed(`%c${action.type}`, 'color:#6b7280;font-weight:600')
  console.log('%cprev', 'color:#9ca3af', getState())
  console.log('%caction', 'color:#2563eb', action)
  const result = next(action)
  console.log('%cnext', 'color:#16a34a', getState())
  console.groupEnd()
  return result
}
