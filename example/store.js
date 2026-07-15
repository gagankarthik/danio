import { createStore, combineReducers, applyMiddleware, thunk, logger } from 'danio'

let nextId = 4

const initialTodos = [
  { id: 1, text: 'Read build-your-own-react', done: true },
  { id: 2, text: 'Write a fiber reconciler', done: true },
  { id: 3, text: 'Ship something with it', done: false },
]

function todos(state = initialTodos, action) {
  switch (action.type) {
    case 'todos/add':
      return [...state, { id: nextId++, text: action.text, done: false }]

    case 'todos/toggle':
      return state.map((todo) => (todo.id === action.id ? { ...todo, done: !todo.done } : todo))

    case 'todos/remove':
      return state.filter((todo) => todo.id !== action.id)

    // Reordering is the case that proves keyed reconciliation works. Every todo keeps
    // its DOM node — including any text you have selected inside it.
    case 'todos/shuffle': {
      const next = [...state]
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[next[i], next[j]] = [next[j], next[i]]
      }
      return next
    }

    default:
      return state
  }
}

function filter(state = 'all', action) {
  return action.type === 'filter/set' ? action.filter : state
}

export const store = createStore(
  combineReducers({ todos, filter }),
  applyMiddleware(thunk, logger),
)

/**
 * A thunk: dispatch a function instead of an action, and it gets `dispatch` to call
 * whenever it likes — including after an await. This is where async lives.
 */
export const addTodoLater = (text) => (dispatch) => {
  setTimeout(() => dispatch({ type: 'todos/add', text }), 800)
}
