import { messageOf } from '../client.js'
import { el } from './dom.js'

/**
 * What a page shows while it waits, when there is nothing, and when something went wrong.
 */

/**
 * @param {Document} doc
 * @param {string} [text]
 * @returns {HTMLElement}
 */
export function loading(doc, text = '加载中…') {
  return el(doc, 'p', { class: 'state state-loading', role: 'status', 'aria-busy': 'true' }, text)
}

/**
 * @param {Document} doc
 * @param {string} text what is missing, such as "还没有学习项目"
 * @param {Node} [action] what to do about it, such as a link to create one
 * @returns {HTMLElement}
 */
export function emptyState(doc, text, action) {
  return el(doc, 'div', { class: 'state state-empty' }, el(doc, 'p', {}, text), action)
}

/**
 * A failure, in the person's words: a refusal's Chinese text, with its code for a report.
 * @param {Document} doc
 * @param {unknown} error
 * @param {{ readonly retry?: () => void }} [options]
 * @returns {HTMLElement}
 */
export function errorState(doc, error, { retry } = {}) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  return el(
    doc,
    'div',
    { class: 'state state-error', role: 'alert' },
    el(doc, 'p', {}, messageOf(error)),
    code === undefined ? null : el(doc, 'p', { class: 'state-code' }, `代码：${code}`),
    retry === undefined
      ? null
      : el(doc, 'button', { type: 'button', onclick: () => retry() }, '重试'),
  )
}
