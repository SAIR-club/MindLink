/**
 * Builds the DOM from text, never from HTML (MindLink spec, section 2.2, rule 6).
 *
 * Every component takes the `document` it builds in, so tests can hand it a small fake one.
 */

/**
 * @typedef {string | number | Node | null | undefined | false} Child
 * @typedef {Readonly<Record<string, string | number | boolean | ((event: Event) => void) | undefined>>} Props
 */

/**
 * An element. A prop named `on<event>` adds a listener; `true` sets an empty attribute; `false` and `undefined`
 * leave it out; anything else is set as an attribute. A string child becomes a text node, so nothing is ever
 * read as markup.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {Document} doc
 * @param {K} tag
 * @param {Props} [props]
 * @param {...Child} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag)
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (typeof value === 'function') node.addEventListener(name.slice(2), value)
    else node.setAttribute(name, value === true ? '' : String(value))
  }
  node.append(...nodesOf(doc, children))
  return node
}

/**
 * @param {Document} doc
 * @param {readonly Child[]} children
 * @returns {Node[]}
 */
export function nodesOf(doc, children) {
  return children.flatMap((child) => {
    if (child === null || child === undefined || child === false) return []
    return typeof child === 'object' ? [child] : [doc.createTextNode(String(child))]
  })
}
