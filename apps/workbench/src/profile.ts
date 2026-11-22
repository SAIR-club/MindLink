import { recordableDimensions, type SessionScene } from '@episteme/application'
import { asId, defineDomainPack, type DimensionId } from '@episteme/core'
import { learnDomainPack, learnPresentations, learnStateDimensions } from '@episteme/domain-learn'
import { learnDistillationPolicy } from '@episteme/domain-learn/distillation'
import { BLANK_TOPIC, type SceneProfile } from '@episteme/service'
import { agentRoutes } from './agent-routes.js'
import { agentSessionRoutes } from './agent-sessions.js'
import type { AgentEnvironment, Agents } from './agents.js'
import { BUILT_IN_LIBRARY, type Library } from './blocks.js'
import { hostLearningTools } from './host-learning.js'
import type { ModelClient } from './model.js'
import type { ModelSettings } from './model-settings.js'
import { checkFiling } from './requests.js'
import { workbenchRoutes } from './routes.js'
import { STANCE } from './understanding.js'

/**
 * What an agent's credential may do here besides read (ADR 0020): open a space, add material, draft a plan, and turn
 * words already on record into candidates that wait for the person. Nothing here deletes, archives or replaces, says
 * anything in the person's voice, or settles anything; those routes are not named, so they are the person's.
 */
const PROPOSING_ROUTES = [
  '/spaces',
  '/materials',
  '/plans',
  '/candidates',
  '/candidates/turn',
  '/candidates/thread',
] as const

/**
 * What only the person may read: what is on their computer outside the graph, such as which agents it has, their
 * settings files, and the conversations those agents keep. An agent reads none of it, and none of it reaches a model.
 */
const PRIVATE_ROUTES = ['/agents', '/agent-sessions', '/agent-sessions/read'] as const

export const WORKBENCH_SCENE = 'workbench'

/**
 * Whether a person still holds something. Withdrawing is a state and not a deletion, so the event, its reason and what
 * they held before all stay in the history.
 */
const STANCE_DIMENSION = {
  id: asId<DimensionId>(STANCE),
  label: 'Stance',
  kind: 'ordinal',
  ordered: false,
  levels: ['held', 'withdrawn'],
} as const

/**
 * The Learn vocabulary and a stance. Its name stays `learn`, because a scene's records are kept by its name and the
 * workbench's graphs keep theirs under it.
 */
export const workbenchScene: SessionScene = {
  name: 'learn',
  packs: [
    learnDomainPack,
    defineDomainPack('episteme-workbench', { stateDimensions: [STANCE_DIMENSION] }),
  ],
  distillationPolicy: learnDistillationPolicy,
  recordableDimensions: [
    ...recordableDimensions(
      learnStateDimensions,
      learnPresentations.map((presentation) => ({
        ...presentation,
        id: asId<DimensionId>(presentation.id),
      })),
    ),
    ...recordableDimensions(
      [STANCE_DIMENSION],
      [
        {
          id: STANCE_DIMENSION.id,
          labelZh: '立场',
          levelLabelsZh: { held: '我持有', withdrawn: '已撤回' },
          description: 'Whether the person still holds this.',
          descriptionZh: '你现在还持有这条理解吗。',
        },
      ],
    ),
  ],
}

/**
 * The workbench as a scene of the service, on the learning vocabulary, starting from an empty graph.
 *
 * Make one per service start: its routes hold a store on that graph's connection.
 */
export function workbenchProfile(options: {
  readonly model: ModelClient
  readonly library?: Library
  readonly modelSettings?: ModelSettings
  /** The agents of this computer, for the page that connects them. Without it there is no such page. */
  readonly agents?: Agents
  /** This computer, for reading the conversations its agents keep. Without it there is no such page. */
  readonly agentEnvironment?: AgentEnvironment
}): SceneProfile {
  return {
    name: WORKBENCH_SCENE,
    proposingRoutes: PROPOSING_ROUTES,
    privateRoutes: PRIVATE_ROUTES,
    checkFiling,
    seed: BLANK_TOPIC,
    scene: workbenchScene,
    routes: [
      ...workbenchRoutes(options),
      ...(options.agents === undefined ? [] : agentRoutes(options.agents)),
      ...(options.agentEnvironment === undefined
        ? []
        : agentSessionRoutes(options.agentEnvironment)),
    ],
    mcpTools: hostLearningTools({
      library: options.library ?? BUILT_IN_LIBRARY,
      now: Date.now,
    }),
  }
}
