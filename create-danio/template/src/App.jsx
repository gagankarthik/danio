import { useState } from 'danio'

export function App() {
  const [count, setCount] = useState(0)

  return (
    <main className="app">
      <div className="danio" aria-hidden="true">▲</div>
      <h1>__APP_NAME__</h1>
      <p>
        Running on <strong>Danio</strong> — a frontend framework built from scratch, with zero
        runtime dependencies.
      </p>

      <button onClick={() => setCount(count + 1)}>
        clicked {count} {count === 1 ? 'time' : 'times'}
      </button>

      <p className="hint">
        Edit <code>src/App.jsx</code> and save to see it update.
      </p>
    </main>
  )
}
