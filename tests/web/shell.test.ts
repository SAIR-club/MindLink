import { describe, expect, it } from 'vitest'
import type { Fetch } from '../../apps/mindlink/web/client.js'
import { el } from '../../apps/mindlink/web/components/dom.js'
import { form, levelField } from '../../apps/mindlink/web/components/form.js'
import { createRegistry, type Feature } from '../../apps/mindlink/web/features.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/refusals.js'
import { start } from '../../apps/mindlink/web/shell.js'
import {
  FakeDocument,
  FakeElement,
  all,
  asDocument,
  byTag,
  byText,
  click,
  settle,
} from './fake-dom.js'

interface Answer {
  readonly status: number
  readonly body: unknown
}

/** A window whose hash the test sets, and a fetch answering each path from `answers`, as they are when asked. */
function harness(features: readonly Feature[], answers: Record<string, Answer>) {
  const registry = createRegistry()
  for (const feature of features) registry.register(feature)
  const doc = new FakeDocument()
  const root = new FakeElement('div')
  const listeners: (() => void)[] = []
  let reloads = 0
  const window = {
    location: {
      hash: '',
      reload: () => {
        reloads++
      },
    },
    addEventListener: (_type: 'hashchange', listener: () => void) => listeners.push(listener),
    removeEventListener: (_type: 'hashchange', listener: () => void) =>
      listeners.splice(listeners.indexOf(listener), 1),
  }
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
  const shell = start({
    document: asDocument(doc),
    window,
    fetch,
    registry,
    root: root as unknown as HTMLElement,
  })
  const page = (): FakeElement => all(root).find((node) => node.tagName === 'main')!
  const notice = (): FakeElement =>
    all(root).find((node) => node.getAttribute('class') === 'notice')!
  /** Goes to `hash` the way a click on a link does, and waits for the page. */
  const go = async (hash: string): Promise<void> => {
    window.location.hash = hash
    for (const listener of [...listeners]) listener()
    await settle()
  }
  return { doc, root, window, shell, page, notice, go, asked, listeners, reloads: () => reloads }
}

