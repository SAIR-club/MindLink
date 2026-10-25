import { defineRoute, refuse, type Ports, type SceneRoute } from '@mindlink/platform'
import type { Adjustment } from './engine/plan.js'
import type { Intensity, ScalarValue } from './types.js'
import { resultStatistics } from './engine/results.js'
import {
  FEATURE,
  activeRun,
  addAdjustment,
  adjustmentsOf,
  parseIntensity,
  parseParams,
  readResults,
  removeAdjustment,
  setLean,
  stateOf,
  switchIntensity,
  unwiredProjects,
  type EngineContext,
} from './engine/runs.js'
import { builtinRegistry, runView } from './engine/view.js'

/**
 * The block engine's REST routes (MindLink#9), under `/api/v1/scene/mindlink`: read a project's run, adjust it, and
 * read result statistics.
 */

export type EngineRouteOptions = Partial<EngineContext>

function project(value: unknown): string {
  if (typeof value !== 'string' || value === '')
    refuse('invalid_project', '"project" 应该是项目 id')
  return value
}

function text(body: Readonly<Record<string, unknown>>, name: string): string {
  const value = body[name]
  if (typeof value !== 'string' || value === '')
    refuse('invalid_adjustment', `"${name}" 应该是非空字符串`)
  return value
}

/** An adjustment from a request body, its fields checked for type; whether it applies is checked against the plan. */
function adjustmentOf(body: Readonly<Record<string, unknown>>): Adjustment {
  const settings = (): {
    intensity?: Intensity
    params?: Readonly<Record<string, ScalarValue>>
  } => {
    const params = parseParams(body['params'])
    return {
      ...(body['intensity'] === undefined ? {} : { intensity: parseIntensity(body['intensity']) }),
      ...(params === undefined ? {} : { params }),
    }
  }
  switch (body['action']) {
    case 'skip':
      return { kind: 'skip', path: text(body, 'path') }
    case 'insert':
      return {
        kind: 'insert',
        ...(body['after'] === undefined ? {} : { after: text(body, 'after') }),
        id: text(body, 'id'),
        use: text(body, 'use'),
        ...settings(),
      }
    case 'replace':
      return { kind: 'replace', path: text(body, 'path'), use: text(body, 'use'), ...settings() }
    case 'set': {
      const values = settings()
      if (values.intensity === undefined && values.params === undefined) {
        refuse('invalid_adjustment', '"set" 至少要写 intensity 或 params')
      }
      return { kind: 'set', path: text(body, 'path'), ...values }
    }
    default:
      return refuse(
        'invalid_adjustment',
        '"action" 应该是 skip、insert、replace、set 或 remove 之一',
      )
  }
}

/** The engine's routes, over the given blocks and projects. */
export function workflowRoutes(options: EngineRouteOptions = {}): readonly SceneRoute[] {
  const context: EngineContext = {
    registry: options.registry ?? builtinRegistry,
    projects: options.projects ?? unwiredProjects,
  }
  const view = (ports: Ports, id: string): Readonly<Record<string, unknown>> => {
    const active = activeRun(ports, id)
    return {
      project: id,
      run:
        active === undefined
          ? null
          : runView(stateOf(ports, active.id, active.run), adjustmentsOf(ports, id)),
      adjustments: adjustmentsOf(ports, id),
    }
  }
  return [
    defineRoute(FEATURE, {
      method: 'GET',
      path: '/runs',
      handle: ({ ports, query }) => view(ports, project(query.get('project'))),
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/runs/adjust',
      handle: async ({ ports, body }) => {
        const id = project(body['project'])
        if (body['action'] === 'remove') {
          const index = body['index']
          if (typeof index !== 'number') refuse('invalid_adjustment', '"index" 应该是调整的序号')
          await removeAdjustment(ports, id, index)
        } else {
          await addAdjustment(ports, context, id, adjustmentOf(body))
        }
        return view(ports, id)
      },
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/runs/intensity',
      handle: async ({ ports, body }) => {
        const id = project(body['project'])
        await switchIntensity(ports, id, parseIntensity(body['intensity']))
        return view(ports, id)
      },
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/runs/lean',
      handle: async ({ ports, body }) => {
        const id = project(body['project'])
        if (typeof body['lean'] !== 'boolean')
          refuse('invalid_argument', '"lean" 应该是 true 或 false')
        await setLean(ports, id, body['lean'])
        return view(ports, id)
      },
    }),
    defineRoute(FEATURE, {
      method: 'GET',
      path: '/stats',
      handle: ({ ports, query }) => {
        const only = query.get('project')
        return {
          ...(only === null ? {} : { project: only }),
          blocks: resultStatistics(readResults(ports, only ?? undefined)),
        }
      },
    }),
  ]
}
