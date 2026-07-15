/**
 * Elements.
 *
 * A Danio element is a plain object. It is a *description* of UI, not UI itself: nothing
 * here touches the DOM. `<div id="a">hi</div>` becomes
 *
 *   { type: 'div', key: null, ref: null, props: { id: 'a', children: [ <text 'hi'> ] } }
 *
 * `type` is either a string ('div'), a function (a component), or Fragment.
 */

import { DEV, warn } from './dev.js'

export const TEXT_ELEMENT = 'danio.text'
export const Fragment = Symbol.for('danio.fragment')

// One shared empty array for childless elements. This looks like a micro-optimisation and
// isn't: bailouts compare props by identity, and a fresh `children: []` on every render
// would make every childless component look changed, defeating memo entirely.
const NO_CHILDREN = Object.freeze([])

function createTextElement(value) {
  return {
    type: TEXT_ELEMENT,
    key: null,
    ref: null,
    props: { nodeValue: String(value), children: NO_CHILDREN },
  }
}

/**
 * Flatten children into a clean list of elements.
 *
 * Children arrive in every shape JavaScript allows — nested arrays from `.map()`, `null`
 * from a bailed-out conditional, `false` from `cond && <div/>`, bare strings and numbers.
 * The reconciler wants none of that, so we normalise once, here.
 *
 * `dynamic` tracks whether we are inside an array the *program* built (a `.map()`) rather
 * than a list the *compiler* built (several static JSX children). Only the former needs
 * keys, and telling them apart is the difference between a useful warning and a false alarm
 * on every `<div><a/><b/></div>` in the codebase.
 */
export function normalizeChildren(children, staticChildren = false) {
  const out = []

  if (staticChildren && Array.isArray(children)) {
    // The compiler's own list of sibling children. Not a dynamic list; no keys required.
    for (const child of children) collect(out, child, false)
  } else {
    collect(out, children, false)
  }

  return out.length ? out : NO_CHILDREN
}

function collect(out, child, dynamic) {
  if (child === null || child === undefined || typeof child === 'boolean') return

  if (Array.isArray(child)) {
    for (const item of child) collect(out, item, true)
    return
  }

  if (typeof child === 'object' && child.type !== undefined) {
    if (DEV && dynamic && child.key === null) {
      warn(
        'Each child in a list should have a unique "key" prop. Without one, reordering the ' +
          'list rebuilds every row instead of moving it — losing focus, text selection and ' +
          'input state. Use a stable id from your data, not the array index.',
      )
    }
    out.push(child)
    return
  }

  if (DEV && typeof child === 'object') {
    warn(
      `Objects are not valid as a child (got ${Object.prototype.toString.call(child)}). ` +
        'It will render as "[object Object]". Did you mean to render a property of it?',
    )
  }

  out.push(createTextElement(child))
}

function assertValidType(type) {
  if (!DEV) return
  if (typeof type === 'string' || typeof type === 'function' || type === Fragment) return

  throw new Error(
    `[danio] Element type is invalid: expected a string or a component function, but got ` +
      `${type === undefined ? 'undefined' : String(type)}. The usual cause is a bad import — ` +
      `check for a default/named import mix-up, or a component you forgot to export.`,
  )
}

/**
 * The classic React-style factory: `h('div', { id: 'a' }, child1, child2)`.
 * Use this when you want Danio without a build step.
 */
export function createElement(type, config, ...children) {
  assertValidType(type)

  const props = {}
  let key = null
  let ref = null

  for (const name in config) {
    const value = config[name]
    if (name === 'key') key = value == null ? null : String(value)
    else if (name === 'ref') ref = value
    else props[name] = value
  }

  // Explicit arguments are the caller's own static list, so they need no keys — but an
  // array *inside* one of them is a dynamic list, and does.
  props.children = children.length
    ? normalizeChildren(children, true)
    : normalizeChildren(config && config.children)

  return { type, key, ref, props }
}

export const h = createElement

function build(type, config, key, staticChildren) {
  assertValidType(type)

  const props = {}
  let ref = null

  for (const name in config) {
    if (name === 'children' || name === 'key') continue
    if (name === 'ref') ref = config[name]
    else props[name] = config[name]
  }

  props.children = normalizeChildren(config ? config.children : null, staticChildren)

  return { type, key: key == null ? null : String(key), ref, props }
}

/** What the JSX compiler emits for an element with one (or zero) children. */
export function jsx(type, config, key) {
  return build(type, config, key, false)
}

/**
 * What the compiler emits when it can see several children at compile time. The distinction
 * matters for exactly one reason: it tells us the children array was written by the
 * compiler, not by a `.map()`, so it doesn't need keys.
 */
export function jsxs(type, config, key) {
  return build(type, config, key, true)
}