const projects: Feature = {
  id: 'project',
  nav: [{ label: '学习项目', path: '/projects' }],
  routes: [
    {
      path: '/projects',
      title: '学习项目',
      render: ({ document }) => el(document, 'p', {}, '项目列表'),
    },
    {
      path: '/projects/:id',
      title: '项目',
      render: async ({ document, api, params, query }) => {
        const answer = await api.get(`/api/v1/scene/mindlink/projects/${params['id'] ?? ''}`)
        return el(document, 'p', {}, `${String(answer['title'])}·${query.get('tab') ?? ''}`)
      },
    },
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
    const { root, shell } = harness([projects, other], {})
    await shell.show()
    const nav = byTag(root, 'nav')[0]!
    expect(byTag(nav, 'a').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['学习项目', '#/projects'],
      ['线程', '#/threads'],
    ])
    expect(byText(root, 'MindLink').getAttribute('href')).toBe('#/')
  })

  it('shows the route the hash names, with its title and the current link marked', async () => {
    const { doc, root, page, go } = harness([projects], {})
    await go('#/projects')
    expect(page().textContent).toBe('项目列表')
    expect(doc.title).toBe('学习项目 · MindLink')
    expect(byText(root, '学习项目').getAttribute('aria-current')).toBe('page')
    await go('#/elsewhere')
    expect(byText(root, '学习项目').hasAttribute('aria-current')).toBe(false)
  })

  it('gives a page its parameters, its query and the request client', async () => {
    const { page, go, asked } = harness([projects], {
      '/api/v1/scene/mindlink/projects/p%201': { status: 200, body: { title: '线性代数' } },
    })
    await go('#/projects/p%25201?tab=settings')
    expect(asked).toEqual(['/api/v1/scene/mindlink/projects/p%201'])
    expect(page().textContent).toBe('线性代数·settings')
  })

  it('shows loading while a page renders, and drops a page that finishes after the person moved on', async () => {
    let finish: (node: Node) => void = () => {}
    const slow: Feature = {
      id: 'slow',
      routes: [
        {
          path: '/slow',
          title: '慢',
          render: () => new Promise<Node>((resolve) => (finish = resolve)),
        },
        { path: '/fast', title: '快', render: ({ document }) => el(document, 'p', {}, '快页面') },
      ],
    }
    const { doc, page, go } = harness([slow], {})
    await go('#/slow')
    expect(page().textContent).toBe('加载中…')
    await go('#/fast')
    finish(asDocument(doc).createElement('p'))
    await settle()
    expect(page().textContent).toBe('快页面')
  })

  it('shows a refusal a page ran into in Chinese, and retries', async () => {
    const answers: Record<string, Answer> = {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 422,
        body: { error: 'there is no such record of yours', code: 'unknown_record' },
      },
    }
    const { page, go } = harness([projects], answers)
    await go('#/projects/p1')
    expect(page().textContent).toContain(REFUSAL_TEXT['unknown_record'])
    answers['/api/v1/scene/mindlink/projects/p1'] = { status: 200, body: { title: '概率论' } }
    click(byText(page(), '重试'))
    await settle()
    expect(page().textContent).toBe('概率论·')
  })

  it('welcomes a person at the root and says when a page does not exist', async () => {
    const { page, go } = harness([projects], {})
    await go('')
    expect(page().textContent).toBe('欢迎使用 MindLink。')
    await go('#/nowhere')
    expect(page().textContent).toBe('找不到这个页面。回到首页')
  })

  it('offers what the vocabulary lists when the page renders, so a changed vocabulary changes the form', async () => {
    const levels: Feature = {
      id: 'levels',
      routes: [
        {
          path: '/record',
          title: '记录',
          render: async ({ document, vocabulary }) =>
            form(document, {
              fields: [levelField(await vocabulary(), 'learn.mastery')],
              onSubmit: () => {},
            }),
        },
      ],
    }
    const answers: Record<string, Answer> = {
      '/api/v1/vocabulary': vocabulary([
        { id: 'none', legacy: false },
        { id: 'solid', legacy: false },
      ]),
    }
    const { page, go } = harness([levels], answers)
    const offered = () => byTag(page(), 'option').map((option) => option.textContent)
    await go('#/record')
    expect(offered()).toEqual(['none', 'solid'])
    answers['/api/v1/vocabulary'] = vocabulary([
      { id: 'none', legacy: true },
      { id: 'solid', legacy: false },
      { id: 'fluent', legacy: false },
    ])
    await go('#/elsewhere')
    await go('#/record')
    expect(offered()).toEqual(['solid', 'fluent'])
  })

  it('asks a person to reload when their session ends and no sign-in page is registered', async () => {
    const { page, notice, go, reloads } = harness([projects], {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 401,
        body: { error: 'this token is not valid', code: 'unauthenticated' },
      },
    })
    expect(notice().hasAttribute('hidden')).toBe(true)
    await go('#/projects/p1')
    expect(notice().hasAttribute('hidden')).toBe(false)
    expect(notice().textContent).toContain('登录已过期')
    expect(page().textContent).toContain(REFUSAL_TEXT['unauthenticated'])
    click(byText(notice(), '重新载入'))
    expect(reloads()).toBe(1)
  })

  it('sends a person to the sign-in page when one is registered, remembering where they were', async () => {
    const signIn: Feature = {
      id: 'account',
      routes: [
        {
          path: '/sign-in',
          title: '登录',
          render: ({ document, query }) =>
            el(document, 'p', {}, `登录后回到 ${query.get('return') ?? ''}`),
        },
      ],
    }
    const { window, notice, page, go } = harness([projects, signIn], {
      '/api/v1/scene/mindlink/projects/p1': {
        status: 401,
        body: { error: 'this token is not valid', code: 'unauthenticated' },
      },
    })
    await go('#/projects/p1?tab=x')
    expect(window.location.hash).toBe('#/sign-in?return=%2Fprojects%2Fp1%3Ftab%3Dx')
    await go(window.location.hash)
    expect(page().textContent).toBe('登录后回到 /projects/p1?tab=x')
    expect(notice().hasAttribute('hidden')).toBe(true)
  })

  it('lets a page navigate, and stops following the hash once closed', async () => {
    let navigate: (pattern: string, params?: Record<string, string>) => void = () => {}
    const home: Feature = {
      id: 'home',
      routes: [
        {
          path: '/',
          title: '首页',
          render: (context) => {
            navigate = context.navigate
            return el(context.document, 'p', {}, '首页')
          },
        },
      ],
    }
    const { window, shell, listeners, go } = harness([home], {})
    await go('#/')
    navigate('/projects/:id', { id: 'a b' })
    expect(window.location.hash).toBe('#/projects/a%20b')
    shell.close()
    expect(listeners).toEqual([])
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
    const render = () => {
      throw new Error('unused')
    }
    expect(() =>
      registry.register({ id: 'x', routes: [{ path: 'x', title: 'x', render }] }),
    ).toThrow(/must start with "\/"/)
    expect(() =>
      registry.register({ id: 'y', routes: [{ path: '/projects/:key', title: 'y', render }] }),
    ).toThrow(/already "project"'s/)
    expect(() =>
      registry.register({
        id: 'z',
        routes: [
          { path: '/z', title: 'z', render },
          { path: '/z/', title: 'z', render },
        ],
      }),
    ).toThrow(/already "z"'s/)
    expect(registry.features().map((feature) => feature.id)).toEqual(['project'])
  })
})
