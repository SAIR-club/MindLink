import {
  dimensionOf,
  dimensionOptions,
  levelOptions,
  type Option,
  type Vocabulary,
} from './vocabulary.js'

/**
 * The fields of a form, and what is decided before anything is sent. `components/FormView.vue` shows them.
 */

export interface Field {
  readonly name: string
  readonly label: string
  readonly kind?: 'text' | 'textarea' | 'select'
  readonly value?: string
  readonly required?: boolean
  readonly placeholder?: string
  readonly options?: readonly Option[]
}

export type Values = Readonly<Record<string, string>>

/**
 * The value each field starts from. A select starts from its given value only when that is offered (a legacy
 * level the graph still holds is not), otherwise from its first option.
 */
export function initialValues(fields: readonly Field[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const field of fields) {
    if (field.kind === 'select') {
      const options = field.options ?? []
      const chosen = options.find((option) => option.value === field.value) ?? options[0]
      values[field.name] = chosen?.value ?? ''
    } else {
      values[field.name] = field.value ?? ''
    }
  }
  return values
}

/** What to tell a person who left a required field empty, or `undefined` when every one is filled. */
export function missingMessage(fields: readonly Field[], values: Values): string | undefined {
  const missing = fields.find(
    (field) => field.required === true && (values[field.name] ?? '').trim() === '',
  )
  return missing === undefined ? undefined : `请填写“${missing.label}”。`
}

interface FieldOptions {
  readonly name?: string
  readonly label?: string
  readonly value?: string
}

/** A field choosing one level of a dimension, from the levels the vocabulary offers for new input. */
export function levelField(
  vocabulary: Vocabulary,
  dimensionId: string,
  { name = 'level', label, value }: FieldOptions = {},
): Field {
  return {
    name,
    label: label ?? dimensionOf(vocabulary, dimensionId)?.label ?? dimensionId,
    kind: 'select',
    required: true,
    options: levelOptions(vocabulary, dimensionId),
    ...(value === undefined ? {} : { value }),
  }
}

/** A field choosing one dimension a person may record, by its registered name. */
export function dimensionField(
  vocabulary: Vocabulary,
  { name = 'dimension', label = '理解维度', value }: FieldOptions = {},
): Field {
  return {
    name,
    label,
    kind: 'select',
    required: true,
    options: dimensionOptions(vocabulary),
    ...(value === undefined ? {} : { value }),
  }
}
