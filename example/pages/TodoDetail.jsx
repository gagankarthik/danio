import { useParams, useSelector, useDispatch, useNavigate, Link } from 'danio-js'

export function TodoDetail() {
  // `:id` from the route pattern /todos/:id
  const { id } = useParams()
  const todo = useSelector((state) => state.todos.find((item) => String(item.id) === id))
  const dispatch = useDispatch()
  const navigate = useNavigate()

  if (!todo) {
    return (
      <section>
        <h1>Not found</h1>
        <p className="muted">No todo with id {id}.</p>
        <Link to="/todos" className="cta">
          ← Back to todos
        </Link>
      </section>
    )
  }

  return (
    <section>
      <Link to="/todos" className="muted small">
        ← Todos
      </Link>

      <h1>{todo.text}</h1>

      <div className="card">
        <p>
          Status: <strong>{todo.done ? 'done' : 'active'}</strong>
        </p>
        <div className="row">
          <button onClick={() => dispatch({ type: 'todos/toggle', id: todo.id })}>
            Mark {todo.done ? 'active' : 'done'}
          </button>
          <button
            className="ghost"
            onClick={() => {
              dispatch({ type: 'todos/remove', id: todo.id })
              navigate('/todos')
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  )
}
