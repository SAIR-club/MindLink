import { el, nodesOf } from './dom.js'
import { emptyState } from './states.js'

/**
 * A list of items, or an empty state when there are none.
 * @template T
 * @param {Document} doc
 * @param {{
 *   readonly items: readonly T[],
 *   readonly render: (item: T, index: number) => import('./dom.js').Child | readonly import('./dom.js').Child[],
 *   readonly empty?: string,
 *   readonly emptyAction?: Node,
 *   readonly label?: string,
 * }} spec
 * @returns {HTMLElement}
 */
export function list(doc, { items, render, empty = '这里还没有内容。', emptyAction, label }) {
  if (items.length === 0) return emptyState(doc, empty, emptyAction)
  const node = el(doc, 'ul', { class: 'list', 'aria-label': label })
  for (const [index, item] of items.entries()) {
    const content = render(item, index)
    const row = el(doc, 'li', { class: 'list-item' })
    row.append(...nodesOf(doc, Array.isArray(content) ? content : [content]))
    node.append(row)
  }
  return node
}
