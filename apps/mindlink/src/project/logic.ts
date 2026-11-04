import { refuse, type Ports, type RecordKind } from '@mindlink/platform'

/**
 * Learning projects: one person's learning space on a course, holding settings only (MindLink spec, section 2.4).
 *
 * A project never holds learning data. Progress, profiles and items due for review are read by other features from
 * the graph, by the project's scope; the goal, deadline and baseline the `goal` and `diagnose` blocks ask about are
 * settings, written back through `project_update`.
 */

/** The feature's name, and so the prefix of every record it keeps. */
export const FEATURE = 'project'

/** How much a block guides: tells, gives a hint, or only asks. Shared by every block. */
export type Guidance = 'tell' | 'hint' | 'ask'

export const GUIDANCE: readonly Guidance[] = ['tell', 'hint', 'ask']

/** What a new project is for, which decides its workflow. */
export type GoalType = 'speedrun' | 'apply' | 'deep'

export const GOAL_TYPES: readonly GoalType[] = ['speedrun', 'apply', 'deep']

/** The built-in workflow each goal type starts with. */
export const WORKFLOW_OF: Readonly<Record<GoalType, string>> = Object.freeze({
  speedrun: 'builtin:speedrun',
  apply: 'builtin:apply',
  deep: 'builtin:deep',
})

export const DEFAULT_GUIDANCE: Guidance = 'hint'

export interface Project {
  readonly id: string
  readonly title: string
  /** The course the project belongs to, at most one. Its nodes are tagged `scope:<course>`. */
  readonly course?: string
  /** A full workflow id, such as `builtin:speedrun`. */
  readonly workflowId: string
  /** The default guidance of every block the workflow runs. */
  readonly guidance: Guidance
  /** Whether the person lets the service confirm agents' proposals for this project (ADR 0016). */
  readonly delegation: boolean
  /** What the person wants out of it, in their words. */
  readonly goal?: string
  /** A calendar date, `YYYY-MM-DD`. */
  readonly deadline?: string
  /** What the person already knows and what they lack, in their words. */
  readonly baseline?: string
  /** Milliseconds since the epoch. */
  readonly createdAt: number
  readonly archived: boolean
}

/** What is stored: the project without its id, which is the record's key. */
type StoredProject = Omit<Project, 'id'>

export const PROJECT_RECORD: RecordKind<StoredProject> = Object.freeze({
  kind: 'project',
  version: 1,
})

/** The settings that can be changed after a project is created. `null` clears an optional one. */
export interface ProjectPatch {
  readonly title?: string
  readonly course?: string | null
  readonly workflowId?: string
  readonly guidance?: Guidance
  readonly delegation?: boolean
  readonly goal?: string | null
  readonly deadline?: string | null
  readonly baseline?: string | null
}

export type PatchField = keyof ProjectPatch

/** Every field a person may change in their settings. */
export const PERSON_WRITABLE: readonly PatchField[] = [
  'title',
  'course',
  'workflowId',
  'guidance',
  'delegation',
  'goal',
  'deadline',
  'baseline',
]

/**
 * The fields an agent may write back: what the `goal` and `diagnose` blocks ask about. Everything else, delegation
 * above all, is the person's to change.
 */
export const AGENT_WRITABLE: readonly PatchField[] = ['goal', 'deadline', 'baseline']

export interface NewProject {
  readonly title: string
  readonly course?: string
  readonly goalType: GoalType
}

const TITLE_MAX = 200
const TEXT_MAX = 4000
const WORKFLOW_ID = /^(builtin|course|user):[^\s:]+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The project records, to write. Only the project feature's own tools and routes write them. */
function records(ports: Ports) {
  if (ports.records.feature !== FEATURE) {
    throw new Error(`only the ${FEATURE} feature writes projects, not "${ports.records.feature}"`)
  }
  return ports.records.of(PROJECT_RECORD)
}

/** The project records, to read, from any feature's ports. */
function reader(ports: Ports) {
  return ports.readRecordsOf(FEATURE).of(PROJECT_RECORD)
}

function text(field: string, value: unknown, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    refuse('invalid_project', `"${field}" must be non-empty text`)
  }
  const trimmed = value.trim()
  if (trimmed.length > max) {
    refuse('invalid_project', `"${field}" must be at most ${max} characters`)
  }
  return trimmed
}

function course(value: unknown): string {
  const name = text('course', value, TITLE_MAX)
  if (/\s/.test(name)) refuse('invalid_project', '"course" must contain no whitespace')
  return name
}

function workflowId(value: unknown): string {
  if (typeof value !== 'string' || !WORKFLOW_ID.test(value)) {
    refuse('invalid_project', '"workflowId" must be a full id such as builtin:speedrun')
  }
  return value
}

function guidance(value: unknown): Guidance {
  if (!GUIDANCE.includes(value as Guidance)) {
    refuse('invalid_project', `"guidance" must be one of ${GUIDANCE.join(', ')}`)
  }
  return value as Guidance
}

function deadline(value: unknown): string {
  // A date that does not exist, such as 2026-02-30, reads back as another day.
  if (typeof value === 'string' && DATE.test(value)) {
    const date = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)) return value
  }
  refuse('invalid_project', '"deadline" must be a calendar date, YYYY-MM-DD')
}

