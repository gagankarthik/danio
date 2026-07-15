import { Routes, Route, Link } from 'danio-js'
import { Home } from './pages/Home.jsx'
import { Todos } from './pages/Todos.jsx'
import { TodoDetail } from './pages/TodoDetail.jsx'
import { NotFound } from './pages/NotFound.jsx'

export function App() {
  return (
    <div className="app">
      <header>
        <span className="logo">▲ Danio</span>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/todos">Todos</Link>
        </nav>
      </header>

      <main>
        {/* First match wins, so the catch-all goes last. */}
        <Routes>
          <Route path="/" component={Home} />
          <Route path="/todos" component={Todos} />
          <Route path="/todos/:id" component={TodoDetail} />
          <Route path="*" component={NotFound} />
        </Routes>
      </main>

      <footer>
        Built from scratch — no React, no dependencies.
      </footer>
    </div>
  )
}
