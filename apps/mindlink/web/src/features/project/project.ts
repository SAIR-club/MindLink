import { SCENE_API, type Client } from '../../client.js'
import type { Option } from '../../vocabulary.js'

/**
 * Learning projects as the pages see them (MindLink spec, section 2.4): the records the project REST answers with,
 * what each setting is called in Chinese, and the calls the pages make. A project holds settings only; the goal,
 * deadline and baseline are asked by the `goal` and `diagnose` blocks in the learning conversation, so the pages
 * show them and never edit them.
 */

export type Guidance = 'tell' | 'hint' | 'ask'
export type GoalType = 'speedrun' | 'apply' | 'deep'

export interface Project {
  readonly id: string
  readonly title: string
  readonly course?: string
  readonly workflowId: string
  readonly guidance: Guidance
  readonly delegation: boolean
  readonly goal?: string
  readonly deadline?: string
  readonly baseline?: string
  readonly createdAt: number
  readonly archived: boolean
}

export interface GoalChoice {
  readonly id: GoalType
  readonly label: string
  readonly workflowId: string
  /** One line on what the goal type means. */
  readonly description: string
}

/** The three goal types a new project starts from, each with the built-in workflow it decides. */
export const GOAL_CHOICES: readonly GoalChoice[] = [
  {
    id: 'speedrun',
    label: '速通',
    workflowId: 'builtin:speedrun',
    description: '时间紧，比如考试前：先抓住最要紧的内容，尽快能用、能答题。',
  },
  {
    id: 'apply',
    label: '应用',
    workflowId: 'builtin:apply',
    description: '为了做事情，比如写项目、做作业：边学边练，学到能用在手头的任务上。',
  },
  {
    id: 'deep',
    label: '长期积累',
    workflowId: 'builtin:deep',
    description: '不赶时间，想真正弄懂：慢慢搭起知识之间的联系，定期复习。',
  },
]

export const GUIDANCE_CHOICES: readonly Option[] = [
  { value: 'tell', label: '直接讲' },
  { value: 'hint', label: '给提示' },
  { value: 'ask', label: '只提问' },
]

/** How a workflow is shown: the goal type of a built-in one, otherwise its id, which names a course's or the person's own. */
export function workflowText(workflowId: string): string {
  return GOAL_CHOICES.find((choice) => choice.workflowId === workflowId)?.label ?? workflowId
}

export function guidanceText(guidance: string): string {
  return GUIDANCE_CHOICES.find((choice) => choice.value === guidance)?.label ?? guidance
}

/** The workflows to choose from: the three built-in ones, and the project's own when it uses another. */
export function workflowOptions(current: string): readonly Option[] {
  const options = GOAL_CHOICES.map((choice) => ({ value: choice.workflowId, label: choice.label }))
  return options.some((option) => option.value === current)
    ? options
    : [...options, { value: current, label: current }]
}

/** What to say to Claude Code to start learning in a project. */
export function startPhrase(title: string): string {
  return `我想用 MindLink 学 ${title}`
}

/** The text of a setting the learning conversation fills in, or what to show while it has not. */
export function askedText(value: string | undefined): string {
  return value === undefined || value === '' ? '还没有填写' : value
}

/**
 * What is wrong with a course name before it is sent, or `undefined`. The service takes a course as its `scope:` tag,
 * so it may hold no whitespace.
 */
export function courseProblem(course: string): string | undefined {
  return /\s/.test(course.trim()) ? '课程名里不能有空格，可以用 - 或 _ 连接。' : undefined
}

export interface NewProjectInput {
  readonly title: string
  readonly course: string
  readonly goalType: GoalType
}

/** The body of `POST …/projects/create`: an empty course is left out. */
export function createBody(input: NewProjectInput): Record<string, unknown> {
  const course = input.course.trim()
  return {
    title: input.title.trim(),
    ...(course === '' ? {} : { course }),
    goalType: input.goalType,
  }
}

export interface SettingsInput {
  readonly title: string
  readonly course: string
  readonly workflowId: string
  readonly guidance: string
}

/**
 * The settings that changed, as the body of `POST …/projects/update` without its id. An emptied course is cleared
 * with `null`; an unchanged setting is not sent.
 */
export function settingsPatch(project: Project, input: SettingsInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const title = input.title.trim()
  if (title !== project.title) patch['title'] = title
  const course = input.course.trim()
  if (course !== (project.course ?? '')) patch['course'] = course === '' ? null : course
  if (input.workflowId !== project.workflowId) patch['workflowId'] = input.workflowId
  if (input.guidance !== project.guidance) patch['guidance'] = input.guidance
  return patch
}

const PROJECTS = `${SCENE_API}/projects`

/** The calls the project pages make, over the shell's request client. */
export function projectApi(api: Client) {
  return {
    async list(includeArchived: boolean): Promise<readonly Project[]> {
      const answer = await api.get(includeArchived ? `${PROJECTS}?archived=include` : PROJECTS)
      return answer['projects'] as Project[]
    },
    async show(id: string): Promise<Project> {
      const answer = await api.get(`${PROJECTS}/show?id=${encodeURIComponent(id)}`)
      return answer['project'] as Project
    },
    async create(input: NewProjectInput): Promise<Project> {
      return (await api.post(`${PROJECTS}/create`, createBody(input)))['project'] as Project
    },
    async update(id: string, patch: Readonly<Record<string, unknown>>): Promise<Project> {
      return (await api.post(`${PROJECTS}/update`, { ...patch, id }))['project'] as Project
    },
    async archive(id: string, archived: boolean): Promise<Project> {
      return (await api.post(`${PROJECTS}/archive`, { id, archived }))['project'] as Project
    },
  }
}

export type ProjectApi = ReturnType<typeof projectApi>
