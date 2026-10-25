import { el } from './dom.js'

/**
 * Asks a person to confirm before something that cannot be taken back, such as withdrawing a publication.
 *
 * Resolves `true` only on the confirm button. Cancel, Escape and a click outside the box all resolve `false`, and
 * the box is removed either way. Focus starts on cancel, so Enter alone never confirms.
 * @param {Document} doc
 * @param {{
 *   readonly message: string,
 *   readonly detail?: string,
 *   readonly confirmLabel?: string,
 *   readonly cancelLabel?: string,
 *   readonly danger?: boolean,
 * }} spec
 * @returns {Promise<boolean>}
 */
export function confirm(
  doc,
  { message, detail, confirmLabel = '确定', cancelLabel = '取消', danger = false },
) {
  return new Promise((resolve) => {
    /** @param {boolean} answer */
    const close = (answer) => {
      overlay.remove()
      resolve(answer)
    }
    const cancel = el(doc, 'button', { type: 'button', onclick: () => close(false) }, cancelLabel)
    const accept = el(
      doc,
      'button',
      { type: 'button', class: danger ? 'danger' : undefined, onclick: () => close(true) },
      confirmLabel,
    )
    const box = el(
      doc,
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true' },
      el(doc, 'p', { class: 'dialog-message' }, message),
      detail === undefined ? null : el(doc, 'p', { class: 'dialog-detail' }, detail),
      el(doc, 'div', { class: 'dialog-actions' }, cancel, accept),
    )
    const overlay = el(
      doc,
      'div',
      {
        class: 'overlay',
        onclick: (event) => {
          if (event.target === overlay) close(false)
        },
        onkeydown: (event) => {
          if (/** @type {KeyboardEvent} */ (event).key === 'Escape') close(false)
        },
      },
      box,
    )
    doc.body.append(overlay)
    cancel.focus()
  })
}
