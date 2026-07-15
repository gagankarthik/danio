/**
 * Type definitions for Danio.
 *
 * Hand-written to mirror the runtime exactly. If you know React's types, these will feel
 * familiar — the shapes are intentionally close.
 */

// ============================================================================
// Elements & nodes
// ============================================================================

export type Key = string | number

/** A ref is either an object box or a callback that receives the node (or null). */
export type Ref<T = unknown> = RefObject<T> | RefCallback<T> | null
export type RefCallback<T> = (instance: T | null) => void

/** Returned by `useRef(x)` for a DOM ref — `current` is read-only so it's assignable to `ref`. */
export interface RefObject<T> {
  readonly current: T | null
}

/** Returned by `useRef(value)` for a mutable value box you write to yourself. */
export interface MutableRefObject<T> {
  current: T
}

/** The object a component produces — what `h`/`jsx` return. Opaque to app code. */
export interface DanioElement<P = any> {
  type: string | ComponentType<P> | symbol
  key: string | null
  ref: Ref | null
  props: P & { children?: DanioNode }
}

/** Anything renderable as a child. */
export type DanioNode =
  | DanioElement
  | string
  | number
  | boolean
  | null
  | undefined
  | DanioNode[]

/**
 * A function component: props in, an element (or null) out.
 *
 * The return is `DanioElement | null` rather than the broader `DanioNode` because that is what
 * JSX requires of anything used as `<Component/>`. At runtime a component may also return a
 * string, number, or array; wrap those in a Fragment or element to satisfy the types.
 */
export type FunctionComponent<P = {}> = (props: P & { children?: DanioNode }) => DanioElement | null
export type FC<P = {}> = FunctionComponent<P>

export type ComponentType<P = {}> = FunctionComponent<P>

export const Fragment: unique symbol

// ============================================================================
// Creating elements
// ============================================================================

export function createElement<P extends object>(
  type: string | ComponentType<P> | symbol,
  props?: (P & { key?: Key; ref?: Ref }) | null,
  ...children: DanioNode[]
): DanioElement<P>

/** Alias of `createElement` — the hyperscript form for build-step-free usage. */
export const h: typeof createElement

export function jsx(type: any, props: any, key?: Key): DanioElement
export function jsxs(type: any, props: any, key?: Key): DanioElement

/** Flatten arbitrary children into a clean element list. Rarely needed in app code. */
export function normalizeChildren(children: DanioNode): DanioElement[]

// ============================================================================
// Rendering
// ============================================================================

export interface Root {
  container: Element
}

/** Mount an element into a container. Call again on the same container to update in place. */
export function render(element: DanioNode, container: Element): Root

/**
 * Adopt server-rendered markup already in `container` and make it interactive, reusing the
 * existing DOM instead of rebuilding it. Runs synchronously.
 */
export function hydrate(element: DanioNode, container: Element): Root

/** Render an element tree to an HTML string. Also exported from `danio-js/server`. */
export function renderToString(element: DanioNode): string

/** Alias of `renderToString`; signals HTML that will not be hydrated. */
export function renderToStaticMarkup(element: DanioNode): string

/** Unmount a tree, running every effect cleanup. */
export function unmount(container: Element): void

/** Flush all pending updates synchronously, without waiting for the scheduler. */
export function flushSync(): void

// ============================================================================
// Hooks
// ============================================================================

export type Dispatch<A> = (action: A) => void
export type SetStateAction<S> = S | ((prev: S) => S)

export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>]
export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>]

export function useReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initialState: S,
): [S, Dispatch<A>]
export function useReducer<S, A, I>(
  reducer: (state: S, action: A) => S,
  initialArg: I,
  init: (arg: I) => S,
): [S, Dispatch<A>]

export type EffectCleanup = void | (() => void)
export type DependencyList = ReadonlyArray<unknown>

export function useEffect(effect: () => EffectCleanup, deps?: DependencyList): void
export function useLayoutEffect(effect: () => EffectCleanup, deps?: DependencyList): void

export function useMemo<T>(factory: () => T, deps: DependencyList): T
export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T

