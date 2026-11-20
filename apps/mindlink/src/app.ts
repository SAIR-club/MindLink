import { fileURLToPath } from 'node:url'
import { learnDomainPack, learnPresentations, learnStateDimensions } from '@episteme/domain-learn'
import { learnDistillationPolicy } from '@episteme/domain-learn/distillation'
import { launch, sceneOf, type LaunchOptions, type Launched } from '@mindlink/platform'
import { builtinRegistry, type RegistryProvider } from './blocks/index.js'
import { workflowTools } from './blocks/mcp.js'
import { blockReadTools } from './blocks/reads/mcp.js'
import { workflowRoutes } from './blocks/routes.js'
import type { WorkflowCatalog } from './project/index.js'
import { projectTools } from './project/mcp.js'
import { projectRoutes } from './project/routes.js'

/**
 * MindLink's composition root (layer L3): the one place every feature is wired into the service.
 *
 * A feature exports its MCP tools and REST routes; adding one is one line in each list in `startMindLink`. Nothing
 * else imports a feature's tools or routes (`tests/architecture.test.ts`).
 */

/** The Learn scene: its vocabulary, how material is distilled, and what a learner may record by hand. */
export const mindlinkScene = sceneOf({
  packs: [learnDomainPack],
  distillationPolicy: learnDistillationPolicy,
  dimensions: learnStateDimensions,
  presentations: learnPresentations,
})

/**
 * The built front end (`apps/mindlink/web/dist`, from `vite build web`), served at `/`. Beside `src` and `dist`
 * alike, so either finds it.
 */
export const WEB = fileURLToPath(new URL('../web/dist', import.meta.url))

export type StartOptions = Omit<LaunchOptions, 'scene' | 'tools' | 'routes'> & {
  /** The block library to run and to offer workflows from; the built-in one unless a test passes its own. */
  readonly registry?: RegistryProvider
}

/**
 * Starts MindLink: Episteme's service, owning the graph, with the scene, tools and routes above, and the front end
 * at `/` unless `web` names another directory.
 */
export function startMindLink(options: StartOptions): Promise<Launched> {
  const { registry = builtinRegistry, ...launchOptions } = options
  // The project feature (L1) cannot see the block library (L2), so it is handed the workflows instead.
  const workflows: WorkflowCatalog = async (ports) =>
    (await registry(ports))
      .list()
      .filter((block) => block.level === 'workflow')
      .map((block) => block.key)
  return launch({
    web: WEB,
    ...launchOptions,
    scene: mindlinkScene,
    tools: [...projectTools(workflows), ...workflowTools({ registry }), ...blockReadTools],
    routes: [...projectRoutes(workflows), ...workflowRoutes({ registry })],
  })
}
