import {
  asId,
  type Actor,
  type ActorId,
  type DimensionId,
  type NodeId,
  type StateValue,
} from '@episteme/core'
import { composeDeterministic, type Episteme } from '@episteme/sdk'
import { learnDomainPack } from '@episteme/domain-learn'

/**
 * A wired-up Episteme instance for tests.
 *
 * Composition now lives in `@episteme/sdk`, so this file is a thin adapter rather than a second
 * implementation: if the layers stop fitting together, the SDK is what fails and the tests inherit it.
 * The named actors are kept here because the existing suites address them by name.
 */
export type EpistemeContext = Episteme & {
  readonly human: Actor
  readonly agent: Actor
  readonly humanId: ActorId
  readonly agentId: ActorId
}

/** The actors every composition needs, so their ids and shapes cannot drift between fixtures. */
export function createActors(now: () => number): {
  human: Actor
  agent: Actor
  humanId: ActorId
  agentId: ActorId
} {
  const humanId = asId<ActorId>('actor_human')
  const agentId = asId<ActorId>('actor_agent')
  return {
    humanId,
    agentId,
    human: {
      id: humanId,
      kind: 'human',
      displayName: 'Learner',
      shareByDefault: false,
      createdAt: now(),
    },
    agent: {
      id: agentId,
      kind: 'agent',
      displayName: 'Scaffold',
      shareByDefault: false,
      createdAt: now(),
    },
  }
}

export function createFixture(startedAt = 0): EpistemeContext {
  const { human, agent, humanId, agentId } = createActors(() => startedAt)
  const episteme = composeDeterministic(startedAt, {
    actors: [human, agent],
    actorId: humanId,
    packs: [learnDomainPack],
  })
  return { ...episteme, human, agent, humanId, agentId }
}

/** Builds a dimension map, requiring at least one entry so no empty event slips through. */
export function dimensions(
  first: readonly [string, StateValue],
  ...rest: readonly (readonly [string, StateValue])[]
): ReadonlyMap<DimensionId, StateValue> {
  const map = new Map<DimensionId, StateValue>()
  for (const [key, value] of [first, ...rest]) {
    map.set(asId<DimensionId>(key), value)
  }
  return map
}

export function level(value: string): StateValue {
  return { level: value }
}

/** Reads one state dimension for a node, or `undefined` when unrecorded. */
export function readLevel(
  context: EpistemeContext,
  target: string,
  dimension: string,
): string | undefined {
  const state = context.log.stateOf(asId<NodeId>(target), context.humanId)
  return state.get(asId<DimensionId>(dimension))?.level
}
