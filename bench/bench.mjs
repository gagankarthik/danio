/**
 * Measures the cost of an update, which is the number that decides whether Danio can carry
 * a real app.
 *
 * The scenario that matters is not "mount a big tree" (you pay that once). It's: an app is
 * on screen, and one leaf component deep inside it calls setState — a keystroke in a search
 * box, a hover, a checkbox. How much work does the framework do?
 *
 * We count component invocations, because that is the thing that scales badly. Wall-clock
 * is reported too, but it's noisy; the invocation count is the honest signal.
 *
 * Run: node bench/bench.mjs
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
})
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.Event = dom.window.Event

// flushSync renders synchronously, so we time the framework rather than our own setTimeout.
const { h, render, useState, flushSync } = await import('../src/index.js')

const flush = () => new Promise((resolve) => setTimeout(resolve, 40))

// ---------------------------------------------------------------------------
// A tree shaped like a real app: a list of rows, each row a component with a few
// children. ROWS x (1 Row + 3 Cells) components, plus host nodes underneath.
// ---------------------------------------------------------------------------
const ROWS = 500

let invocations = 0
let bumpLeaf = null

function Cell({ text }) {
  invocations++
  return h('span', { className: 'cell' }, text)
}

function Row({ index }) {
  invocations++
  return h(
    'li',
    { className: 'row' },
    h(Cell, { text: `a${index}` }),
    h(Cell, { text: `b${index}` }),
    h(Cell, { text: `c${index}` }),
  )
}

/** One leaf, deep in the tree, that owns some state. This is our "search box". */
function Leaf() {
  invocations++
  const [n, setN] = useState(0)
  bumpLeaf = () => setN((v) => v + 1)
  return h('span', { id: 'leaf' }, String(n))
}

function App() {
  invocations++
  return h(
    'div',
    null,
    h(Leaf),
    h('ul', null, ...Array.from({ length: ROWS }, (_, i) => h(Row, { key: i, index: i }))),
  )
}

const container = document.getElementById('root')

// ---------------------------------------------------------------------------
const componentsInTree = 1 + 1 + ROWS * 4 // App + Leaf + (Row + 3 Cells) per row

invocations = 0
let start = performance.now()
render(h(App), container)
await flush()
const mountMs = performance.now() - start
const mountCalls = invocations

// The measurement that matters: setState in ONE leaf component.
const SAMPLES = 50
invocations = 0
start = performance.now()
for (let i = 0; i < SAMPLES; i++) {
  bumpLeaf()
  flushSync()
}
const updateMs = (performance.now() - start) / SAMPLES
const updateCalls = invocations / SAMPLES
await flush()

// The control: force the whole tree to re-render by calling render() again with a fresh
// element. This is precisely what EVERY update cost before bailouts existed, so it's the
// honest "before" number to compare against.
invocations = 0
start = performance.now()
for (let i = 0; i < 10; i++) {
  render(h(App), container)
  flushSync()
}
const fullMs = (performance.now() - start) / 10
const fullCalls = invocations / 10
await flush()

const nodes = container.querySelectorAll('*').length
const leafValue = container.querySelector('#leaf').textContent

const speedup = (fullMs / updateMs).toFixed(0)

console.log(`
tree                    ${ROWS} rows, ${componentsInTree} components, ${nodes} DOM nodes
mount                   ${mountCalls} component calls, ${mountMs.toFixed(1)}ms

BEFORE (no bailouts)
full re-render          ${fullCalls} component calls, ${fullMs.toFixed(2)}ms
                        Every setState used to cost this, because the whole tree re-ran.

AFTER (with bailouts)
setState in ONE leaf    ${updateCalls} component call${updateCalls === 1 ? '' : 's'}, ${updateMs.toFixed(3)}ms
                        Only the component that actually changed runs. ~${speedup}x faster.

sanity                  leaf rendered "${leafValue}" after ${SAMPLES} updates ${
  leafValue === String(SAMPLES) ? '(correct)' : '(WRONG)'
}
`)
