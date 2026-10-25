/**
 * A small fake of the DOM, just enough for the front end's components and shell.
 *
 * MindLink adds no dependency for this (MindLink spec, section 6), and the front end builds its DOM only with
 * `createElement`, `createTextNode`, attributes, listeners and `textContent`, so these few classes stand in for a
 * browser. They deliberately have no `innerHTML`: a component reaching for it fails here too.
 */

type Listener = (event: FakeEvent) => void

export interface FakeEvent {
  readonly type: string
  target: FakeElement | undefined
  defaultPrevented: boolean
  preventDefault(): void
  readonly key?: string
}

export function event(type: string, extra: { key?: string } = {}): FakeEvent {
  return {
    type,
    target: undefined,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    ...extra,
  }
}

abstract class FakeNode {
  parentNode: FakeElement | undefined = undefined
  abstract get textContent(): string

  remove(): void {
    if (this.parentNode === undefined) return
    const siblings = this.parentNode.childNodes
    siblings.splice(siblings.indexOf(this), 1)
    this.parentNode = undefined
  }
}

export class FakeText extends FakeNode {
  constructor(readonly data: string) {
    super()
  }

  get textContent(): string {
    return this.data
  }
}

export class FakeElement extends FakeNode {
  readonly childNodes: FakeNode[] = []
  readonly attributes = new Map<string, string>()
  readonly listeners = new Map<string, Listener[]>()
  value = ''
  disabled = false
  focused = false

  constructor(readonly tagName: string) {
    super()
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((node): node is FakeElement => node instanceof FakeElement)
  }

  get textContent(): string {
    return this.childNodes.map((node) => node.textContent).join('')
  }

  set textContent(text: string) {
    this.replaceChildren(...(text === '' ? [] : [new FakeText(text)]))
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value))
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  append(...nodes: (FakeNode | string)[]): void {
    for (const node of nodes) {
      const child = typeof node === 'string' ? new FakeText(node) : node
      child.remove()
      child.parentNode = this
      this.childNodes.push(child)
    }
  }

  replaceChildren(...nodes: (FakeNode | string)[]): void {
    for (const child of this.childNodes.splice(0)) child.parentNode = undefined
    this.append(...nodes)
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  dispatchEvent(fired: FakeEvent): void {
    fired.target ??= this
    for (const listener of this.listeners.get(fired.type) ?? []) listener(fired)
  }

  focus(): void {
    this.focused = true
  }
}

export class FakeDocument {
  readonly body = new FakeElement('body')
  title = ''

  createElement(tag: string): FakeElement {
    return new FakeElement(tag)
  }

  createTextNode(data: string): FakeText {
    return new FakeText(data)
  }
}

/** The fake as the type the front end is written against. */
export function asDocument(fake: FakeDocument): Document {
  return fake as unknown as Document
}

/** The fake behind a node the front end returned. */
export function fake(node: unknown): FakeElement {
  if (!(node instanceof FakeElement)) throw new Error('not a fake element')
  return node
}

/** Every element under `root`, `root` included, in document order. */
export function all(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap((child) => all(child))]
}

export function byTag(root: FakeElement, tag: string): FakeElement[] {
  return all(root).filter((node) => node.tagName === tag)
}

/** The first innermost element whose text is `text`: the link, not the `nav` around it. */
export function byText(root: FakeElement, text: string): FakeElement {
  const found = all(root).find(
    (node) =>
      node.textContent === text && !node.children.some((child) => child.textContent === text),
  )
  if (found === undefined) throw new Error(`nothing says "${text}"`)
  return found
}

export function click(node: FakeElement): void {
  node.dispatchEvent(event('click'))
}

/** Lets every pending promise callback run. */
export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) await new Promise((resolve) => setTimeout(resolve, 0))
}
