import { API } from './client.js'

/**
 * The dimensions and levels the graph accepts, as `GET /api/v1/vocabulary` reports them (ADR 0013).
 *
 * A page never writes a level or a dimension's name itself: it offers what the vocabulary lists, so a change to
 * the registered vocabulary changes every form. A legacy level is still shown where the graph holds it, but is
 * never offered for new input.
 */

export interface Level {
  readonly id: string
  readonly legacy: boolean
}

export interface Dimension {
  readonly id: string
  readonly label: string
  readonly kind: string
  readonly recordable: boolean
  readonly levels: readonly Level[]
}

export interface Vocabulary {
  readonly dimensions: readonly Dimension[]
}

export interface Option {
  readonly value: string
  readonly label: string
}

export const VOCABULARY_PATH = `${API}/vocabulary`

/**
 * The vocabulary in an answer from the service. Anything that does not have the documented shape is dropped
 * rather than shown half-read.
 */
export function vocabularyOf(answer: Readonly<Record<string, unknown>>): Vocabulary {
  const field = answer['dimensions']
  const raw: readonly unknown[] = Array.isArray(field) ? field : []
  const dimensions: Dimension[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const { id, label, kind, recordable, levels } = item as Record<string, unknown>
    if (typeof id !== 'string' || !Array.isArray(levels)) continue
    dimensions.push({
      id,
      label: typeof label === 'string' && label !== '' ? label : id,
      kind: typeof kind === 'string' ? kind : '',
      recordable: recordable === true,
      levels: (levels as readonly unknown[]).flatMap((level) => {
        if (typeof level !== 'object' || level === null) return []
        const { id: levelId, legacy } = level as Record<string, unknown>
        return typeof levelId === 'string' ? [{ id: levelId, legacy: legacy === true }] : []
      }),
    })
  }
  return { dimensions }
}

export function dimensionOf(vocabulary: Vocabulary, dimensionId: string): Dimension | undefined {
  return vocabulary.dimensions.find((dimension) => dimension.id === dimensionId)
}

/** The dimensions to choose from, by their registered names. By default only those a person may record by hand. */
export function dimensionOptions(
  vocabulary: Vocabulary,
  { recordableOnly = true }: { readonly recordableOnly?: boolean } = {},
): readonly Option[] {
  return vocabulary.dimensions
    .filter((dimension) => !recordableOnly || dimension.recordable)
    .map((dimension) => ({ value: dimension.id, label: dimension.label }))
}

/**
 * The levels to choose from for new input on one dimension: every registered level but the legacy ones, in
 * registration order.
 */
export function levelOptions(vocabulary: Vocabulary, dimensionId: string): readonly Option[] {
  const dimension = dimensionOf(vocabulary, dimensionId)
  if (dimension === undefined) return []
  return dimension.levels
    .filter((level) => !level.legacy)
    .map((level) => ({ value: level.id, label: level.id }))
}

/**
 * How a level the graph holds is shown: as registered, marked when it is legacy so a person knows it can no
 * longer be chosen.
 */
export function levelText(vocabulary: Vocabulary, dimensionId: string, levelId: string): string {
  const level = dimensionOf(vocabulary, dimensionId)?.levels.find((each) => each.id === levelId)
  return level?.legacy === true ? `${levelId}（旧等级，不能再选）` : levelId
}

/** How a dimension is shown: its registered name, or its id when the vocabulary no longer lists it. */
export function dimensionText(vocabulary: Vocabulary, dimensionId: string): string {
  return dimensionOf(vocabulary, dimensionId)?.label ?? dimensionId
}
