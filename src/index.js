/**
 * Danio — the public API.
 *
 * Everything an application needs comes from this one import. Nothing below this file
 * depends on anything outside `src/`: no runtime dependencies, at all.
 */

// Elements — describing UI
export { createElement, h, jsx, jsxs, Fragment, normalizeChildren } from './core/element.js'

// Rendering — putting it on screen
export { render, hydrate, unmount, flushSync, ErrorBoundary } from './core/reconciler.js'

// Server-side rendering — turning an element tree into an HTML string. Also available from
// the DOM-free entry `danio/server` for use in plain Node.
export { renderToString, renderToStaticMarkup } from './server/render.js'

// Skipping work — see core/memo.js for when this helps and when it's dead weight
export { memo, shallowEqual } from './core/memo.js'

// Hooks — state and side effects
export {
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  useRef,
} from './core/hooks.js'

// Context — passing values down without prop drilling
export { createContext, useContext } from './core/context.js'

// Store — predictable application state
export { createStore, combineReducers, applyMiddleware } from './store/index.js'
export { thunk, logger } from './store/middleware.js'
export { StoreProvider, useStore, useSelector, useDispatch } from './store/bindings.js'

// Router — mapping the URL to a screen
export {
  Router,
  Routes,
  Route,
  Link,
  navigate,
  matchPath,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from './router/index.js'
