import { defineTool, type SceneTool, type ToolAnswer } from '@mindlink/platform'
import {
  AGENT_WRITABLE,
  FEATURE,
  listProjects,
  parsePatch,
  requireProject,
  summaryOf,
  updateProject,
  type Project,
} from './logic.js'

/**
 * The project tools an agent calls (MindLink#10). An agent reads a project's settings and writes back only what the
 * `goal` and `diagnose` blocks ask about; creating, archiving and every other setting are the person's.
 */

function opened(project: Project): ToolAnswer {
  const summary = summaryOf(project)
  const lines = [
    `Project "${project.title}" (${project.id})${project.archived ? ', archived' : ''}.`,
    `Workflow ${project.workflowId}, guidance ${project.guidance}.`,
    summary.scope === undefined
      ? "No course: call Episteme's thread_open, recall and distill without a scope."
      : `Course ${summary.scope}: pass scope "${summary.scope}" to Episteme's thread_open, recall and distill.`,
    summary.missing.length === 0
      ? 'Goal, deadline and baseline are set.'
      : `Not yet asked: ${summary.missing.join(', ')}.`,
  ]
  return { text: lines.join('\n'), structured: { project, summary } }
}

const ID = { type: 'string', description: 'The project id, from project_list.' }
const CLEARABLE = (description: string) => ({
  type: ['string', 'null'],
  description: `${description} null clears it.`,
})

export const projectTools: readonly SceneTool[] = [
  defineTool(FEATURE, {
    name: 'project_list',
    title: 'List learning projects',
    description:
      "The person's learning projects, oldest first: each one's settings, without archived ones unless asked.",
    inputSchema: {
      type: 'object',
      properties: { includeArchived: { type: 'boolean' } },
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => {
      const projects = listProjects(ports, { includeArchived: args['includeArchived'] === true })
      const text =
        projects.length === 0
          ? 'No projects.'
          : projects.map((project) => `${project.id}: ${project.title}`).join('\n')
      return { text, structured: { projects } }
    },
  }),
  defineTool(FEATURE, {
    name: 'project_open',
    title: 'Open a learning project',
    description:
      "A project's settings (course, workflow, default guidance, goal, deadline, baseline) and which of goal, deadline and baseline are not yet known. A project holds no learning data.",
    inputSchema: {
      type: 'object',
      properties: { id: ID },
      required: ['id'],
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => opened(requireProject(ports, args['id'])),
  }),
  defineTool(FEATURE, {
    name: 'project_update',
    title: 'Write back a project goal, deadline or baseline',
    description:
      'Writes back what the person said about their goal, deadline or existing baseline, in their words. Only these three fields; nothing about progress or understanding.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID,
        goal: CLEARABLE('What the person wants out of the project.'),
        deadline: CLEARABLE('A calendar date, YYYY-MM-DD.'),
        baseline: CLEARABLE('What the person already knows and what they lack.'),
      },
      required: ['id'],
      additionalProperties: false,
    },
    readOnly: false,
    handle: async (args, ports) => {
      const { id, ...fields } = args
      return opened(await updateProject(ports, id, parsePatch(fields, AGENT_WRITABLE)))
    },
  }),
]