/** Reads a patch from untrusted input, refusing any field outside `allowed` and any value out of shape. */
export function parsePatch(
  input: Readonly<Record<string, unknown>>,
  allowed: readonly PatchField[],
): ProjectPatch {
  const patch: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(input)) {
    if (!allowed.includes(field as PatchField)) {
      refuse('invalid_project', `"${field}" cannot be changed here; allowed: ${allowed.join(', ')}`)
    }
    switch (field as PatchField) {
      case 'title':
        patch[field] = text(field, value, TITLE_MAX)
        break
      case 'course':
        patch[field] = value === null ? null : course(value)
        break
      case 'workflowId':
        patch[field] = workflowId(value)
        break
      case 'guidance':
        patch[field] = guidance(value)
        break
      case 'delegation':
        if (typeof value !== 'boolean')
          refuse('invalid_project', '"delegation" must be true or false')
        patch[field] = value
        break
      case 'goal':
      case 'baseline':
        patch[field] = value === null ? null : text(field, value, TEXT_MAX)
        break
      case 'deadline':
        patch[field] = value === null ? null : deadline(value)
        break
    }
  }
  return patch
}

/** Reads a new project from untrusted input. */
export function parseNewProject(input: Readonly<Record<string, unknown>>): NewProject {
  const goalType = input['goalType']
  if (!GOAL_TYPES.includes(goalType as GoalType)) {
    refuse('invalid_project', `"goalType" must be one of ${GOAL_TYPES.join(', ')}`)
  }
  return {
    title: text('title', input['title'], TITLE_MAX),
    ...(input['course'] === undefined ? {} : { course: course(input['course']) }),
    goalType: goalType as GoalType,
  }
}

/**
 * The project with `id`, archived or not, or `undefined` when this person has none. Any feature may call it with its
 * own ports: it reads the project records without being able to write them.
 */
export function getProject(ports: Ports, id: string): Project | undefined {
  const stored = reader(ports).get(id)
  return stored === undefined ? undefined : { id, ...stored }
}

/** The project with `id`, or a refusal. */
export function requireProject(ports: Ports, id: unknown): Project {
  if (typeof id !== 'string' || id === '') refuse('invalid_project', '"id" must be a project id')
  const project = getProject(ports, id)
  if (project === undefined) refuse('project_not_found', `there is no project "${id}"`)
  return project
}

/** This person's projects, oldest first; archived ones only when asked for. */
export function listProjects(
  ports: Ports,
  options: { readonly includeArchived?: boolean } = {},
): readonly Project[] {
  return reader(ports)
    .list()
    .map(({ id, value }) => ({ id, ...value }))
    .filter((project) => options.includeArchived === true || !project.archived)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
}

/** A new id, from the time it was made, kept unique among this person's projects. */
function newId(ports: Ports): string {
  const base = `p${ports.clock.now().toString(36)}`
  let id = base
  for (let n = 2; records(ports).get(id) !== undefined; n++) id = `${base}-${n}`
  return id
}

function stored(project: Project): StoredProject {
  const { id: _id, ...rest } = project
  return rest
}

export async function createProject(ports: Ports, input: NewProject): Promise<Project> {
  const project: Project = {
    id: newId(ports),
    title: input.title,
    ...(input.course === undefined ? {} : { course: input.course }),
    workflowId: WORKFLOW_OF[input.goalType],
    guidance: DEFAULT_GUIDANCE,
    delegation: false,
    createdAt: ports.clock.now(),
    archived: false,
  }
  await records(ports).put(project.id, stored(project))
  return project
}

/** Applies a parsed patch. An archived project is read-only until it is restored. */
export async function updateProject(
  ports: Ports,
  id: unknown,
  patch: ProjectPatch,
): Promise<Project> {
  const current = requireProject(ports, id)
  if (current.archived) refuse('project_archived', `project "${current.id}" is archived`)
  const next: Record<string, unknown> = { ...current }
  for (const [field, value] of Object.entries(patch)) {
    if (value === null) delete next[field]
    else next[field] = value
  }
  const project = next as unknown as Project
  await records(ports).put(project.id, stored(project))
  return project
}

export async function setArchived(ports: Ports, id: unknown, archived: boolean): Promise<Project> {
  const current = requireProject(ports, id)
  const project: Project = { ...current, archived }
  await records(ports).put(project.id, stored(project))
  return project
}

/** The tag the project's nodes carry, or `undefined` when it belongs to no course. */
export function scopeTag(project: Project): string | undefined {
  return project.course === undefined ? undefined : `scope:${project.course}`
}

/** What an agent opening the project is told beside its settings. */
export interface ProjectSummary {
  /**
   * The course, when the project has one: the `scope` an agent passes to Episteme's `thread_open`, `recall` and
   * `distill`, which tag what is accepted `scope:<course>` (see `scopeTag`). Not the tag itself.
   */
  readonly scope?: string
  /** The settings the `goal` and `diagnose` blocks have yet to ask about, in that order. */
  readonly missing: readonly ('goal' | 'deadline' | 'baseline')[]
}

export function summaryOf(project: Project): ProjectSummary {
  return {
    ...(project.course === undefined ? {} : { scope: project.course }),
    missing: (['goal', 'deadline', 'baseline'] as const).filter(
      (field) => project[field] === undefined,
    ),
  }
}
