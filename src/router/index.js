/**
 * Phase 9 — The router.
 *
 * A router is less magic than it looks. It is: (1) a piece of state that holds the
 * current URL, (2) a way to change that state without the browser doing a full page
 * load, and (3) a component that picks which children to render based on it.
 *
 * The History API gives us (2): `history.pushState` changes the address bar and adds a
 * back-button entry without navigating. The catch is that it fires no event — so we
 * dispatch our own, and listen for `popstate` to catch the back button.
 */

import { createContext, useContext } from '../core/context.js'
import { useEffect, useMemo, useState } from '../core/hooks.js'
import { jsx, normalizeChildren } from '../core/element.js'

const NAVIGATE_EVENT = 'danio:navigate'

const RouterContext = createContext(null)
const RouteContext = createContext({ params: {} })

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

function readLocation() {
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
  }
}

/**
 * Change the URL. Callable from anywhere — including outside a component, which is what
 * makes it usable from a store thunk after a login succeeds, say.
 */
export function navigate(to, options = {}) {
  if (options.replace) window.history.replaceState({}, '', to)
  else window.history.pushState({}, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
}

/* ------------------------------------------------------------------ *
 * Path matching
 * ------------------------------------------------------------------ */

/**
 * Turn a pattern into a matcher. Supported syntax:
 *
 *   /todos          exact
 *   /todos/:id      captures params.id
 *   /files/*        captures params['*'] as the rest of the path
 *
 * Compiling to a regex once and caching it beats re-splitting strings on every render.
 */
const compiled = new Map()

function compile(pattern) {
  if (compiled.has(pattern)) return compiled.get(pattern)

  const names = []
  const source = pattern
    .replace(/\/+$/, '') // ignore a trailing slash
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1))
        return '/([^/]+)'
      }
      if (segment === '*') {
        names.push('*')
        return '/?(.*)'
      }
      if (segment === '') return ''
      return `/${escapeRegExp(segment)}`
    })
    .join('')

  const matcher = { regex: new RegExp(`^${source || '/'}/?$`), names }
  compiled.set(pattern, matcher)
  return matcher
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function matchPath(pattern, pathname) {
  const { regex, names } = compile(pattern)
  const match = regex.exec(pathname)
  if (!match) return null

  const params = {}
  names.forEach((name, i) => {
    params[name] = decodeURIComponent(match[i + 1] ?? '')
  })
  return { params }
}

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

/** Holds the current location and keeps it in sync with the browser. */
export function Router(props) {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const sync = () => setLocation(readLocation())

    // `popstate` catches the back/forward buttons; our own event catches navigate().
    window.addEventListener('popstate', sync)
    window.addEventListener(NAVIGATE_EVENT, sync)

    // The URL may have changed between the first render and this effect running.
    sync()

    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(NAVIGATE_EVENT, sync)
    }
  }, [])

  const value = useMemo(() => ({ location, navigate }), [location])

  return jsx(RouterContext.Provider, { value, children: props.children })
}

/**
 * Render the first `<Route>` child whose path matches. First-match-wins is why a
 * catch-all `<Route path="*">` belongs last.
 */
export function Routes(props) {
  const { location } = useRouter()
  const routes = normalizeChildren(props.children)

  for (const route of routes) {
    if (route.type !== Route) continue

    const { path = '*', component, element, children } = route.props
    const match = matchPath(path, location.pathname)
    if (!match) continue

    const body = component
      ? jsx(component, { params: match.params })
      : element !== undefined
        ? element
        : children

    return jsx(RouteContext.Provider, { value: { params: match.params }, children: body })
  }

  return null
}

/** A declaration, not a renderer — <Routes> reads its props and decides. */
export function Route() {
  return null
}

/**
 * An <a> that navigates without reloading the page.
 *
 * We keep the real `href` so the link is a real link: hover shows the URL, and
 * middle-click, ctrl-click and "open in new tab" all still work — which is exactly why
 * we bail out of `preventDefault` when a modifier key is held.
 */
export function Link(props) {
  const { to, replace, onClick, children, ...rest } = props
  const { location } = useRouter()
  const active = location.pathname === to

  const handleClick = (event) => {
    if (onClick) onClick(event)
    if (event.defaultPrevented) return
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (rest.target && rest.target !== '_self') return

    event.preventDefault()
    navigate(to, { replace })
  }

  return jsx('a', {
    ...rest,
    href: to,
    'aria-current': active ? 'page' : undefined,
    'data-active': active ? '' : undefined,
    onClick: handleClick,
    children,
  })
}

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

function useRouter() {
  const router = useContext(RouterContext)
  if (!router) {
    throw new Error('[danio] Router hooks must be used inside a <Router>.')
  }
  return router
}

export function useLocation() {
  return useRouter().location
}

export function useNavigate() {
  return navigate
}

/** The `:id` captures from the matched route. */
export function useParams() {
  return useContext(RouteContext).params
}

/** The query string as a plain object: `?q=cat&page=2` -> `{ q: 'cat', page: '2' }`. */
export function useSearchParams() {
  const { search } = useLocation()
  return useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search])
}
