import { messageOf } from '../client.js'
import { dimensionOf, dimensionOptions, levelOptions } from '../vocabulary.js'
import { el } from './dom.js'

/**
 * A form: labelled fields, a submit button, and the refusal's text when the service says no.
 *
 * While `onSubmit` runs the button is disabled, so a slow request is not sent twice. A required field left empty
 * is caught here, before anything is sent.
 */

/**
 * @typedef {import('../vocabulary.js').Option} Option
 * @typedef {{
 *   readonly name: string,
 *   readonly label: string,
 *   readonly kind?: 'text' | 'textarea' | 'select',
 *   readonly value?: string,
 *   readonly required?: boolean,
 *   readonly placeholder?: string,
 *   readonly options?: readonly Option[],
 * }} Field
 * @typedef {Readonly<Record<string, string>>} Values
 */

/**
 * @param {Document} doc
 * @param {{
 *   readonly fields: readonly Field[],
 *   readonly submitLabel?: string,
 *   readonly onSubmit: (values: Values) => unknown,
 * }} spec
 * @returns {HTMLFormElement}
 */
export function form(doc, { fields, submitLabel = '提交', onSubmit }) {
  /** @type {Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>} */
  const controls = new Map()
  const message = el(doc, 'p', { class: 'form-error', role: 'alert' })
  const submit = el(doc, 'button', { type: 'submit' }, submitLabel)
  const rows = fields.map((field) => {
    const control = controlOf(doc, field)
    controls.set(field.name, control)
    return el(
      doc,
      'label',
      { class: 'field' },
      el(doc, 'span', { class: 'field-label' }, field.label),
      control,
    )
  })
  const node = el(doc, 'form', { class: 'form', novalidate: true }, ...rows, message, submit)

  node.addEventListener('submit', (event) => {
    event.preventDefault()
    void send()
  })

  async function send() {
    if (submit.disabled) return
    /** @type {Record<string, string>} */
    const values = {}
    for (const [name, control] of controls) values[name] = control.value
    const missing = fields.find(
      (field) => field.required === true && (values[field.name] ?? '').trim() === '',
    )
    if (missing !== undefined) {
      message.textContent = `请填写“${missing.label}”。`
      return
    }
    message.textContent = ''
    submit.disabled = true
    try {
      await onSubmit(values)
    } catch (error) {
      message.textContent = messageOf(error)
    } finally {
      submit.disabled = false
    }
  }

  return node
}

/**
 * @param {Document} doc
 * @param {Field} field
 * @returns {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement}
 */
function controlOf(doc, field) {
  const common = {
    name: field.name,
    required: field.required === true,
    placeholder: field.placeholder,
  }
  if (field.kind === 'select') {
    const options = field.options ?? []
    const select = el(
      doc,
      'select',
      { name: field.name, required: field.required === true, disabled: options.length === 0 },
      ...options.map((option) => el(doc, 'option', { value: option.value }, option.label)),
    )
    // Only a value that is offered can be chosen: a legacy level the graph still holds is not.
    const chosen = options.find((option) => option.value === field.value) ?? options[0]
    select.value = chosen?.value ?? ''
    return select
  }
  const control =
    field.kind === 'textarea'
      ? el(doc, 'textarea', common)
      : el(doc, 'input', { ...common, type: 'text' })
  control.value = field.value ?? ''
  return control
}

/**
 * A field choosing one level of a dimension, from the levels the vocabulary offers for new input.
 * @param {import('../vocabulary.js').Vocabulary} vocabulary
 * @param {string} dimensionId
 * @param {{ readonly name?: string, readonly label?: string, readonly value?: string }} [options]
 * @returns {Field}
 */
export function levelField(vocabulary, dimensionId, { name = 'level', label, value } = {}) {
  return {
    name,
    label: label ?? dimensionOf(vocabulary, dimensionId)?.label ?? dimensionId,
    kind: 'select',
    required: true,
    options: levelOptions(vocabulary, dimensionId),
    ...(value === undefined ? {} : { value }),
  }
}

/**
 * A field choosing one dimension a person may record, by its registered name.
 * @param {import('../vocabulary.js').Vocabulary} vocabulary
 * @param {{ readonly name?: string, readonly label?: string, readonly value?: string }} [options]
 * @returns {Field}
 */
export function dimensionField(vocabulary, { name = 'dimension', label = '理解维度', value } = {}) {
  return {
    name,
    label,
    kind: 'select',
    required: true,
    options: dimensionOptions(vocabulary),
    ...(value === undefined ? {} : { value }),
  }
}
