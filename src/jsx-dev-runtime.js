// Dev builds call `jsxDEV(type, props, key, isStaticChildren, source, self)`. We use the
// fourth argument — it's exactly the static-vs-dynamic children distinction the missing-key
// warning needs. The rest is debug metadata we don't use yet.
import { jsx, jsxs } from './core/element.js'

export { Fragment } from './core/element.js'

export function jsxDEV(type, props, key, isStaticChildren) {
  return isStaticChildren ? jsxs(type, props, key) : jsx(type, props, key)
}
