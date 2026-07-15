import type { DanioNode } from './index'

/** Render an element tree to an HTML string. Runs in plain Node — no DOM required. */
export function renderToString(element: DanioNode): string

/** Alias of `renderToString`; signals HTML that will not be hydrated. */
export function renderToStaticMarkup(element: DanioNode): string
