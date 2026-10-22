import { refuse } from './refusal.js'

/**
 * A feature's own records: settings and progress it needs to work, such as a learning project or the step a run is
 * on, kept per person (ADR 0015, decision 7). Never understanding: how well someone understands something is a state
 * event and goes through the decision path.
 */

/** The scene-record operations this layer is built on, in the scene's namespace and the caller's name. */
export interface RawRecords {
  get(key: string): { readonly value: unknown } | undefined
  list(prefix?: string): readonly { readonly key: string; readonly value: unknown }[]
  put(key: string, value: unknown): Promise<unknown>
}

/** One kind of record a feature keeps, and how to read the versions it wrote before. */
export interface RecordKind<T> {
  /** Lowercase letters, digits and `-`, for example `project`. */
  readonly kind: string
  /** The current schema version, from 1. Raise it whenever the stored shape changes. */
  readonly version: number
  /** Reads a value stored at an earlier version into the current shape. Required once `version` is above 1. */
  readonly migrate?: (value: unknown, fromVersion: number) => T
}

export interface Records<T> {
  get(id: string): T | undefined
  /** Every live record of this kind, by id. */
  list(): readonly { readonly id: string; readonly value: T }[]
  put(id: string, value: T): Promise<void>
  /** Removes a record. Its earlier versions stay in the history. */
  remove(id: string): Promise<void>
}

/**
 * The records of one feature.
 *
 * Every key it writes starts with the feature's name, and it can only reach keys that do, so one feature cannot read
 * or overwrite another's. The rule is kept by construction rather than by convention.
 */
export interface FeatureRecords {
  readonly feature: string
  of<T>(kind: RecordKind<T>): Records<T>
}

/** What is stored: the value and the schema version it was written at. */
interface Envelope {
  readonly schemaVersion: number
  readonly value: unknown
}

const NAME = /^[a-z][a-z0-9-]*$/

function assertName(what: string, name: string): void {
  if (!NAME.test(name)) {
    throw new Error(
      `${what} "${name}" must be lowercase letters, digits and "-", starting with a letter`,
    )
  }
}

function assertId(id: string): void {
  if (id === '' || id.includes('/')) {
    refuse('invalid_record_id', `record id "${id}" must be non-empty and contain no "/"`)
  }
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { schemaVersion?: unknown }).schemaVersion === 'number' &&
    'value' in value
  )
}

export function featureRecords(raw: RawRecords, feature: string): FeatureRecords {
  assertName('feature', feature)
  return Object.freeze({
    feature,
    of<T>(kind: RecordKind<T>): Records<T> {
      assertName('record kind', kind.kind)
      if (!Number.isInteger(kind.version) || kind.version < 1) {
        throw new Error(`record kind "${kind.kind}" needs an integer version from 1`)
      }
      if (kind.version > 1 && kind.migrate === undefined) {
        throw new Error(
          `record kind "${kind.kind}" is at version ${kind.version} and needs a migrate function`,
        )
      }
      const prefix = `${feature}/${kind.kind}/`
      const read = (key: string, stored: unknown): T => {
        if (!isEnvelope(stored)) throw new Error(`record "${key}" is not a ${feature} record`)
        if (stored.schemaVersion === kind.version) return stored.value as T
        if (stored.schemaVersion > kind.version) {
          throw new Error(
            `record "${key}" was written at version ${stored.schemaVersion}, newer than this build's ${kind.version}`,
          )
        }
        if (kind.migrate === undefined) {
          throw new Error(
            `record "${key}" is at version ${stored.schemaVersion} and "${kind.kind}" has no migrate`,
          )
        }
        return kind.migrate(stored.value, stored.schemaVersion)
      }
      return Object.freeze({
        get(id: string): T | undefined {
          assertId(id)
          const record = raw.get(prefix + id)
          if (record === undefined || record.value === null) return undefined
          return read(prefix + id, record.value)
        },
        list(): readonly { readonly id: string; readonly value: T }[] {
          return raw
            .list(prefix)
            .filter((record) => record.key.startsWith(prefix) && record.value !== null)
            .map((record) => ({
              id: record.key.slice(prefix.length),
              value: read(record.key, record.value),
            }))
        },
        async put(id: string, value: T): Promise<void> {
          assertId(id)
          const envelope: Envelope = { schemaVersion: kind.version, value }
          await raw.put(prefix + id, envelope)
        },
        async remove(id: string): Promise<void> {
          assertId(id)
          await raw.put(prefix + id, null)
        },
      })
    },
  })
}
