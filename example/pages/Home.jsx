import { useState, useEffect, useRef, Link } from 'danio'

/** Local state + an effect with a dep array. */
function Counter() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    document.title = count ? `Danio (${count})` : 'Danio'
  }, [count])

  return (
    <div className="row">
      <button onClick={() => setCount(count + 1)}>Clicked {count} times</button>
      <button className="ghost" onClick={() => setCount(0)} disabled={count === 0}>
        Reset
      </button>
    </div>
  )
}

/** An effect with a cleanup. Unmount it and the interval is torn down. */
function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return <code className="clock">{now.toLocaleTimeString()}</code>
}

/** useRef reaching a real DOM node. */
function FocusDemo() {
  const input = useRef(null)

  return (
    <div className="row">
      <input ref={input} placeholder="a real DOM node" />
      <button className="ghost" onClick={() => input.current.focus()}>
        Focus it
      </button>
    </div>
  )
}

export function Home() {
  const [showClock, setShowClock] = useState(true)

  return (
    <section>
      <h1>A frontend framework, from scratch.</h1>
      <p className="lede">
        Virtual DOM, fiber reconciler, hooks, store, and router — written by hand, with zero
        runtime dependencies. Everything on this page is running on it.
      </p>

      <div className="card">
        <h2>State</h2>
        <Counter />
      </div>

      <div className="card">
        <h2>Effects &amp; cleanup</h2>
        <div className="row">
          {showClock ? <Clock /> : <span className="muted">unmounted</span>}
          <button className="ghost" onClick={() => setShowClock(!showClock)}>
            {showClock ? 'Unmount' : 'Mount'}
          </button>
        </div>
        <p className="muted small">
          Unmounting runs the effect's cleanup, which clears the interval. Watch the console
          stay quiet — no leaked timer.
        </p>
      </div>

      <div className="card">
        <h2>Refs</h2>
        <FocusDemo />
      </div>

      <p>
        <Link to="/todos" className="cta">
          See the store and keyed lists →
        </Link>
      </p>
    </section>
  )
}