// A non-null initial value gives a mutable box; passing `null` (typically for a DOM ref)
// gives a read-only RefObject that's assignable to the `ref` attribute.
export function useRef<T>(initial: T | null): RefObject<T>
export function useRef<T>(initial: T): MutableRefObject<T>
export function useRef<T = undefined>(): MutableRefObject<T | undefined>

// ============================================================================
// Context
// ============================================================================

export interface Context<T> {
  Provider: FunctionComponent<{ value: T; children?: DanioNode }>
  Consumer: FunctionComponent<{ children: (value: T) => DanioNode }>
  defaultValue: T
}

export function createContext<T>(defaultValue: T): Context<T>
export function useContext<T>(context: Context<T>): T

// ============================================================================
// Optimization & errors
// ============================================================================

export function memo<P extends object>(
  component: FunctionComponent<P>,
  areEqual?: (prev: Readonly<P>, next: Readonly<P>) => boolean,
): FunctionComponent<P>

export function shallowEqual(a: unknown, b: unknown): boolean

export interface ErrorBoundaryProps {
  children?: DanioNode
  fallback: DanioNode | ((error: Error, reset: () => void) => DanioNode)
  onError?: (error: Error) => void
}

/** Catches render and effect errors in its subtree and shows `fallback` instead. */
export function ErrorBoundary(props: ErrorBoundaryProps): DanioElement | null

// ============================================================================
// Store
// ============================================================================

export interface Action<T = string> {
  type: T
  [extra: string]: unknown
}

export type Reducer<S = any, A extends Action = Action> = (state: S | undefined, action: A) => S

export interface Store<S = any, A extends Action = Action> {
  getState(): S
  dispatch(action: A): A
  subscribe(listener: () => void): () => void
  replaceReducer(next: Reducer<S, A>): void
}

export interface MiddlewareAPI<S = any> {
  getState(): S
  dispatch(action: any): any
}

export type Middleware<S = any> = (
  api: MiddlewareAPI<S>,
) => (next: (action: any) => any) => (action: any) => any

export type StoreEnhancer = (createStore: typeof createStore) => typeof createStore

export function createStore<S, A extends Action = Action>(
  reducer: Reducer<S, A>,
  preloadedState?: S,
  enhancer?: StoreEnhancer,
): Store<S, A>
export function createStore<S, A extends Action = Action>(
  reducer: Reducer<S, A>,
  enhancer: StoreEnhancer,
): Store<S, A>

export function combineReducers<S>(reducers: { [K in keyof S]: Reducer<S[K]> }): Reducer<S>

export function applyMiddleware(...middlewares: Middleware[]): StoreEnhancer

/** Dispatch a function to run async work: `(dispatch, getState) => ...`. */
export const thunk: Middleware

/** Logs each action with the state before and after. */
export const logger: Middleware

// ---- store bindings ----

export function StoreProvider(props: { store: Store; children?: DanioNode }): DanioElement | null
export function useStore<S = any>(): Store<S>
export function useDispatch<A extends Action = Action>(): Dispatch<A>
export function useSelector<S, R>(
  selector: (state: S) => R,
  equalityFn?: (a: R, b: R) => boolean,
): R

// ============================================================================
// Router
// ============================================================================

export interface Location {
  pathname: string
  search: string
  hash: string
}

export interface NavigateOptions {
  replace?: boolean
}

export function Router(props: { children?: DanioNode }): DanioElement | null
export function Routes(props: { children?: DanioNode }): DanioElement | null

export interface RouteProps {
  path?: string
  component?: FunctionComponent<{ params: Record<string, string> }>
  element?: DanioNode
  children?: DanioNode
}
export function Route(props: RouteProps): null

export interface LinkProps {
  to: string
  replace?: boolean
  onClick?: (event: MouseEvent) => void
  children?: DanioNode
  className?: string
  [attr: string]: unknown
}
export function Link(props: LinkProps): DanioElement | null

export function navigate(to: string, options?: NavigateOptions): void
export function matchPath(pattern: string, pathname: string): { params: Record<string, string> } | null

export function useLocation(): Location
export function useNavigate(): typeof navigate
export function useParams<P extends Record<string, string> = Record<string, string>>(): P
export function useSearchParams(): Record<string, string>

// ============================================================================
// JSX — re-exported so `import { JSX } from 'danio-js'` works if needed
// ============================================================================

export { JSX } from './jsx-runtime'
