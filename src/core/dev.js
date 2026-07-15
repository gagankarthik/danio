/**
 * Development warnings.
 *
 * Most of what makes a framework pleasant to debug isn't the engine — it's the messages it
 * gives you when you hold it wrong. A duplicate key or a hook inside an `if` produces
 * behaviour that is bizarre and silent, and you can lose an afternoon to either. So we spend
 * a little code telling you.
 *
 * All of this is dead weight in production. A bundler that sets NODE_ENV="production" makes
 * `DEV` a compile-time `false`, and the warning bodies get dropped.
 */

// Resolve the build mode in a way that satisfies every consumer:
//
//   • Bundlers (Vite, webpack, Next, Rollup, esbuild) textually replace `process.env.NODE_ENV`
//     with a string literal. After replacement the line is `mode = "production"` — no `process`
//     reference remains, so `DEV` folds to a constant and the minifier drops every warning body.
//   • Raw source loaded in a browser with no bundler has no `process`, so the read throws; we
//     catch it and default to development, keeping warnings on.
//   • The prebuilt production bundle (vite.lib.config.js) defines NODE_ENV="production", so it
//     ships with DEV=false and zero warning code.
//
// The bare read inside try/catch — not a `typeof process` guard — is what makes all four cases
// work: a guard would leave a runtime `process` reference that browsers evaluate to undefined,
// flipping production builds back into dev mode.
let mode
try {
  mode = process.env.NODE_ENV
} catch {
  mode = undefined
}

export const DEV = mode !== 'production'

// Warnings fire once per distinct message. A warning inside a component would otherwise
// print on every render of every row in a list, and bury itself in its own noise.
const seen = new Set()

export function warn(message) {
  if (!DEV) return
  if (seen.has(message)) return
  seen.add(message)
  console.warn(`[danio] ${message}`)
}

/** Tests only — lets each case observe its own warnings. */
export function resetWarnings() {
  seen.clear()
}

export function nameOf(type) {
  if (typeof type === 'string') return `<${type}>`
  if (typeof type === 'function') return `<${type.displayName || type.name || 'Component'}>`
  return 'component'
}
