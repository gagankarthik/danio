import { useState, useSelector, useDispatch, useMemo, Link } from 'danio'
import { addTodoLater } from '../store.js'

const FILTERS = ['all', 'active', 'done']

export function Todos() {
  const todos = useSelector((state) => state.todos)
  const filter = useSelector((state) => state.filter)
  const dispatch = useDispatch()

  const [draft, setDraft] = useState('')

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter((todo) => !todo.done)
    if (filter === 'done') return todos.filter((todo) => todo.done)
    return todos
  }, [todos, filter])

  const submit = (event) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    dispatch({ type: 'todos/add', text })
    setDraft('')
  }

  return (
    <section>
      <h1>Todos</h1>
      <p className="lede">
        State lives in the store. Components read it with <code>useSelector</code> and change
        it by dispatching actions — never by mutating.
      </p>

      <form className="card row" onSubmit={submit}>
        <input
          value={draft}
          onInput={(event) => setDraft(event.target.value)}
          placeholder="What needs doing?"
          aria-label="New todo"
        />
        <button type="submit" disabled={!draft.trim()}>
          Add
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => dispatch(addTodoLater('Added by a thunk, 800ms later'))}
        >
          Add async
        </button>
      </form>

      <div className="row toolbar">
        <div className="filters">
          {FILTERS.map((name) => (
            <button
              key={name}
              className={filter === name ? 'chip on' : 'chip'}
              onClick={() => dispatch({ type: 'filter/set', filter: name })}
            >
              {name}
            </button>
          ))}
        </div>
        <button className="ghost" onClick={() => dispatch({ type: 'todos/shuffle' })}>
          Shuffle
        </button>
      </div>

      {/*
        Every row has a `key`. Hit Shuffle: the reconciler recognises each todo by its key
        and *moves* the existing DOM node instead of rewriting it. Select some text in a row
        first, then shuffle — the selection survives the reorder. Without keys it wouldn't.
      */}
      <ul className="todos">
        {visible.map((todo) => (
          <li key={todo.id} className={todo.done ? 'todo done' : 'todo'}>
            <input
              type="checkbox"
              checked={todo.done}
              onChange={() => dispatch({ type: 'todos/toggle', id: todo.id })}
              aria-label={`Toggle ${todo.text}`}
            />
            <Link to={`/todos/${todo.id}`}>{todo.text}</Link>
            <button
              className="remove"
              onClick={() => dispatch({ type: 'todos/remove', id: todo.id })}
              aria-label={`Remove ${todo.text}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {!visible.length && <p className="muted">Nothing here.</p>}

      <p className="muted small">
        {todos.filter((todo) => !todo.done).length} left of {todos.length}
      </p>
    </section>
  )
}
