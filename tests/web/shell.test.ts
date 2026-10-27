// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, useRoute } from 'vue-router'
import { createMindLink, type MindLink } from '../../apps/mindlink/web/src/app.js'
import type { Fetch } from '../../apps/mindlink/web/src/client.js'
import AsyncView from '../../apps/mindlink/web/src/components/AsyncView.vue'
import FormView from '../../apps/mindlink/web/src/components/FormView.vue'
import { levelField } from '../../apps/mindlink/web/src/form.js'
import { useLoad } from '../../apps/mindlink/web/src/load.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/src/refusals.js'
import { createRegistry, type Feature } from '../../apps/mindlink/web/src/registry.js'
import { useApi, useConfirm, useVocabulary } from '../../apps/mindlink/web/src/services.js'

interface Answer {
  readonly status: number
  readonly body: unknown
}

let mounted: MindLink | undefined

afterEach(() => {
  mounted?.app.unmount()
  mounted = undefined
  document.body.replaceChildren()
})

/** The shell with `features`, mounted in the page, and a fetch answering each path from `answers`, as they are when asked. */
async function harness(features: readonly Feature[], answers: Record<string, Answer>) {
  const registry = createRegistry()
  for (const feature of features) registry.register(feature)
  const asked: string[] = []
  const fetch: Fetch = (path) => {
    asked.push(path)
    const answer = answers[path] ?? { status: 404, body: { error: 'no route', code: 'no_route' } }
    return Promise.resolve({
      ok: answer.status < 300,
      status: answer.status,
      json: () => Promise.resolve(answer.body),
    })
  }
  let reloads = 0
  const shell = createMindLink({
    registry,
    fetch,
    history: createMemoryHistory(),
    reload: () => reloads++,
  })
  mounted = shell
  const root = document.createElement('div')
  document.body.append(root)
  shell.app.mount(root)
  const go = async (path: string): Promise<void> => {
    await shell.router.push(path)
    await flushPromises()
  }
  await go('/')
  const page = (): HTMLElement => root.querySelector('main')!
  const notice = (): HTMLElement | null => root.querySelector('.notice')
  const link = (text: string): HTMLAnchorElement =>
    [...root.querySelectorAll('a')].find((each) => each.textContent === text)!
  return { root, shell, go, page, notice, link, asked, reloads: () => reloads }
}

const ProjectList = defineComponent(() => () => h('p', '项目列表'))

/** A page reading its project, by the route's parameter, with the query's tab. */
const ProjectPage = defineComponent(() => {
  const route = useRoute()
  const api = useApi()
  const load = useLoad(
    () =>
      api.get(`/api/v1/scene/mindlink/projects/${encodeURIComponent(String(route.params['id']))}`),
    [() => route.params['id']],
  )
  return () =>
    h(
      AsyncView,
      { load },
      {
        default: ({ data }: { data: Record<string, unknown> }) =>
          h('p', `${String(data['title'])}·${String(route.query['tab'] ?? '')}`),
      },
    )
})

const projects: Feature = {
  id: 'project',
  nav: [{ label: '学习项目', path: '/projects' }],
  routes: [
    { path: '/projects', title: '学习项目', component: ProjectList },
    { path: '/projects/:id', title: '项目', component: () => Promise.resolve(ProjectPage) },
  ],
}

const vocabulary = (levels: readonly { id: string; legacy: boolean }[]): Answer => ({
  status: 200,
  body: {
    dimensions: [
      { id: 'learn.mastery', label: '掌握程度', kind: 'ordinal', recordable: true, levels },
    ],
  },
})

