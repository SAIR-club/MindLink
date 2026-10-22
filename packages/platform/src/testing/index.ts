import { CognitiveSession, sceneViewOf, type SceneView } from '@episteme/application'
import type { Clock } from '../clock.js'
import type { Ports } from '../ports.js'
import type { PublicationQuery, PublicationReader, PublicationSummary } from '../publications.js'
import { featureRecords, type RawRecords } from '../records.js'
import type { SessionScene } from '../scene.js'
import type { Proposer, StateReader } from '../state.js'
import type { Thread, ThreadReader, ThreadView } from '../threads.js'

/**
 * In-memory ports, so a feature's logic is tested without a running service.
 *
 * The record store here is the same `featureRecords` layer over a different raw store, and both run one contract
 * suite (`packages/platform/test`), so a feature that passes against these behaves the same against Episteme.
 */

/** Raw scene records in memory. `null` removes a record, as in Episteme. */
export function memoryRecords(): RawRecords {
  const records = new Map<string, unknown>()
  return {
    get: (key) => (records.has(key) ? { value: records.get(key) } : undefined),
    list: (prefix = '') =>
      [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => ({ key, value })),
    put: (key, value) => {
      records.set(key, value)
      return Promise.resolve()
    },
  }
}

function stub<T extends object>(
  name: string,
  overrides: Partial<T>,
  methods: readonly (keyof T)[],
): T {
  const result: Record<string, unknown> = {}
  for (const method of methods) {
    const given = overrides[method]
    result[method as string] =
      given ??
      (() => {
        throw new Error(`${name}.${String(method)} was not provided to this test`)
      })
  }
  return Object.freeze(result) as T
}

/** A state reader that answers only what a test provides, and throws for anything else. */
export function stubState(overrides: Partial<StateReader> = {}): StateReader {
  return stub<StateReader>('state', overrides, [
    'progress',
    'nodes',
    'understandingOf',
    'historyOf',
    'vocabulary',
    'recall',
    'pendingSuggestions',
  ])
}

/** A proposer that answers only what a test provides, and throws for anything else. */
export function stubProposer(overrides: Partial<Proposer> = {}): Proposer {
  return stub<Proposer>('proposer', overrides, ['propose', 'distill'])
}

/** Threads held in memory. */
export function memoryThreads(views: readonly ThreadView[] = []): ThreadReader {
  return Object.freeze({
    threads: (scope?: string): readonly Thread[] =>
      views
        .map((view) => view.thread)
        .filter((thread) => scope === undefined || thread.scope === scope),
    threadView: (threadId: string) => views.find((view) => view.thread.id === threadId),
  })
}

/** Publications held in memory, each with the scope its root is tagged with. */
export function memoryPublications(
  entries: readonly { readonly summary: PublicationSummary; readonly scope?: string }[] = [],
): PublicationReader {
  return Object.freeze({
    browse: (query: PublicationQuery = {}) => {
      const text = query.q?.trim().toLowerCase()
      return entries
        .filter((entry) => query.author === undefined || entry.summary.author === query.author)
        .filter((entry) => query.scope === undefined || entry.scope === query.scope)
        .filter(
          (entry) =>
            text === undefined ||
            text === '' ||
            entry.summary.rootLabel.toLowerCase().includes(text),
        )
        .map((entry) => entry.summary)
    },
  })
}

/** A clock that stands still until a test moves it. */
export function fixedClock(at = 0): Clock & { advance(ms: number): void } {
  let now = at
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

export interface MemoryPortsOptions {
  readonly state?: StateReader
  readonly proposer?: Proposer
  readonly records?: RawRecords
  readonly threads?: ThreadReader
  readonly publications?: PublicationReader
  readonly clock?: Clock
}

/** Ports for one feature, entirely in memory. */
export function memoryPorts(feature: string, options: MemoryPortsOptions = {}): Ports {
  return Object.freeze({
    state: options.state ?? stubState(),
    proposer: options.proposer ?? stubProposer(),
    records: featureRecords(options.records ?? memoryRecords(), feature),
    threads: options.threads ?? memoryThreads(),
    publications: options.publications ?? memoryPublications(),
    clock: options.clock ?? fixedClock(),
  })
}

/** A real scene view over an in-memory graph, for tests that need Episteme's own behaviour. */
export async function openTestView(
  scene: SessionScene,
): Promise<{ readonly view: SceneView; close(): Promise<void> }> {
  const session = await CognitiveSession.open({ scene })
  return { view: sceneViewOf(session), close: () => session.close() }
}

export type { SceneView }
