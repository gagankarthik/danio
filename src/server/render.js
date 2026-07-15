/**
 * Server-side rendering — turning an element tree into an HTML string.
 *
 * This is the half of SSR that has no DOM: it walks the same element tree the browser
 * would, runs your components (so `useState` initial values, `useMemo`, and `useContext`
 * all resolve), and emits HTML text. It touches `document` nowhere, so it runs in plain
 * Node with nothing mocked.
 *
 * Two things deliberately do NOT happen here, because they can't on a server:
 *   - Effects never run. `useEffect` / `useLayoutEffect` are collected and dropped — a
 *     server has no paint to run after and no cleanup to schedule.
 *   - State never changes. There is one render, so `setState` is a no-op; whatever the
 *     first render produces is the HTML.
 *
 * The output is designed to be adopted by `hydrate()` on the client: same element order,
 * same text, so the browser can attach event listeners to the existing nodes instead of
 * throwing them away and rebuilding. See `hydrate` in core/reconciler.js.
 */

import { Fragment, TEXT_ELEMENT, normalizeChildren } from '../core/element.js'
import { current } from '../core/current.js'

// Elements that never have a closing tag.
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

const escText = (s) =>
  String(s).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))

const escAttr = (s) => String(s).replace(/[&"]/g, (c) => (c === '&' ? '&amp;' : '&quot;'))

// Mirror the DOM layer's unit handling so an inline `style` object serialises the same way
// server-side as it would be applied client-side (`{ width: 10 }` -> `width:10px`).
const UNITLESS = new Set([
  'opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'fontWeight',
  'lineHeight', 'zoom', 'gridRow', 'gridColumn', 'columnCount', 'fillOpacity',
  'strokeOpacity',
])

const toCssName = (key) =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

function styleToString(style) {
  if (style == null) return ''
  if (typeof style === 'string') return style

  let out = ''
  for (const key in style) {
    const value = style[key]
    if (value == null || value === false) continue
    const printed =
      typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value)
    out += `${toCssName(key)}:${printed};`
  }
  return out
}

/**
 * A minimal stand-in for a fiber, just enough for the hooks machinery to run. Hooks read
 * `current.fiber`, mount their slot on `fiber.hooks`, and push effects onto
 * `fiber.root.effects` — none of which needs a real reconciler fiber on the server.
 */
function makeFiber(type, props, parent, root) {
  return { type, props, parent, hooks: [], alternate: null, deps: null, root, unmounted: false }
}

/**
 * Render an element tree to an HTML string.
 *
 *   import { renderToString } from 'danio/server'
 *   const html = renderToString(<App />)
 *
 * Feed the result into a page shell and send it to the browser; call `hydrate(<App />, el)`
 * on the client to make it interactive.
 */
export function renderToString(element) {
  const root = { effects: [], layoutEffects: [] }
  return renderNode(element, null, root, false)
}

/**
 * The same output. The name mirrors React's pairing; Danio does not add framework-specific
 * hydration comments to either, so today they are identical. Prefer `renderToString` unless
 * you specifically want to signal "this HTML will never be hydrated".
 */
export function renderToStaticMarkup(element) {
  const root = { effects: [], layoutEffects: [] }
  return renderNode(element, null, root, false)
}

function renderNode(element, parentFiber, root, svg) {
  if (element == null || typeof element === 'boolean') return ''

  const type = element.type

  if (type === TEXT_ELEMENT) return escText(element.props.nodeValue)

  if (type === Fragment) return renderChildren(element.props.children, parentFiber, root, svg)

  if (typeof type === 'function') {
    // An ErrorBoundary has no error server-side (nothing has thrown yet), so it is just a
    // pass-through to its children — matching what the client shows before any failure.
    if (type.__errorBoundary) {
      return renderChildren(element.props.children, parentFiber, root, svg)
    }

    const fiber = makeFiber(type, element.props, parentFiber, root)

    const prevFiber = current.fiber
    const prevIndex = current.hookIndex
    current.fiber = fiber
    current.hookIndex = 0
    let raw
    try {
      raw = type(element.props)
    } finally {
      current.fiber = prevFiber
      current.hookIndex = prevIndex
    }

    // The fiber becomes the parent of what it returned, so a `useContext` deeper down can
    // walk up to a Provider that sits in this component's output.
    return renderChildren(normalizeChildren(raw), fiber, root, svg)
  }

  return renderHost(element, parentFiber, root, svg)
}

function renderChildren(children, parentFiber, root, svg) {
  let out = ''
  for (const child of children) out += renderNode(child, parentFiber, root, svg)
  return out
}

function renderHost(element, parentFiber, root, svg) {
  const { type, props } = element
  const childSvg = type === 'svg' ? true : type === 'foreignObject' ? false : svg

  let attrs = ''
  let innerHTML = null

  for (const name in props) {
    if (name === 'children' || name === 'key' || name === 'ref') continue

    const value = props[name]

    // Event handlers don't exist in HTML text — they're attached on the client at hydration.
    if (name[0] === 'o' && name[1] === 'n' && name.length > 2) continue

    if (name === 'dangerouslySetInnerHTML') {
      innerHTML = value && value.__html != null ? String(value.__html) : ''
      continue
    }

    if (name === 'style') {
      const style = styleToString(value)
      if (style) attrs += ` style="${escAttr(style)}"`
      continue
    }

    if (value == null || value === false) continue

    const attrName = name === 'className' ? 'class' : name === 'htmlFor' ? 'for' : name

    if (value === true) attrs += ` ${attrName}`
    else attrs += ` ${attrName}="${escAttr(value)}"`
  }

  if (VOID.has(type)) return `<${type}${attrs}/>`

  const inner =
    innerHTML != null ? innerHTML : renderChildren(props.children, parentFiber, root, childSvg)

  return `<${type}${attrs}>${inner}</${type}>`
}
