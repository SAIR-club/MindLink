import type { SessionScene } from '@episteme/application'
import {
  BLANK_TOPIC,
  DEFAULT_GRAPH,
  startService,
  type SceneProfile,
  type SceneRoute,
  type ServiceOptions,
} from '@episteme/service'
import type { SceneTool } from '@episteme/mcp'
import { SCENE_NAME } from './scene.js'

/**
 * Starts the one process that owns the graph (ADR 0010), composed with MindLink's scene, tools and routes.
 *
 * MindLink never opens a graph itself: this hands everything to Episteme's service.
 */

export type DeploymentMode = 'local' | 'shared'

export interface LaunchOptions {
  readonly scene: SessionScene
  readonly tools: readonly SceneTool[]
  readonly routes: readonly SceneRoute[]
  /** `local` serves one person on loopback; `shared` serves the people in `users`, by token. */
  readonly mode: DeploymentMode
  /** The graph file. Defaults to Episteme's default graph, so an existing learner keeps their understanding. */
  readonly graph?: string
  readonly port?: number
  readonly host?: string
  /** The user file. Required in shared mode. */
  readonly users?: string
  /** The origin people reach a shared deployment at, through its HTTPS proxy. Required in shared mode. */
  readonly publicOrigin?: string
  /** Allow people to publish (ADR 0014). */
  readonly sharing?: boolean
  /** A directory of static files to serve at `/` as the web front end. */
  readonly web?: string
}

export interface Launched {
  readonly url: string
  readonly mcpUrl: string
  readonly apiUrl: string
  readonly webUrl: string | undefined
  readonly graph: string
  readonly mode: DeploymentMode
  /** In local mode, the person's token for this run. It decides in their name: show it to them, never log it. */
  readonly humanToken: string | undefined
  close(): Promise<void>
}

export async function launch(options: LaunchOptions): Promise<Launched> {
  if (
    options.mode === 'shared' &&
    (options.users === undefined || options.publicOrigin === undefined)
  ) {
    throw new Error('shared mode needs a users file and the public origin people reach it at')
  }
  const profile: SceneProfile = {
    name: SCENE_NAME,
    seed: BLANK_TOPIC,
    scene: options.scene,
    mcpTools: options.tools,
    routes: options.routes,
  }
  const serviceOptions: ServiceOptions = {
    profile,
    mode: options.mode,
    graph: options.graph ?? DEFAULT_GRAPH,
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.users === undefined ? {} : { users: options.users }),
    ...(options.publicOrigin === undefined ? {} : { publicOrigin: options.publicOrigin }),
    ...(options.sharing === undefined ? {} : { sharing: options.sharing }),
    ...(options.web === undefined ? {} : { workspace: options.web }),
  }
  const service = await startService(serviceOptions)
  return Object.freeze({
    url: service.url,
    mcpUrl: service.mcpUrl,
    apiUrl: service.apiUrl,
    webUrl: service.workspaceUrl,
    graph: service.graph,
    mode: service.mode,
    humanToken: service.humanToken,
    close: () => service.close(),
  })
}
