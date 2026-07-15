/**
 * JSX types for Danio's automatic runtime.
 *
 * With `jsxImportSource: 'danio'` (or the TS `jsxImportSource` compiler option),
 * TypeScript reads the `JSX` namespace from here to typecheck every `<tag>` and component.
 *
 * The intrinsic-element typing is deliberately pragmatic: common attributes and all DOM
 * events are typed for autocomplete, with a permissive index signature so valid-but-untyped
 * attributes never error. That trades exhaustive per-attribute checking for zero false
 * positives — the right call for a framework that must not fight its users.
 */

import type { DanioElement, DanioNode, Key, Ref } from './index'

export { Fragment, jsx, jsxs } from './index'
export function jsxDEV(type: any, props: any, key?: Key): DanioElement

type Booleanish = boolean | 'true' | 'false'

interface AriaAttributes {
  role?: string
  [aria: `aria-${string}`]: string | number | boolean | undefined
}

interface DOMEvents<T> {
  onClick?: (event: MouseEvent & { currentTarget: T }) => void
  onDoubleClick?: (event: MouseEvent & { currentTarget: T }) => void
  onMouseDown?: (event: MouseEvent & { currentTarget: T }) => void
  onMouseUp?: (event: MouseEvent & { currentTarget: T }) => void
  onMouseEnter?: (event: MouseEvent & { currentTarget: T }) => void
  onMouseLeave?: (event: MouseEvent & { currentTarget: T }) => void
  onMouseMove?: (event: MouseEvent & { currentTarget: T }) => void
  onInput?: (event: Event & { currentTarget: T; target: HTMLInputElement }) => void
  onChange?: (event: Event & { currentTarget: T; target: HTMLInputElement }) => void
  onSubmit?: (event: SubmitEvent & { currentTarget: T }) => void
  onKeyDown?: (event: KeyboardEvent & { currentTarget: T }) => void
  onKeyUp?: (event: KeyboardEvent & { currentTarget: T }) => void
  onFocus?: (event: FocusEvent & { currentTarget: T }) => void
  onBlur?: (event: FocusEvent & { currentTarget: T }) => void
  onScroll?: (event: Event & { currentTarget: T }) => void
  onPointerDown?: (event: PointerEvent & { currentTarget: T }) => void
  onPointerUp?: (event: PointerEvent & { currentTarget: T }) => void
}

interface HTMLAttributes<T = HTMLElement> extends AriaAttributes, DOMEvents<T> {
  key?: Key
  ref?: Ref<T>
  children?: DanioNode

  class?: string
  className?: string
  id?: string
  style?: string | Partial<CSSStyleDeclaration> | Record<string, string | number>
  title?: string
  hidden?: boolean
  tabIndex?: number
  dir?: string
  lang?: string
  draggable?: Booleanish
  dangerouslySetInnerHTML?: { __html: string }

  // form controls
  value?: string | number
  checked?: boolean
  disabled?: boolean
  readOnly?: boolean
  placeholder?: string
  type?: string
  name?: string
  htmlFor?: string
  for?: string
  required?: boolean
  autoFocus?: boolean
  autoComplete?: string
  min?: string | number
  max?: string | number
  step?: string | number
  rows?: number
  cols?: number
  selected?: boolean

  // links / media
  href?: string
  target?: string
  rel?: string
  src?: string
  alt?: string
  width?: string | number
  height?: string | number
  loading?: 'lazy' | 'eager'

  // data attributes
  [data: `data-${string}`]: string | number | boolean | undefined

  // escape hatch — keeps any valid attribute from erroring
  [attr: string]: unknown
}

interface SVGAttributes<T = SVGElement> extends AriaAttributes, DOMEvents<T> {
  key?: Key
  ref?: Ref<T>
  children?: DanioNode
  class?: string
  className?: string
  id?: string
  style?: string | Record<string, string | number>
  fill?: string
  stroke?: string
  'stroke-width'?: string | number
  strokeWidth?: string | number
  viewBox?: string
  d?: string
  cx?: string | number
  cy?: string | number
  r?: string | number
  x?: string | number
  y?: string | number
  width?: string | number
  height?: string | number
  points?: string
  transform?: string
  [attr: string]: unknown
}

export namespace JSX {
  type Element = DanioElement

  interface ElementChildrenAttribute {
    children: {}
  }

  interface IntrinsicAttributes {
    key?: Key
  }

  interface IntrinsicElements {
    // structure
    div: HTMLAttributes<HTMLDivElement>
    span: HTMLAttributes<HTMLSpanElement>
    p: HTMLAttributes<HTMLParagraphElement>
    section: HTMLAttributes
    article: HTMLAttributes
    header: HTMLAttributes
    footer: HTMLAttributes
    main: HTMLAttributes
    nav: HTMLAttributes
    aside: HTMLAttributes
    h1: HTMLAttributes<HTMLHeadingElement>
    h2: HTMLAttributes<HTMLHeadingElement>
    h3: HTMLAttributes<HTMLHeadingElement>
    h4: HTMLAttributes<HTMLHeadingElement>
    h5: HTMLAttributes<HTMLHeadingElement>
    h6: HTMLAttributes<HTMLHeadingElement>

    // text
    a: HTMLAttributes<HTMLAnchorElement>
    strong: HTMLAttributes
    em: HTMLAttributes
    b: HTMLAttributes
    i: HTMLAttributes
    small: HTMLAttributes
    code: HTMLAttributes
    pre: HTMLAttributes<HTMLPreElement>
    blockquote: HTMLAttributes
    br: HTMLAttributes
    hr: HTMLAttributes

    // lists
    ul: HTMLAttributes<HTMLUListElement>
    ol: HTMLAttributes<HTMLOListElement>
    li: HTMLAttributes<HTMLLIElement>
    dl: HTMLAttributes
    dt: HTMLAttributes
    dd: HTMLAttributes

    // forms
    form: HTMLAttributes<HTMLFormElement>
    input: HTMLAttributes<HTMLInputElement>
    textarea: HTMLAttributes<HTMLTextAreaElement>
    select: HTMLAttributes<HTMLSelectElement>
    option: HTMLAttributes<HTMLOptionElement>
    button: HTMLAttributes<HTMLButtonElement>
    label: HTMLAttributes<HTMLLabelElement>
    fieldset: HTMLAttributes
    legend: HTMLAttributes

    // media / embedded
    img: HTMLAttributes<HTMLImageElement>
    picture: HTMLAttributes
    source: HTMLAttributes
    video: HTMLAttributes<HTMLVideoElement>
    audio: HTMLAttributes<HTMLAudioElement>
    canvas: HTMLAttributes<HTMLCanvasElement>
    iframe: HTMLAttributes<HTMLIFrameElement>

    // table
    table: HTMLAttributes<HTMLTableElement>
    thead: HTMLAttributes
    tbody: HTMLAttributes
    tfoot: HTMLAttributes
    tr: HTMLAttributes<HTMLTableRowElement>
    th: HTMLAttributes<HTMLTableCellElement>
    td: HTMLAttributes<HTMLTableCellElement>
    caption: HTMLAttributes

    // svg
    svg: SVGAttributes<SVGSVGElement>
    path: SVGAttributes<SVGPathElement>
    circle: SVGAttributes<SVGCircleElement>
    rect: SVGAttributes<SVGRectElement>
    line: SVGAttributes<SVGLineElement>
    g: SVGAttributes<SVGGElement>
    polygon: SVGAttributes
    polyline: SVGAttributes
    text: SVGAttributes

    // anything else
    [tag: string]: HTMLAttributes
  }
}
