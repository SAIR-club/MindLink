import { describe, expect, it } from 'vitest'
import type { Client } from '../../apps/mindlink/web/src/client.js'
import {
  GOAL_CHOICES,
  askedText,
  courseProblem,
  createBody,
  guidanceText,
  projectApi,
  settingsPatch,
  startPhrase,
  workflowOptions,
  workflowText,
  type Project,
} from '../../apps/mindlink/web/src/features/project/project.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/src/refusals.js'

/** The project pages' logic, as plain functions (MindLink#10). */

const project: Project = {
  id: 'p1',
  title: '线性代数',
  course: 'MATH101',
  workflowId: 'builtin:speedrun',
  guidance: 'hint',
  delegation: false,
  createdAt: 1,
  archived: false,
}

describe('what the pages call things', () => {
  it('offers the three goal types, each with its built-in workflow and a line on what it means', () => {
    expect(GOAL_CHOICES.map((choice) => [choice.id, choice.label, choice.workflowId])).toEqual([
      ['speedrun', '速通', 'builtin:speedrun'],
      ['apply', '应用', 'builtin:apply'],
      ['deep', '长期积累', 'builtin:deep'],
    ])
    for (const choice of GOAL_CHOICES) expect(choice.description).not.toBe('')
  })

  it('names built-in workflows and guidance in Chinese, and shows any other workflow by its id', () => {
    expect(workflowText('builtin:apply')).toBe('应用')
    expect(workflowText('course:math101-exam')).toBe('course:math101-exam')
    expect(['tell', 'hint', 'ask'].map(guidanceText)).toEqual(['直接讲', '给提示', '只提问'])
  })

  it('offers the built-in workflows, and keeps the project’s own when it uses another', () => {
    expect(workflowOptions('builtin:deep').map((option) => option.value)).toEqual([
      'builtin:speedrun',
      'builtin:apply',
      'builtin:deep',
    ])
    expect(workflowOptions('user:mine').at(-1)).toEqual({ value: 'user:mine', label: 'user:mine' })
  })

  it('says how to start, and what the conversation has yet to ask', () => {
    expect(startPhrase('线性代数')).toBe('我想用 MindLink 学 线性代数')
    expect(askedText(undefined)).toBe('还没有填写')
    expect(askedText('期末考 80 分')).toBe('期末考 80 分')
  })

  it('has Chinese text for every refusal the project routes give', () => {
    for (const code of ['invalid_project', 'project_not_found', 'project_archived']) {
      expect(REFUSAL_TEXT[code]).toMatch(/[一-鿿]/)
    }
  })
})

describe('what the pages send', () => {
  it('catches a course with whitespace before sending it', () => {
    expect(courseProblem('MATH 101')).toMatch(/空格/)
    expect(courseProblem('  MATH101 ')).toBeUndefined()
    expect(courseProblem('')).toBeUndefined()
  })

  it('creates with a trimmed name, and without an empty course', () => {
    expect(createBody({ title: ' 线代 ', course: ' ', goalType: 'deep' })).toEqual({
      title: '线代',
      goalType: 'deep',
    })
    expect(createBody({ title: '线代', course: 'MATH101', goalType: 'apply' })).toEqual({
      title: '线代',
      course: 'MATH101',
      goalType: 'apply',
    })
  })

  it('sends only the settings that changed, clearing an emptied course', () => {
    const same = {
      title: '线性代数',
      course: 'MATH101',
      workflowId: 'builtin:speedrun',
      guidance: 'hint',
    }
    expect(settingsPatch(project, same)).toEqual({})
    expect(settingsPatch(project, { ...same, title: '线代', course: '', guidance: 'ask' })).toEqual(
      { title: '线代', course: null, guidance: 'ask' },
    )
    expect(settingsPatch(project, { ...same, workflowId: 'builtin:deep' })).toEqual({
      workflowId: 'builtin:deep',
    })
  })

  it('calls the project REST', async () => {
    const calls: [string, string, unknown][] = []
    const client: Client = {
      get: (path) => {
        calls.push(['GET', path, undefined])
        return Promise.resolve({ projects: [project], project })
      },
      post: (path, body) => {
        calls.push(['POST', path, body])
        return Promise.resolve({ project })
      },
    }
    const api = projectApi(client)
    expect(await api.list(false)).toEqual([project])
    await api.list(true)
    expect(await api.show('a b')).toEqual(project)
    await api.create({ title: '线代', course: '', goalType: 'speedrun' })
    await api.update('p1', { guidance: 'tell' })
    await api.archive('p1', false)
    const base = '/api/v1/scene/mindlink/projects'
    expect(calls).toEqual([
      ['GET', base, undefined],
      ['GET', `${base}?archived=include`, undefined],
      ['GET', `${base}/show?id=a%20b`, undefined],
      ['POST', `${base}/create`, { title: '线代', goalType: 'speedrun' }],
      ['POST', `${base}/update`, { guidance: 'tell', id: 'p1' }],
      ['POST', `${base}/archive`, { id: 'p1', archived: false }],
    ])
  })
})
