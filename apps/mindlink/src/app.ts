import { fileURLToPath } from 'node:url'
import { learnDomainPack, learnPresentations, learnStateDimensions } from '@episteme/domain-learn'
import { learnDistillationPolicy } from '@episteme/domain-learn/distillation'
import {
  launch,
  sceneOf,
  type LaunchOptions,
  type Launched,
  type SceneRoute,
  type SceneTool,
} from '@mindlink/platform'

/**
 * MindLink's composition root (layer L3): the one place every feature is wired into the service.
 *
 * A feature exports its MCP tools and REST routes; adding one is one line in each list below. Nothing else imports a
 * feature's tools or routes (`tests/architecture.test.ts`).
 */

/** The Learn scene: its vocabulary, how material is distilled, and what a learner may record by hand. */
export const mindlinkScene = sceneOf({
  packs: [learnDomainPack],
  distillationPolicy: learnDistillationPolicy,
  dimensions: learnStateDimensions,
  presentations: learnPresentations,
})

/** Every feature's MCP tools, beside Episteme's own. */
export const tools: readonly SceneTool[] = []

/** Every feature's REST routes, served under `/api/v1/scene/mindlink`. */
export const routes: readonly SceneRoute[] = []

/** The front end (`apps/mindlink/web`), served at `/`. Beside `src` and `dist` alike, so either finds it. */
export const WEB = fileURLToPath(new URL('../web', import.meta.url))

export type StartOptions = Omit<LaunchOptions, 'scene' | 'tools' | 'routes'>

/**
 * Starts MindLink: Episteme's service, owning the graph, with the scene, tools and routes above, and the front end
 * at `/` unless `web` names another directory.
 */
export function startMindLink(options: StartOptions): Promise<Launched> {
  return launch({ web: WEB, ...options, scene: mindlinkScene, tools, routes })
}
