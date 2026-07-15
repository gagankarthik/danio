/**
 * Danio server entry — `import { renderToString } from 'danio/server'`.
 *
 * Kept separate from the main entry so it can run in plain Node: it pulls in only the
 * element and hook machinery, never the DOM layer, the router, or anything that reaches for
 * `window`. Pair it with `hydrate()` (from the main entry) on the client.
 */
export { renderToString, renderToStaticMarkup } from './render.js'
