/**
 * `@mindlink/platform`: MindLink's one way into Episteme.
 *
 * No other MindLink module imports `@episteme/application`, `@episteme/mcp` or `@episteme/service` (checked by
 * `tests/architecture.test.ts`). Features read and propose through `Ports`, add tools and routes with `defineTool`
 * and `defineRoute`, and the app starts the service with `launch`. When Episteme's interfaces change, this package
 * changes and the features do not.
 */

export { systemClock, type Clock } from './clock.js'
export {
  defineRoute,
  defineTool,
  type RouteRequest,
  type RouteSpec,
  type SceneRoute,
  type SceneTool,
  type ToolAnswer,
  type ToolSpec,
} from './extensions.js'
export { launch, type DeploymentMode, type LaunchOptions, type Launched } from './launch.js'
export { portsOf, type Ports } from './ports.js'
export {
  publicationReaderOf,
  type PublicationQuery,
  type PublicationReader,
  type PublicationSummary,
} from './publications.js'
export {
  featureRecords,
  type FeatureRecords,
  type RawRecords,
  type RecordKind,
  type Records,
} from './records.js'
export { isRefusal, refuse } from './refusal.js'
export {
  SCENE_NAME,
  sceneOf,
  type DimensionPresentation,
  type SceneSpec,
  type SessionScene,
} from './scene.js'
export { proposerOf, stateReaderOf, type Proposer, type StateReader } from './state.js'
export { threadReaderOf, type Thread, type ThreadReader, type ThreadView } from './threads.js'
