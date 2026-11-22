import { defineRoute, refuse, type SceneRoute } from '@mindlink/platform'
import {
  FEATURE,
  PERSON_WRITABLE,
  createProject,
  listProjects,
  parseNewProject,
  parsePatch,
  requireProject,
  setArchived,
  summaryOf,
  updateProject,
  type WorkflowCatalog,
} from './logic.js'

/**
 * The project REST the person's pages call, under `/api/v1/scene/mindlink/projects`. Scene routes match exact paths,
 * so the project id travels in the query or the body.
 */
export function projectRoutes(workflows: WorkflowCatalog): readonly SceneRoute[] {
  return [
    defineRoute(FEATURE, {
      method: 'GET',
      path: '/projects/workflows',
      handle: async ({ ports }) => ({ workflows: await workflows(ports) }),
    }),
    defineRoute(FEATURE, {
      method: 'GET',
      path: '/projects',
      handle: ({ ports, query }) => ({
        projects: listProjects(ports, { includeArchived: query.get('archived') === 'include' }),
      }),
    }),
    defineRoute(FEATURE, {
      method: 'GET',
      path: '/projects/show',
      handle: ({ ports, query }) => {
        const project = requireProject(ports, query.get('id') ?? undefined)
        return { project, summary: summaryOf(project) }
      },
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/projects/create',
      handle: async ({ ports, body }) => ({
        project: await createProject(ports, parseNewProject(body), workflows),
      }),
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/projects/update',
      handle: async ({ ports, body }) => {
        const { id, ...fields } = body
        return {
          project: await updateProject(ports, id, parsePatch(fields, PERSON_WRITABLE), workflows),
        }
      },
    }),
    defineRoute(FEATURE, {
      method: 'POST',
      path: '/projects/archive',
      handle: async ({ ports, body }) => {
        const archived = body['archived'] ?? true
        if (typeof archived !== 'boolean')
          refuse('invalid_project', '"archived" must be true or false')
        return { project: await setArchived(ports, body['id'], archived) }
      },
    }),
  ]
}
