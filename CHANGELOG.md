# Changelog

All notable changes to Danio are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## 0.1.0

The first release. A complete, from-scratch frontend framework.

### Added

- **Rendering** — virtual DOM, a fiber reconciler with an interruptible work loop, a
  render/commit split, and keyed reconciliation that moves DOM nodes instead of rebuilding them.
- **Hooks** — `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`,
  `useCallback`, `useRef`.
- **Context** — `createContext`, `useContext`, with subscription-based invalidation that
  survives bailouts.
- **Performance** — bailouts (a `setState` re-renders one component, not the tree), `memo`,
  and `shallowEqual`.
- **Error boundaries** — `<ErrorBoundary>` catching both render and effect errors.
- **Store** — `createStore`, `combineReducers`, `applyMiddleware`, `thunk`, `logger`, and
  `useSelector` / `useDispatch` bindings.
- **Router** — a History-API `<Router>`, `<Routes>`, `<Route>`, `<Link>`, `useParams`,
  `useNavigate`, `useSearchParams`.
- **Server rendering** — `renderToString` / `renderToStaticMarkup` (DOM-free, from
  `danio-js/server`) and `hydrate` (adopts server markup instead of rebuilding it).
- **Tooling** — JSX automatic runtime, hand-written TypeScript definitions, and the
  `create-danio` scaffolder.

### Known limitations

- No streaming SSR or React Server Components.
- No portals or Suspense.
- Tested against a real DOM (54 unit tests) and headless Chrome; Safari and Firefox untested.
