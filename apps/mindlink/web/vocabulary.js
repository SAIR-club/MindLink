import { API } from './client.js'

/**
 * The dimensions and levels the graph accepts, as `GET /api/v1/vocabulary` reports them (ADR 0013).
 *
 * A page never writes a level or a dimension's name itself: it offers what the vocabulary lists, so a change to
 * the registered vocabulary changes every form. A legacy level is still shown where the graph holds it, but is
 * never offered for new input.
 */

/**
 * @typedef {{ readonly id: string, readonly legacy: boolean }} Level
 * @typedef {{
 *   readonly id: string,
 *   readonly label: string,
 *   readonly kind: string,
 *   readonly recordable: boolean,
 *   readonly levels: readonly Level[],
 * }} Dimension
 * @typedef {{ readonly dimensions: readonly Dimension[] }} Vocabulary
 * @typedef {{ readonly value: string, readonly label: string }} Option
 */

export const VOCABULARY_PATH = `${API}/vocabulary`

/**
 * The vocabulary in an answer from the service. Anything that does not have the documented shape is dropped
 * rather than shown half-read.
 * @param {Readonly<Record<string, unknown>>} answer
 * @returns {Vocabulary}
 */
export function vocabularyOf(answer) {
  const field = answer['dimensions']
  /** @type {readonly unknown[]} */
  const raw = Array.isArray(field) ? field : []
  /** @type {Dimension[]} */
  const dimensions = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { id, label, kind, recordable, levels } = /** @type {Record<string, unknown>} */ (item)
    if (typeof id !== 'string' || !Array.isArray(levels)) continue
    dimensions.push({
      id,
      label: typeof label === 'string' && label !== '' ? label : id,
      kind: typeof kind === 'string' ? kind : '',
      recordable: recordable === true,
      levels: /** @type {readonly unknown[]} */ (levels).flatMap((level) => {
        if (typeof level !== 'object' || level === null) return []
        const { id: levelId, legacy } = /** @type {Record<string, unknown>} */ (level)
        return typeof levelId === 'string' ? [{ id: levelId, legacy: legacy === true }] : []
      }),
    })
  }
  return { dimensions }
}

/**
 * @param {Vocabulary} vocabulary
 * @param {string} dimensionId
 * @returns {Dimension | undefined}
 */
export function dimensionOf(vocabulary, dimensionId) {
  return vocabulary.dimensions.find((dimension) => dimension.id === dimensionId)
}

/**
 * The dimensions to choose from, by their registered names. By default only those a person may record by hand.
 * @param {Vocabulary} vocabulary
 * @param {{ readonly recordableOnly?: boolean }} [options]
 * @returns {readonly Option[]}
 */
export function dimensionOptions(vocabulary, { recordableOnly = true } = {}) {
  return vocabulary.dimensions
    .filter((dimension) => !recordableOnly || dimension.recordable)
    .map((dimension) => ({ value: dimension.id, label: dimension.label }))
}

/**
 * The levels to choose from for new input on one dimension: every registered level but the legacy ones, in
 * registration order.
 * @param {Vocabulary} vocabulary
 * @param {string} dimensionId
 * @returns {readonly Option[]}
 */
export function levelOptions(vocabulary, dimensionId) {
  const dimension = dimensionOf(vocabulary, dimensionId)
  if (dimension === undefined) return []
  return dimension.levels
    .filter((level) => !level.legacy)
    .map((level) => ({ value: level.id, label: level.id }))
}

/**
 * How a level the graph holds is shown: as registered, marked when it is legacy so a person knows it can no
 * longer be chosen.
 * @param {Vocabulary} vocabulary
 * @param {string} dimensionId
 * @param {string} levelId
 * @returns {string}
 */
export function levelText(vocabulary, dimensionId, levelId) {
  const level = dimensionOf(vocabulary, dimensionId)?.levels.find((each) => each.id === levelId)
  return level?.legacy === true ? `${levelId}（旧等级，不能再选）` : levelId
}

/**
 * How a dimension is shown: its registered name, or its id when the vocabulary no longer lists it.
 * @param {Vocabulary} vocabulary
 * @param {string} dimensionId
 * @returns {string}
 */
export function dimensionText(vocabulary, dimensionId) {
  return dimensionOf(vocabulary, dimensionId)?.label ?? dimensionId
}
