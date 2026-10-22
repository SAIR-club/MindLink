import type { SceneRoute } from '@episteme/service'
import type { SceneTool, SceneToolAnswer } from '@episteme/mcp'
import { systemClock, type Clock } from './clock.js'
import { portsOf, type Ports } from './ports.js'

/**
 * How a feature adds MCP tools and REST routes without touching Episteme.
 *
 * A feature describes its handlers in terms of `Ports`; these helpers turn them into the scene extensions Episteme
 * mounts (ADR 0013, scene extensions), giving each call ports bound to the feature's own records.
 */

export type ToolAnswer = SceneToolAnswer

export interface ToolSpec {
  readonly name: string
  readonly title: string
  readonly description: string
  /** A JSON Schema for the arguments, of type `object`. */
  readonly inputSchema: Readonly<Record<string, unknown>>
  /** Declared to the host as a hint; it grants nothing. */
  readonly readOnly: boolean
  readonly handle: (
    args: Readonly<Record<string, unknown>>,
    ports: Ports,
    caller: { readonly agent: string },
  ) => ToolAnswer | Promise<ToolAnswer>
}

export interface RouteRequest {
  readonly ports: Ports
  /** The JSON body of a `POST`, or an empty object. */
  readonly body: Readonly<Record<string, unknown>>
  readonly query: URLSearchParams
}

export interface RouteSpec {
  readonly method: 'GET' | 'POST'
  /** Starts with `/`. Served under `/api/v1/scene/mindlink`. */
  readonly path: string
  readonly handle: (
    request: RouteRequest,
  ) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>
}

/** An MCP tool of `feature`. */
export function defineTool(feature: string, spec: ToolSpec, clock: Clock = systemClock): SceneTool {
  const tool: SceneTool = {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    readOnly: spec.readOnly,
    handle: (args, context) =>
      spec.handle(args, portsOf(context.view, feature, clock), { agent: context.agent }),
  }
  return Object.freeze(tool)
}

/** A REST route of `feature`. */
export function defineRoute(
  feature: string,
  spec: RouteSpec,
  clock: Clock = systemClock,
): SceneRoute {
  const route: SceneRoute = {
    method: spec.method,
    path: spec.path,
    handle: (context) =>
      spec.handle({
        ports: portsOf(context.view, feature, clock),
        body: context.body,
        query: context.query,
      }),
  }
  return Object.freeze(route)
}

export type { SceneRoute, SceneTool }
