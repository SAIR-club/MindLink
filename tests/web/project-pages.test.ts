// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createMindLink, type MindLink } from '../../apps/mindlink/web/src/app.js'
import type { Fetch } from '../../apps/mindlink/web/src/client.js'
import ProjectList from '../../apps/mindlink/web/src/features/project/ProjectList.vue'
import ProjectNew from '../../apps/mindlink/web/src/features/project/ProjectNew.vue'
import ProjectSettings from '../../apps/mindlink/web/src/features/project/ProjectSettings.vue'
import type { Project } from '../../apps/mindlink/web/src/features/project/project.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/src/refusals.js'
import { createRegistry } from '../../apps/mindlink/web/src/registry.js'

/**
 * The project pages in the shell (MindLink#10), against a small in-memory stand-in for the project REST that
 * refuses as the service does.
 */

type Json = Record<string, unknown>

let mounted: MindLink | undefined

afterEach(() => {
  mounted?.app.unmount()
  mounted = undefined
  document.body.replaceChildren()
})

const BASE = '/api/v1/scene/mindlink/projects'
const WORKFLOW: Record<string, string> = {
  speedrun: 'builtin:speedrun',
  apply: 'builtin:apply',
  deep: 'builtin:deep',
}

function backend(initial: readonly Project[] = []) {
  const projects = new Map(initial.map((project) => [project.id, project]))
  const sent: [string, Json | undefined][] = []
  let next = 1
  const refuse = (code: string) => ({ status: 422, body: { error: code, code } })
  const answer = (path: string, body: Json | undefined): { status: number; body: unknown } => {
    const url = new URL(path, 'http://x')
    if (url.pathname === BASE) {
      const all = [...projects.values()]
      return {
        status: 200,
        body: {
          projects:
            url.searchParams.get('archived') === 'include' ? all : all.filter((p) => !p.archived),
        },
      }
    }
    if (url.pathname === `${BASE}/show`) {
      const project = projects.get(url.searchParams.get('id') ?? '')
      return project === undefined
        ? refuse('project_not_found')
        : { status: 200, body: { project } }
    }
    if (url.pathname === `${BASE}/create` && body !== undefined) {
      const project: Project = {
        id: `p${next++}`,
        title: String(body['title']),
        ...(typeof body['course'] === 'string' ? { course: body['course'] } : {}),
        workflowId: WORKFLOW[String(body['goalType'])] ?? '',
        guidance: 'hint',
        delegation: false,
        createdAt: next,
        archived: false,
      }
      projects.set(project.id, project)
      return { status: 200, body: { project } }
    }
    const current = projects.get(String(body?.['id']))
    if (current === undefined) return refuse('project_not_found')
    if (url.pathname === `${BASE}/update` && body !== undefined) {
      if (current.archived) return refuse('project_archived')
      const { id: _id, ...patch } = body
      const updated: Record<string, unknown> = { ...current }
      for (const [field, value] of Object.entries(patch)) {
        if (value === null) delete updated[field]
        else updated[field] = value
      }
      projects.set(current.id, updated as unknown as Project)
      return { status: 200, body: { project: updated } }
    }
    if (url.pathname === `${BASE}/archive` && body !== undefined) {
      const project = { ...current, archived: body['archived'] === true }
      projects.set(project.id, project)
      return { status: 200, body: { project } }
    }
    return { status: 404, body: { error: 'no route', code: 'no_route' } }
  }
  const fetch: Fetch = (path, init) => {
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Json) : undefined
    sent.push([path, body])
    const { status, body: reply } = answer(path, body)
    return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(reply) })
  }
  return { projects, sent, fetch }
}

function harness(initial: readonly Project[] = []) {
  const server = backend(initial)
  const registry = createRegistry()
  registry.register({
    id: 'project',
    nav: [{ label: '学习项目', path: '/projects' }],
    routes: [
      { path: '/projects', title: '学习项目', component: ProjectList },
      { path: '/projects/new', title: '新建学习项目', component: ProjectNew },
      { path: '/projects/:id', title: '项目设置', component: ProjectSettings },
    ],
  })
  const shell = createMindLink({ registry, fetch: server.fetch, history: createMemoryHistory() })
  mounted = shell
  const root = document.createElement('div')
  document.body.append(root)
  shell.app.mount(root)
  const go = async (path: string): Promise<void> => {
    await shell.router.push(path)
    await flushPromises()
  }
  const page = (): HTMLElement => root.querySelector('main')!
  const input = (name: string): HTMLInputElement | HTMLSelectElement =>
    page().querySelector(`[name="${name}"]`)!
  const set = async (name: string, value: string): Promise<void> => {
    const field = input(name)
    field.value = value
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? 'change' : 'input'))
    await flushPromises()
  }
  const button = (text: string): HTMLButtonElement =>
    [...root.querySelectorAll('button')].find((each) => each.textContent?.trim() === text)!
  const click = async (element: HTMLElement): Promise<void> => {
    element.click()
    await flushPromises()
  }
  const submit = async (): Promise<void> => {
    page().querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()
  }
  return { root, shell, go, page, input, set, button, click, submit, server }
}

const linear: Project = {
  id: 'p-linear',
  title: '线性代数',
  course: 'MATH101',
  workflowId: 'builtin:apply',
  guidance: 'hint',
  delegation: false,
  goal: '期末考 80 分',
  createdAt: 1,
  archived: false,
}
const old: Project = { ...linear, id: 'p-old', title: '旧课', archived: true, createdAt: 2 }

