import { GlobalWindow } from 'happy-dom'

/**
 * Standard lightweight test DOM using happy-dom.
 */

export function createTestDocument(): Document {
  const win = new GlobalWindow()
  return win.document as unknown as Document
}

export function all(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll('*'))]
}

export function byTag(root: Element, tag: string): Element[] {
  return Array.from(root.getElementsByTagName(tag))
}

export function byText(root: Element, text: string): Element {
  const found = all(root).find(
    (node) =>
      node.textContent === text &&
      !Array.from(node.children).some((child) => child.textContent === text),
  )
  if (found === undefined) throw new Error(`nothing says "${text}"`)
  return found
}

export function click(node: Element): void {
  const win =
    (node.ownerDocument?.defaultView as unknown as GlobalWindow | undefined) ?? new GlobalWindow()
  const mouseEvent = new win.MouseEvent('click', { bubbles: true, cancelable: true })
  node.dispatchEvent(mouseEvent as unknown as Event)
}

export function event(node: Element, type: string, extra: Record<string, unknown> = {}): Event {
  const win =
    (node.ownerDocument?.defaultView as unknown as GlobalWindow | undefined) ?? new GlobalWindow()
  const ev = new win.Event(type, { bubbles: true, cancelable: true })
  return Object.assign(ev, extra) as unknown as Event
}

export async function settle(): Promise<void> {
  for (let round = 0; round < 5; round++) await new Promise((resolve) => setTimeout(resolve, 0))
}