describe('the shell', () => {
  it('lays out the header, the navigation from every feature and the page', async () => {
    const other: Feature = { id: 'threads', nav: [{ label: '线程', path: '/threads' }], routes: [] }
    const { root, link } = await harness([projects, other], {})
    const nav = root.querySelector('nav')!
    expect(nav.getAttribute('aria-label')).toBe('主导航')
    expect(
      [...nav.querySelectorAll('a')].map((each) => [each.textContent, each.getAttribute('href')]),
    ).toEqual([
      ['学习项目', '/projects'],
      ['线程', '/threads'],
    ])
    expect(link('MindLink').getAttribute('href')).toBe('/')
  })

  it('shows the route, with its title and the current link marked', async () => {
    const { page, go, link } = await harness([projects], {})
    await go('/projects')
    expect(page().textContent).toBe('项目列表')
    expect(document.title).toBe('学习项目 · MindLink')
    expect(link('学习项目').getAttribute('aria-current')).toBe('page')
    await go('/elsewhere')
    expect(link('学习项目').hasAttribute('aria-current')).toBe(false)
    expect(document.title).toBe('MindLink')
  })

  it('gives a page its decoded parameters, its query and the request client', async () => {
    const { page, go, asked } = await harness([projects], {
      '/api/v1/scene/mindlink/projects/p%201': { status: 200, body: { title: '线性代数' } },
    })
    await go('/projects/p%201?tab=settings')
    expect(asked).toEqual(['/api/v1/scene/mindlink/projects/p%201'])
    expect(page().textContent).toBe('线性代数·settings')
  })

  it('shows a refusal a page ran into in Chinese, and retries', async () => {
    const answers: Record<string, Answer> = {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 422,
        body: { error: 'there is no such record of yours', code: 'unknown_record' },
      },
    }
    const { page, go } = await harness([projects], answers)
    await go('/projects/p1')
    expect(page().textContent).toContain(REFUSAL_TEXT['unknown_record'])
    answers['/api/v1/scene/mindlink/projects/p1'] = { status: 200, body: { title: '概率论' } }
    page().querySelector('button')!.click()
    await flushPromises()
    expect(page().textContent).toBe('概率论·')
  })

  it('welcomes a person at the root and says when a page does not exist', async () => {
    const { page, go } = await harness([projects], {})
    expect(page().textContent).toBe('欢迎使用 MindLink。')
    await go('/nowhere/at/all')
    expect(page().textContent).toBe('找不到这个页面。回到首页')
    const empty = await harness([], {})
    expect(empty.page().textContent).toBe('欢迎使用 MindLink。还没有可用的页面。')
  })

  it('offers what the vocabulary lists when the page opens, so a changed vocabulary changes the form', async () => {
    const RecordPage = defineComponent(() => {
      const read = useVocabulary()
      const load = useLoad(read)
      return () =>
        h(
          AsyncView,
          { load },
          {
            default: ({ data }: { data: Awaited<ReturnType<typeof read>> }) =>
              h(FormView, { fields: [levelField(data, 'learn.mastery')], submit: () => {} }),
          },
        )
    })
    const levels: Feature = {
      id: 'levels',
      routes: [{ path: '/record', title: '记录', component: RecordPage }],
    }
    const answers: Record<string, Answer> = {
      '/api/v1/vocabulary': vocabulary([
        { id: 'none', legacy: false },
        { id: 'solid', legacy: false },
      ]),
    }
    const { page, go } = await harness([levels], answers)
    const offered = () => [...page().querySelectorAll('option')].map((option) => option.value)
    await go('/record')
    expect(offered()).toEqual(['none', 'solid'])
    answers['/api/v1/vocabulary'] = vocabulary([
      { id: 'none', legacy: true },
      { id: 'solid', legacy: false },
      { id: 'fluent', legacy: false },
    ])
    await go('/elsewhere')
    await go('/record')
    expect(offered()).toEqual(['solid', 'fluent'])
  })

  it('asks a person to reload when their session ends and no sign-in page is registered', async () => {
    const { page, notice, go, reloads } = await harness([projects], {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 401,
        body: { error: 'this token is not valid', code: 'unauthenticated' },
      },
    })
    expect(notice()).toBeNull()
    await go('/projects/p1')
    expect(notice()?.getAttribute('role')).toBe('alert')
    expect(notice()?.textContent).toContain('登录已过期')
    expect(page().textContent).toContain(REFUSAL_TEXT['unauthenticated'])
    notice()!.querySelector('button')!.click()
    expect(reloads()).toBe(1)
  })

  it('sends a person to the sign-in page when one is registered, remembering where they were', async () => {
    const SignIn = defineComponent(() => {
      const route = useRoute()
      return () => h('p', `登录后回到 ${String(route.query['return'] ?? '')}`)
    })
    const account: Feature = {
      id: 'account',
      routes: [{ path: '/sign-in', title: '登录', component: SignIn }],
    }
    const { shell, notice, page, go } = await harness([projects, account], {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 401,
        body: { error: 'this token is not valid', code: 'unauthenticated' },
      },
    })
    await go('/projects/p1?tab=x')
    await flushPromises()
    const { path, query } = shell.router.currentRoute.value
    expect([path, query['return']]).toEqual(['/sign-in', '/projects/p1?tab=x'])
    expect(page().textContent).toBe('登录后回到 /projects/p1?tab=x')
    expect(notice()).toBeNull()
  })

  it('shows the question a page asks, and gives the page its answer', async () => {
    let answer: Promise<boolean> | undefined
    const Withdraw = defineComponent(() => {
      const confirm = useConfirm()
      return () =>
        h(
          'button',
          { onClick: () => (answer = confirm({ message: '撤回这条发布？', danger: true })) },
          '撤回',
        )
    })
    const sharing: Feature = {
      id: 'sharing',
      routes: [{ path: '/share', title: '共享', component: Withdraw }],
    }
    const { root, go, page } = await harness([sharing], {})
    await go('/share')
    page().querySelector('button')!.click()
    await flushPromises()
    const dialog = root.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('撤回这条发布？')
    ;[...dialog.querySelectorAll('button')]
      .find((each) => each.textContent?.trim() === '确定')!
      .click()
    expect(await answer).toBe(true)
    await flushPromises()
    expect(root.querySelector('[role="alertdialog"]')).toBeNull()
  })
})

describe('the feature registry', () => {
  it('lists the routes and navigation in registration order', () => {
    const registry = createRegistry()
    registry.register(projects)
    registry.register({ id: 'threads', nav: [{ label: '线程', path: '/threads' }], routes: [] })
    expect(registry.routes().map((route) => route.path)).toEqual(['/projects', '/projects/:id'])
    expect(registry.nav().map((item) => item.label)).toEqual(['学习项目', '线程'])
  })

  it('refuses a feature registered twice, a bad id, a bad path and a route another feature has', () => {
    const registry = createRegistry()
    registry.register(projects)
    expect(() => registry.register(projects)).toThrow(/registered twice/)
    expect(() => registry.register({ id: 'Bad Id', routes: [] })).toThrow(/must be lowercase/)
    const component = ProjectList
    expect(() =>
      registry.register({ id: 'x', routes: [{ path: 'x', title: 'x', component }] }),
    ).toThrow(/must start with "\/"/)
    expect(() =>
      registry.register({ id: 'y', routes: [{ path: '/projects/:key', title: 'y', component }] }),
    ).toThrow(/already "project"'s/)
    expect(() =>
      registry.register({
        id: 'z',
        routes: [
          { path: '/z', title: 'z', component },
          { path: '/z/', title: 'z', component },
        ],
      }),
    ).toThrow(/already "z"'s/)
    expect(registry.features().map((feature) => feature.id)).toEqual(['project'])
  })
})