describe('the project list', () => {
  it('invites creating the first project when there is none', async () => {
    const { page, go } = harness()
    await go('/projects')
    expect(page().textContent).toContain('还没有进行中的学习项目。')
    const link = [...page().querySelectorAll('a')].find(
      (each) => each.textContent === '新建第一个学习项目',
    )!
    expect(link.getAttribute('href')).toBe('/projects/new')
  })

  it('shows each project’s name, course and workflow, and archived ones only when asked', async () => {
    const { page, go, input, click } = harness([linear, old])
    await go('/projects')
    const items = () => [...page().querySelectorAll('li')].map((item) => item.textContent)
    expect(items()).toEqual(['线性代数课程：MATH101工作流：应用'])
    await click(input('archived') as HTMLInputElement)
    expect(items()).toEqual([
      '线性代数课程：MATH101工作流：应用',
      '旧课已归档课程：MATH101工作流：应用',
    ])
    expect(page().querySelector('a.project-title')!.getAttribute('href')).toBe('/projects/p-linear')
  })
})

describe('a new project', () => {
  it('explains the three goal types and creates with the chosen one, then says how to start', async () => {
    const { page, go, set, submit, server, shell } = harness()
    await go('/projects/new')
    const choices = [...page().querySelectorAll('.choice')].map((each) => each.textContent ?? '')
    expect(choices.map((text) => text.slice(0, 4))).toEqual(['速通时间', '应用为了', '长期积累'])
    await set('title', '概率论')
    await set('course', 'MATH 201')
    await submit()
    expect(page().querySelector('.form-error')!.textContent).toMatch(/空格/)
    expect(server.sent).toEqual([])
    await set('course', 'MATH201')
    const deep = page().querySelector<HTMLInputElement>('input[value="deep"]')!
    deep.click()
    await submit()
    expect(server.sent).toEqual([
      [`${BASE}/create`, { title: '概率论', course: 'MATH201', goalType: 'deep' }],
      [`${BASE}/show?id=p1`, undefined],
    ])
    expect(shell.router.currentRoute.value.fullPath).toBe('/projects/p1?created=1')
    expect(page().textContent).toContain('项目已创建，接下来这样开始')
    expect(page().textContent).toContain('host/claude-code/README.md')
    expect(page().textContent).toContain('我想用 MindLink 学 概率论')
  })

  it('asks for a name before sending anything', async () => {
    const { page, go, submit, server } = harness()
    await go('/projects/new')
    await submit()
    expect(page().querySelector('.form-error')!.textContent).toBe('请填写“项目名称”。')
    expect(server.sent).toEqual([])
  })
})

describe('a project’s settings', () => {
  it('saves the changed settings, shows what the conversation fills in, and links to delegation', async () => {
    const { page, go, set, submit, input, server } = harness([linear])
    await go('/projects/p-linear')
    expect(page().querySelector('h1')!.textContent).toBe('线性代数')
    expect(page().textContent).not.toContain('项目已创建')
    const asked = page().querySelector('.project-asked')!.textContent
    expect(asked).toBe('学习目标期末考 80 分截止时间还没有填写已有基础还没有填写')
    expect(page().querySelector('a[href="/review/delegation"]')).not.toBeNull()
    expect(page().querySelector('[name="goal"], [name="delegation"]')).toBeNull()
    expect(
      [...input('guidance').querySelectorAll('option')].map((o) => o.textContent?.trim()),
    ).toEqual(['直接讲', '给提示', '只提问'])
    await set('course', '')
    await set('workflowId', 'builtin:speedrun')
    await set('guidance', 'ask')
    await submit()
    expect(server.sent.at(-1)).toEqual([
      `${BASE}/update`,
      { course: null, workflowId: 'builtin:speedrun', guidance: 'ask', id: 'p-linear' },
    ])
    expect(page().querySelector('.form-saved')!.textContent).toBe('已保存。')
    expect(server.projects.get('p-linear')).toMatchObject({
      workflowId: 'builtin:speedrun',
      guidance: 'ask',
    })
    expect(server.projects.get('p-linear')?.course).toBeUndefined()
  })

  it('archives after asking, is read-only while archived, and restores', async () => {
    const { page, go, button, click, root, server } = harness([linear])
    await go('/projects/p-linear')
    await click(button('归档项目'))
    expect(root.querySelector('.dialog')!.textContent).toContain('归档“线性代数”？')
    await click(button('取消'))
    expect(server.projects.get('p-linear')?.archived).toBe(false)
    await click(button('归档项目'))
    await click(root.querySelector<HTMLButtonElement>('.dialog button.danger')!)
    expect(server.projects.get('p-linear')?.archived).toBe(true)
    expect(page().textContent).toContain('这个项目已归档，设置不能修改。')
    expect(page().querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true)
    expect(button('保存设置')).toBeUndefined()
    await click(button('恢复项目'))
    expect(server.projects.get('p-linear')?.archived).toBe(false)
    expect(button('保存设置')).toBeDefined()
  })

  it('shows a refusal in Chinese', async () => {
    const { page, go } = harness()
    await go('/projects/nowhere')
    expect(page().textContent).toContain(REFUSAL_TEXT['project_not_found'])
  })
})
