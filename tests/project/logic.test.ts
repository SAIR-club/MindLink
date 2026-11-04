import {
  AGENT_WRITABLE,
  createProject,
  getProject,
  listProjects,
  parseNewProject,
  parsePatch,
  PERSON_WRITABLE,
  setArchived,
  summaryOf,
  updateProject,
} from '@mindlink/app/project'
import { fixedClock, memoryPorts, memoryRecords } from '@mindlink/platform/testing'
import { describe, expect, it } from 'vitest'

/** Learning projects against in-memory ports (MindLink#10). */

function setup() {
  const raw = memoryRecords()
  const clock = fixedClock(Date.UTC(2026, 9, 25))
  return { raw, clock, ports: memoryPorts('project', { records: raw, clock }) }
}

describe('creating a project', () => {
  it('takes its workflow from the goal type, with hint guidance and no delegation', async () => {
    const { ports, clock } = setup()
    const workflows: Record<string, string> = {}
    for (const goalType of ['speedrun', 'apply', 'deep'] as const) {
      const project = await createProject(ports, { title: goalType, goalType })
      workflows[goalType] = project.workflowId
      expect(project).toMatchObject({ guidance: 'hint', delegation: false, archived: false })
      expect(project.createdAt).toBe(clock.now())
    }
    expect(workflows).toEqual({
      speedrun: 'builtin:speedrun',
      apply: 'builtin:apply',
      deep: 'builtin:deep',
    })
  })

  it('gives projects made at the same moment different ids', async () => {
    const { ports } = setup()
    const first = await createProject(ports, { title: 'a', goalType: 'apply' })
    const second = await createProject(ports, { title: 'b', goalType: 'apply' })
    expect(first.id).not.toBe(second.id)
    expect(listProjects(ports).map((project) => project.title)).toEqual(['a', 'b'])
  })

  it('reads only a name, a course and a goal type', () => {
    expect(parseNewProject({ title: ' 线性代数 ', course: 'MATH101', goalType: 'deep' })).toEqual({
      title: '线性代数',
      course: 'MATH101',
      goalType: 'deep',
    })
    expect(() => parseNewProject({ title: 'x', goalType: 'practice' })).toThrow(/goalType/)
    expect(() => parseNewProject({ title: '  ', goalType: 'apply' })).toThrow(/title/)
    expect(() => parseNewProject({ title: 'x', course: 'two words', goalType: 'apply' })).toThrow(
      /whitespace/,
    )
  })

  it('tags its course as the project scope', async () => {
    const { ports } = setup()
    const project = await createProject(ports, {
      title: '机器学习',
      course: 'CS229',
      goalType: 'apply',
    })
    expect(summaryOf(project)).toEqual({
      scope: 'scope:CS229',
      missing: ['goal', 'deadline', 'baseline'],
    })
  })
})

describe('changing a project', () => {
  it('writes the settings it is given and clears those set to null', async () => {
    const { ports } = setup()
    const { id } = await createProject(ports, { title: 'x', course: 'C1', goalType: 'speedrun' })
    await updateProject(
      ports,
      id,
      parsePatch(
        { goal: '两周内能做期末题', deadline: '2026-11-08', guidance: 'ask', course: null },
        PERSON_WRITABLE,
      ),
    )
    const project = getProject(ports, id)
    expect(project).toMatchObject({ goal: '两周内能做期末题', deadline: '2026-11-08' })
    expect(project?.guidance).toBe('ask')
    expect(project?.course).toBeUndefined()
    await updateProject(ports, id, parsePatch({ goal: null }, PERSON_WRITABLE))
    expect(getProject(ports, id)?.goal).toBeUndefined()
  })

  it('lets an agent write back only the goal, deadline and baseline', () => {
    expect(parsePatch({ baseline: '会求导，不会矩阵' }, AGENT_WRITABLE)).toEqual({
      baseline: '会求导，不会矩阵',
    })
    for (const field of ['delegation', 'workflowId', 'guidance', 'title', 'course']) {
      expect(() => parsePatch({ [field]: true }, AGENT_WRITABLE)).toThrow(/cannot be changed/)
    }
  })

  it('refuses values out of shape', () => {
    for (const deadline of ['2026-02-30', '2026/11/08', '明天', 20261108]) {
      expect(() => parsePatch({ deadline }, AGENT_WRITABLE)).toThrow(/deadline/)
    }
    expect(() => parsePatch({ guidance: 'shout' }, PERSON_WRITABLE)).toThrow(/guidance/)
    expect(() => parsePatch({ workflowId: 'speedrun' }, PERSON_WRITABLE)).toThrow(/workflowId/)
    expect(() => parsePatch({ delegation: 'yes' }, PERSON_WRITABLE)).toThrow(/delegation/)
  })

  it('refuses a project that does not exist', async () => {
    const { ports } = setup()
    await expect(updateProject(ports, 'nope', {})).rejects.toMatchObject({
      code: 'project_not_found',
    })
  })
})

