/**
 * Phase 3 — The scheduler.
 *
 * Rendering a big tree can take longer than a frame. If we do it all in one synchronous
 * go, the browser cannot paint or respond to input until we finish, and the page visibly
 * janks. So we break the work into small units and ask "do I still have time?" between
 * each one — yielding when we don't.
 *
 * `requestIdleCallback` is built for exactly this, with two catches.
 *
 * 1. "Idle" is a promise the browser may never keep. If the page never goes idle, or the
 *    tab is throttled, a bare idle callback can be deferred indefinitely — so an update
 *    triggered by a timer or a fetch would just sit there, unrendered. The `timeout`
 *    option fixes that: run me when idle, but run me within 50ms regardless.
 *
 * 2. When the callback then fires *because of that timeout*, the browser is telling us it
 *    is NOT idle — and `deadline.timeRemaining()` is 0. A naive "yield if under 1ms left"
 *    check would yield immediately, do no work, reschedule, and get another 0ms budget:
 *    a livelock where the loop spins forever and the UI never updates. So when
 *    `didTimeout` is set we ignore the browser's budget and spend a small fixed slice of
 *    our own, which guarantees forward progress.
 *
 * Safari has never shipped requestIdleCallback, so we fall back to a MessageChannel:
 * posting a message schedules a fresh macrotask, which lets the browser paint and handle
 * input in between, and we budget the slice ourselves.
 */

const FRAME_BUDGET_MS = 5
const IDLE_TIMEOUT_MS = 50

const hasIdleCallback = typeof requestIdleCallback === 'function'

let scheduled = false
let workLoop = null

/** The reconciler registers its work loop here once, at module load. */
export function setWorkLoop(fn) {
  workLoop = fn
}

/** Ask for a slice of time. Repeated calls before the loop runs collapse into one. */
export function scheduleWork() {
  if (scheduled) return
  scheduled = true

  if (hasIdleCallback) {
    requestIdleCallback(runIdleSlice, { timeout: IDLE_TIMEOUT_MS })
  } else {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      runTimedSlice()
    }
    channel.port2.postMessage(null)
  }
}

function runIdleSlice(deadline) {
  scheduled = false

  if (deadline.didTimeout) {
    // Not actually idle — the browser only ran us because we insisted. It reports 0ms
    // remaining, so use our own budget or we would never make progress at all.
    runTimedSlice()
    return
  }

  workLoop(() => deadline.timeRemaining() < 1)
}

function runTimedSlice() {
  scheduled = false
  const start = performance.now()
  workLoop(() => performance.now() - start > FRAME_BUDGET_MS)
}
