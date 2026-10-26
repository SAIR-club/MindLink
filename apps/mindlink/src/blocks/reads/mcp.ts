import { defineTool, refuse, type Ports, type SceneTool } from '@mindlink/platform'
import { getProject, scopeTag, type Project } from '../../project/index.js'
import {
  DEFAULT_HOTSPOTS,
  DEFAULT_INTERVALS,
  DEFAULT_TURNS,
  MAX_HOTSPOTS,
  MAX_TURNS,
  courseHotspots,
  itemsDue,
  recentTurns,
  stateGaps,
  type ReviewIntervals,
} from './logic.js'

/**
 * The tools blocks may name in `tools:` (MindLink#11). Read only, and generic: none is shaped for one block.
 * Each parses its arguments, calls the function of the same name in `logic.ts`, and words the answer.
 */

/** The feature whose ports the reads get. They keep no records of their own. */
const FEATURE = 'block-tools'

function project(ports: Ports, value: unknown): Project {
  if (typeof value !== 'string' || value === '') {
    refuse('invalid_argument', '"projectId" 应该是非空字符串')
  }
  const found = getProject(ports, value)
  if (found === undefined) refuse('project_not_found', `there is no project "${value}"`)
  return found
}

function limit(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) {
    refuse('invalid_argument', `"limit" 应该是 1 到 ${max} 之间的整数`)
  }
  return value
}

function intervals(value: unknown): ReviewIntervals {
  if (value === undefined) return DEFAULT_INTERVALS
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse('invalid_argument', '"intervals" 应该是按 confidence 等级给出天数的对象')
  }
  const result: Record<string, number> = {}
  for (const [level, days] of Object.entries(value)) {
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) {
      refuse('invalid_argument', `"intervals.${level}" 应该是不小于 0 的天数`)
    }
    result[level] = days
  }
  return result
}

const PROJECT_ID = { type: 'string', description: 'The learning project id, from project_list.' }

export const blockReadTools: readonly SceneTool[] = [
  defineTool(FEATURE, {
    name: 'state_gaps',
    title: 'Read state gaps',
    description:
      "The learner's own items needing attention in the project's course scope: open conflicts, shaky ones and ones held without being explainable, most in need first. Settled items are left out. A project with no course reads every item.",
    inputSchema: {
      type: 'object',
      properties: { projectId: PROJECT_ID },
      required: ['projectId'],
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => {
      const gaps = stateGaps(ports, scopeTag(project(ports, args['projectId'])))
      const lines =
        gaps.items.length === 0
          ? ['No items need attention.']
          : gaps.items.map(
              (item) =>
                `- [${item.reason}] ${item.label} (${item.nodeId})` +
                (item.openConflicts.length === 0
                  ? ''
                  : `; conflicts with ${item.openConflicts.map((end) => end.label).join(', ')}`),
            )
      return { text: lines.join('\n'), structured: { ...gaps } }
    },
  }),
  defineTool(FEATURE, {
    name: 'recent_turns',
    title: 'Read recent turns',
    description:
      "The latest turns of one of the learner's own conversation threads, oldest first: each turn's summary when it has one, else its raw words cut short.",
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'One of the learner’s own threads.' },
        limit: { type: 'integer', minimum: 1, maximum: MAX_TURNS, default: DEFAULT_TURNS },
      },
      required: ['threadId'],
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => {
      const threadId = args['threadId']
      if (typeof threadId !== 'string' || threadId === '') {
        refuse('invalid_argument', '"threadId" 应该是非空字符串')
      }
      const recent = recentTurns(ports, threadId, limit(args['limit'], DEFAULT_TURNS, MAX_TURNS))
      if (recent === undefined) refuse('unknown_thread', 'there is no such thread of yours')
      const lines = [
        `Thread "${recent.thread.title}": last ${recent.turns.length} of ${recent.total} turns.`,
        ...recent.turns.map(
          (turn) =>
            `${turn.seq}. ${turn.speaker}${turn.summarized ? ' (summary)' : ''}: ${turn.text}`,
        ),
      ]
      return { text: lines.join('\n'), structured: { ...recent } }
    },
  }),
  defineTool(FEATURE, {
    name: 'course_hotspots',
    title: 'Read course hotspots',
    description:
      "Where the project's course is stuck, from public data only: shared concepts and questions that several people published an understanding of, scored by distinct authors, and public contradicts relations between live publications. Never anyone's state, adoptions or identity of who adopted.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: PROJECT_ID,
        limit: { type: 'integer', minimum: 1, maximum: MAX_HOTSPOTS, default: DEFAULT_HOTSPOTS },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => {
      const found = project(ports, args['projectId'])
      const result = courseHotspots(
        ports,
        found.course,
        limit(args['limit'], DEFAULT_HOTSPOTS, MAX_HOTSPOTS),
      )
      if (result.reason === 'no_course') {
        return {
          text: 'The project belongs to no course, so there are no course hotspots.',
          structured: { ...result },
        }
      }
      const lines = [
        `${result.publications} live publications in course ${result.course}.`,
        ...result.hotspots.map(
          (spot) =>
            `- ${spot.label} (${spot.nodeId}): ${spot.authors} authors, ${spot.publications.length} publications`,
        ),
        ...result.contradictions.map(
          (edge) => `- contradicts: ${edge.from.label} ↔ ${edge.to.label}`,
        ),
      ]
      return { text: lines.join('\n'), structured: { ...result } }
    },
  }),
  defineTool(FEATURE, {
    name: 'items_due',
    title: 'List items due for review',
    description:
      "The learner's own items in the project's course scope due for review: those whose last recorded change is at least the interval for their confidence level ago, most overdue first. Intervals are days by confidence level (low, medium, high, and unrecorded for none); a level left out is never due.",
    inputSchema: {
      type: 'object',
      properties: {
        projectId: PROJECT_ID,
        intervals: {
          type: 'object',
          additionalProperties: { type: 'number', minimum: 0 },
          description: `Days between reviews by confidence level. Default ${JSON.stringify(DEFAULT_INTERVALS)}.`,
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    readOnly: true,
    handle: (args, ports) => {
      const found = project(ports, args['projectId'])
      const due = itemsDue(ports, scopeTag(found), intervals(args['intervals']))
      const lines =
        due.items.length === 0
          ? ['Nothing is due for review.']
          : due.items.map(
              (item) =>
                `- ${item.label} (${item.nodeId}): confidence ${item.confidence}, ${item.daysSince} days since last touched`,
            )
      return { text: lines.join('\n'), structured: { ...due } }
    },
  }),
]