describe('archiving a project', () => {
  it('hides it from the list, keeps it readable and read-only, and restores it', async () => {
    const { ports } = setup()
    const kept = await createProject(ports, { title: 'kept', goalType: 'deep' })
    const old = await createProject(ports, { title: 'old', goalType: 'deep' })
    await setArchived(ports, old.id, true)

    expect(listProjects(ports).map((project) => project.id)).toEqual([kept.id])
    expect(listProjects(ports, { includeArchived: true })).toHaveLength(2)
    expect(getProject(ports, old.id)?.archived).toBe(true)
    await expect(updateProject(ports, old.id, { goal: 'x' })).rejects.toMatchObject({
      code: 'project_archived',
    })

    await setArchived(ports, old.id, false)
    expect(listProjects(ports)).toHaveLength(2)
  })
})

describe('workflows the library lacks', () => {
  const only =
    (...ids: string[]) =>
    () =>
      ids

  it('are refused on create, whatever the goal type', async () => {
    const { ports } = setup()
    const speedrun = only('builtin:speedrun')
    expect(
      (await createProject(ports, { title: 'x', goalType: 'speedrun' }, speedrun)).workflowId,
    ).toBe('builtin:speedrun')
    for (const goalType of ['apply', 'deep'] as const) {
      await expect(createProject(ports, { title: 'y', goalType }, speedrun)).rejects.toThrow(
        /builtin:/,
      )
    }
    expect(listProjects(ports)).toHaveLength(1)
  })

  it('are refused on update, and an unchanged missing one does not block other changes', async () => {
    const { ports } = setup()
    const { id } = await createProject(ports, { title: 'x', goalType: 'apply' })
    const speedrun = only('builtin:speedrun')
    for (const workflowId of ['builtin:apply', 'builtin:deep', 'builtin:nothing']) {
      await expect(
        updateProject(ports, id, parsePatch({ workflowId }, PERSON_WRITABLE), speedrun),
      ).rejects.toThrow(/还不能用/)
    }
    const renamed = await updateProject(
      ports,
      id,
      parsePatch({ title: 'z' }, PERSON_WRITABLE),
      speedrun,
    )
    expect(renamed).toMatchObject({ title: 'z', workflowId: 'builtin:apply' })
    const switched = await updateProject(
      ports,
      id,
      parsePatch({ workflowId: 'builtin:speedrun' }, PERSON_WRITABLE),
      speedrun,
    )
    expect(switched.workflowId).toBe('builtin:speedrun')
  })
})

describe('another feature', () => {
  it('reads a project with its own ports and cannot write one', async () => {
    const { raw, ports } = setup()
    const project = await createProject(ports, { title: 'x', goalType: 'apply' })
    const blocks = memoryPorts('blocks', { records: raw })
    expect(getProject(blocks, project.id)).toEqual(project)
    expect(listProjects(blocks)).toEqual([project])
    await expect(createProject(blocks, { title: 'y', goalType: 'apply' })).rejects.toThrow(
      /only the project feature/,
    )
  })
})

describe('what a project stores', () => {
  const SETTINGS = new Set([
    'title',
    'course',
    'workflowId',
    'guidance',
    'delegation',
    'goal',
    'deadline',
    'baseline',
    'createdAt',
    'archived',
  ])

  it('is settings only: no progress, profile or review data', async () => {
    const { raw, ports } = setup()
    const { id } = await createProject(ports, { title: 'x', course: 'C1', goalType: 'apply' })
    await updateProject(
      ports,
      id,
      parsePatch({ goal: 'g', deadline: '2026-12-01', baseline: 'b' }, PERSON_WRITABLE),
    )
    for (const field of ['progress', 'profile', 'mastery', 'dueForReview']) {
      expect(() => parsePatch({ [field]: 1 }, PERSON_WRITABLE)).toThrow(/cannot be changed/)
    }

    const stored = raw.list()
    expect(stored.map((record) => record.key)).toEqual([`project/project/${id}`])
    for (const record of stored) {
      const envelope = record.value as { schemaVersion: number; value: Record<string, unknown> }
      expect(envelope.schemaVersion).toBe(1)
      expect(Object.keys(envelope.value).filter((key) => !SETTINGS.has(key))).toEqual([])
    }
  })
})
