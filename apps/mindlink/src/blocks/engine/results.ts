import { refuse } from '@mindlink/platform'
import { valueProblem } from '../parse.js'
import { INTENSITIES, type Intensity, type ResultFieldSpec, type ScalarValue } from '../types.js'

/**
 * Results (block format, 3.4): an activity declares its result fields, `workflow_report` checks what the agent
 * reports against them, and the statistics are worked out by type, the same way for every block. A guide's pick
 * rate is the share of one value of one enum field; nothing here knows that.
 */

export type ResultValues = Readonly<Record<string, ScalarValue>>

/** Checks reported values against an activity's fields, refusing with every problem at once. */
export function checkResult(
  block: string,
  fields: readonly ResultFieldSpec[],
  reported: unknown,
): ResultValues {
  if (typeof reported !== 'object' || reported === null || Array.isArray(reported)) {
    refuse('invalid_result', '"result" 应该是一个对象：字段名 → 值')
  }
  const values = reported as Record<string, unknown>
  const problems: string[] = []
  for (const name of Object.keys(values)) {
    if (!fields.some((field) => field.name === name)) {
      problems.push(
        `${block} 没有结果字段 "${name}"${fields.length === 0 ? '' : `；有 ${fields.map((field) => field.name).join('、')}`}`,
      )
    }
  }
  for (const field of fields) {
    const value = values[field.name]
    const present = value !== undefined
    if (present) {
      const problem =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? valueProblem(field, value)
          : '应该是字符串、整数或布尔值'
      if (problem !== undefined) problems.push(`${field.name} ${problem}`)
      else if (field.type === 'integer' && !Number.isInteger(value))
        problems.push(`${field.name} 应该是整数`)
    }
    const requirement = field.requirement
    if (requirement.kind === 'always' && !present) problems.push(`缺少必填字段 ${field.name}`)
    if (requirement.kind === 'when') {
      const on = values[requirement.field]
      const needed = typeof on === 'string' && requirement.values.includes(on)
      if (needed && !present) {
        problems.push(`${requirement.field} 是 ${String(on)} 时必须报 ${field.name}`)
      } else if (!needed && present) {
        problems.push(
          `只有 ${requirement.field} 是 ${requirement.values.join(' / ')} 时才报 ${field.name}，这次不要报`,
        )
      }
    }
  }
  if (problems.length > 0) refuse('invalid_result', problems.join('；'))
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field.name]
      return value === undefined ? [] : [[field.name, value as ScalarValue]]
    }),
  )
}

/** One reported result as it is kept, with the fields it was checked against. */
export interface ResultEntry {
  readonly run: string
  readonly project: string
  readonly workflow: string
  readonly path: string
  readonly block: string
  readonly intensity: Intensity
  /** Milliseconds since the epoch. */
  readonly at: number
  readonly fields: readonly ResultFieldSpec[]
  readonly values: ResultValues
}

export type FieldStatistics =
  | {
      readonly name: string
      readonly label?: string
      readonly type: 'enum'
      readonly reported: number
      readonly counts: Readonly<Record<string, number>>
      /** Each value's share of the times the field was reported. */
      readonly shares: Readonly<Record<string, number>>
    }
  | {
      readonly name: string
      readonly label?: string
      readonly type: 'boolean'
      readonly reported: number
      readonly trueCount: number
      readonly trueShare: number
    }
  | {
      readonly name: string
      readonly label?: string
      readonly type: 'integer'
      readonly reported: number
      readonly mean: number
      readonly counts: Readonly<Record<string, number>>
    }

export interface GroupStatistics {
  readonly reports: number
  readonly fields: readonly FieldStatistics[]
}

export interface BlockStatistics extends GroupStatistics {
  readonly block: string
  /** By workflow and step path, so two uses of one activity in one workflow are told apart. */
  readonly bySteps: readonly (GroupStatistics & {
    readonly workflow: string
    readonly path: string
  })[]
  readonly byIntensity: readonly (GroupStatistics & { readonly intensity: Intensity })[]
}

function fieldStatistics(field: ResultFieldSpec, entries: readonly ResultEntry[]): FieldStatistics {
  const values = entries
    .map((entry) => entry.values[field.name])
    .filter((value) => value !== undefined)
  const label = field.label === undefined ? {} : { label: field.label }
  const share = (count: number): number => (values.length === 0 ? 0 : count / values.length)
  const tally = (): Record<string, number> => {
    const counts: Record<string, number> = {}
    if (field.type === 'enum') for (const value of field.values) counts[value] = 0
    for (const value of values) counts[String(value)] = (counts[String(value)] ?? 0) + 1
    return counts
  }
  switch (field.type) {
    case 'enum': {
      const counts = tally()
      return {
        name: field.name,
        ...label,
        type: 'enum',
        reported: values.length,
        counts,
        shares: Object.fromEntries(
          Object.entries(counts).map(([value, count]) => [value, share(count)]),
        ),
      }
    }
    case 'boolean': {
      const trueCount = values.filter((value) => value === true).length
      return {
        name: field.name,
        ...label,
        type: 'boolean',
        reported: values.length,
        trueCount,
        trueShare: share(trueCount),
      }
    }
    case 'integer':
      return {
        name: field.name,
        ...label,
        type: 'integer',
        reported: values.length,
        mean:
          values.length === 0
            ? 0
            : values.reduce<number>((sum, value) => sum + Number(value), 0) / values.length,
        counts: tally(),
      }
  }
}

function groupStatistics(entries: readonly ResultEntry[]): GroupStatistics {
  // The fields as the latest report declared them, then any only older reports had.
  const fields: ResultFieldSpec[] = []
  for (const entry of [...entries].sort((left, right) => right.at - left.at)) {
    for (const field of entry.fields) {
      if (!fields.some((known) => known.name === field.name)) fields.push(field)
    }
  }
  return {
    reports: entries.length,
    fields: fields.map((field) => fieldStatistics(field, entries)),
  }
}

function groupBy<K extends string>(
  entries: readonly ResultEntry[],
  key: (entry: ResultEntry) => K,
): Map<K, ResultEntry[]> {
  const groups = new Map<K, ResultEntry[]>()
  for (const entry of entries) groups.set(key(entry), [...(groups.get(key(entry)) ?? []), entry])
  return groups
}

/**
 * Every block's result statistics, by full block id, then by step (in workflow and path order) and by intensity
 * (`tell`, `hint`, `ask`).
 */
export function resultStatistics(entries: readonly ResultEntry[]): BlockStatistics[] {
  return [...groupBy(entries, (entry) => entry.block)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([block, group]) => ({
      block,
      ...groupStatistics(group),
      bySteps: [...groupBy(group, (entry) => `${entry.workflow}\n${entry.path}`)]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, members]) => ({
          workflow: members[0]!.workflow,
          path: members[0]!.path,
          ...groupStatistics(members),
        })),
      byIntensity: [...groupBy(group, (entry) => entry.intensity)]
        .sort(([left], [right]) => INTENSITIES.indexOf(left) - INTENSITIES.indexOf(right))
        .map(([intensity, members]) => ({ intensity, ...groupStatistics(members) })),
    }))
}
