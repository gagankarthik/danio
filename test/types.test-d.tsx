/**
 * Type-level test. This file is never run — it exists so `npm run typecheck` fails if the
 * public types regress. It exercises the real API the way an app would.
 */
import {
  render,
  useState,
  useEffect,
  useRef,
  useMemo,
  createContext,
  useContext,
  memo,
  ErrorBoundary,
  createStore,
  combineReducers,
  applyMiddleware,
  thunk,
  StoreProvider,
  useSelector,
  useDispatch,
  Router,
  Routes,
  Route,
  Link,
  useParams,
  type FC,
  type Reducer,
} from 'danio-js'

// --- hooks + JSX ---
const Counter: FC<{ label: string }> = ({ label }) => {
  const [n, setN] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const doubled = useMemo(() => n * 2, [n])

  useEffect(() => {
    document.title = `${label}: ${n}`
    return () => void 0
  }, [label, n])

  return (
    <div className="counter">
      <input ref={inputRef} value={String(n)} onInput={(e) => setN(Number(e.target.value))} />
      <button onClick={() => setN((v) => v + 1)}>
        {label}: {n} (x2 = {doubled})
      </button>
    </div>
  )
}

// --- context ---
const Theme = createContext<'light' | 'dark'>('light')
const Themed: FC = () => {
  const theme = useContext(Theme)
  return <span>{theme}</span>
}

// --- memo ---
const Memoized = memo<{ id: number }>(({ id }) => <li key={id}>{id}</li>)

// --- store ---
interface State {
  count: number
}
const countReducer: Reducer<number> = (state = 0, action) =>
  action.type === 'inc' ? state + 1 : state

const store = createStore(
  combineReducers<State>({ count: countReducer }),
  applyMiddleware(thunk),
)

const Connected: FC = () => {
  const count = useSelector((s: State) => s.count)
  const dispatch = useDispatch()
  return <button onClick={() => dispatch({ type: 'inc' })}>{count}</button>
}

// --- router ---
const Detail: FC<{ params: Record<string, string> }> = () => {
  const { id } = useParams()
  return <h1>{id}</h1>
}

const App: FC = () => (
  <StoreProvider store={store}>
    <Router>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <ErrorBoundary fallback={(err, reset) => <button onClick={reset}>{err.message}</button>}>
        <Routes>
          <Route path="/" component={() => <Counter label="Danio" />} />
          <Route path="/x/:id" component={Detail} />
        </Routes>
        <Theme.Provider value="dark">
          <Themed />
          <Memoized id={1} />
          <Connected />
        </Theme.Provider>
      </ErrorBoundary>
    </Router>
  </StoreProvider>
)

render(<App />, document.getElementById('root')!)

export {}
