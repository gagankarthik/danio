/**
 * Phase 2 — The DOM layer.
 *
 * This is the ONLY file in Danio that talks to the browser. Everything above it works
 * on plain objects. That boundary is what would let us swap in a canvas or native
 * renderer later without touching the reconciler.
 */

import { TEXT_ELEMENT } from './element.js'
import { runtime } from './current.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function createDom(fiber) {
  const dom =
    fiber.type === TEXT_ELEMENT
      ? document.createTextNode('')
      : fiber.svg
        ? document.createElementNS(SVG_NS, fiber.type)
        : document.createElement(fiber.type)

  // Text nodes go through the same path — their content is just the `nodeValue` prop.
  updateDom(dom, {}, fiber.props)
  return dom
}

/**
 * Reconcile the props of one DOM node. We walk the old props to find what was
 * removed, then the new props to find what was added or changed.
 */
export function updateDom(dom, prevProps, nextProps) {
  const isSvg = dom.namespaceURI === SVG_NS

  for (const name in prevProps) {
    if (name in nextProps) continue
    setProp(dom, name, undefined, prevProps[name], isSvg)
  }

  for (const name in nextProps) {
    const next = nextProps[name]
    const prev = prevProps[name]
    if (next === prev) continue
    setProp(dom, name, next, prev, isSvg)
  }
}

function setProp(dom, name, next, prev, isSvg) {
  if (name === 'children' || name === 'key' || name === 'ref') return

  if (name === 'nodeValue') {
    dom.nodeValue = next == null ? '' : String(next)
    return
  }

  if (name[0] === 'o' && name[1] === 'n' && name.length > 2) {
    setEvent(dom, name, next)
    return
  }

  if (name === 'style') {
    setStyle(dom, next, prev)
    return
  }

  if (name === 'dangerouslySetInnerHTML') {
    dom.innerHTML = next && next.__html != null ? next.__html : ''
    return
  }

  // Prefer the IDL property when the element actually has one — that's what makes
  // `value`, `checked`, and `selected` behave correctly on form controls, where the
  // attribute only sets the *default* and would silently ignore later updates.
  // SVG elements are attribute-only, and `list`/`form` are attribute-only even on HTML.
  if (!isSvg && name in dom && name !== 'list' && name !== 'form') {
    try {
      dom[name] = next == null ? '' : next
      return
    } catch {
      // Read-only property — fall through to setAttribute.
    }
  }

  const attr = name === 'className' ? 'class' : name
  if (next == null || next === false) dom.removeAttribute(attr)
  else dom.setAttribute(attr, next === true ? '' : String(next))
}

function setStyle(dom, next, prev) {
  if (typeof next === 'string') {
    dom.style.cssText = next
    return
  }

  if (typeof prev === 'string') dom.style.cssText = ''
  else {
    for (const key in prev) {
      if (!next || !(key in next)) dom.style.setProperty(toCssName(key), '')
    }
  }

  for (const key in next) {
    const value = next[key]
    if (prev && typeof prev !== 'string' && prev[key] === value) continue
    if (value == null || value === false) {
      dom.style.setProperty(toCssName(key), '')
    } else if (typeof value === 'number' && !UNITLESS.has(key)) {
      dom.style.setProperty(toCssName(key), `${value}px`)
    } else {
      dom.style.setProperty(toCssName(key), String(value))
    }
  }
}

// `backgroundColor` -> `background-color`, `--brand` passes through untouched.
const toCssName = (key) =>
  key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

const UNITLESS = new Set([
  'opacity', 'zIndex', 'flex', 'flexGrow', 'flexShrink', 'order', 'fontWeight',
  'lineHeight', 'zoom', 'gridRow', 'gridColumn', 'columnCount', 'fillOpacity',
  'strokeOpacity',
])

/**
 * Events go through a single proxy listener per node rather than being added and
 * removed on every render. Handlers are almost always fresh closures each render
 * (`onClick={() => setN(n + 1)}`), so binding them directly would mean a
 * remove+add pair on every keystroke. Instead the listener stays put and we just
 * swap the function it looks up.
 */
function setEvent(dom, name, handler) {
  const capture = name.endsWith('Capture')
  const type = (capture ? name.slice(2, -7) : name.slice(2)).toLowerCase()
  const key = capture ? `${type}:capture` : type

  const events = dom.__danioEvents || (dom.__danioEvents = {})

  if (typeof handler === 'function') {
    if (!events[key]) dom.addEventListener(type, eventProxy, capture)
    events[key] = handler
  } else if (events[key]) {
    dom.removeEventListener(type, eventProxy, capture)
    delete events[key]
  }
}

function eventProxy(event) {
  const events = this.__danioEvents
  const capturing = event.eventPhase === Event.CAPTURING_PHASE
  const handler = events[capturing ? `${event.type}:capture` : event.type]
  if (!handler) return

  handler(event)

  // Render now, before the next event can fire. Everything the handler queued lands in
  // one render (so updates still batch), but the *next* handler is guaranteed to see
  // fresh state. Without this, two fast clicks both read the same stale value and one
  // of the two updates is silently lost. See flushSync() in the reconciler.
  runtime.flushSync()
}
