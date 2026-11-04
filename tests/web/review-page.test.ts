// @vitest-environment happy-dom
import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createMindLink, type MindLink } from '../../apps/mindlink/web/src/app.js'
import type { Fetch } from '../../apps/mindlink/web/src/client.js'
import DelegationPage from '../../apps/mindlink/web/src/features/understanding/DelegationPage.vue'
import { usePolling } from '../../apps/mindlink/web/src/features/understanding/poll.js'
import ReviewQueue from '../../apps/mindlink/web/src/features/understanding/ReviewQueue.vue'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/src/refusals.js'
import { createRegistry } from '../../apps/mindlink/web/src/registry.js'

/** The review page and the delegation page, mounted in the shell against a fake service (MindLink#25). */

type Json = Record<string, unknown>

const VOCABULARY = {
  dimensions: [
    {
      id: 'confidence',
      label: '把握',
      kind: 'ordinal',
      recordable: true,
      levels: [
        { id: 'low', legacy: false },
        { id: 'medium', legacy: false },
        { id: 'shaky', legacy: true },
        { id: 'high', legacy: false },
      ],
    },
  ],
}

function pending(): Json[] {
  return [
    {
      id: 'sug_q',
      proposal: { kind: 'node', nodeType: 'question', label: '为什么需要位置编码？' },
      rationale: '学习中被提出的问题',
      proposedBy: 'actor_agent_rule-based-distiller',
      proposedAt: 1,
      origin: { sourceId: 'src_1', excerpt: '为什么需要位置编码？', speaker: '学生' },
      basis: 'stated',
    },
    {
      id: 'sug_s',
      proposal: { kind: 'state', target: 'cand:sug_q', dimension: 'confidence', level: 'medium' },
      rationale: '你说"我明白了"',
      proposedBy: 'actor_agent_rule-based-distiller',
      proposedAt: 1,
      origin: { sourceId: 'src_1', excerpt: '<b>我明白了</b>', speaker: '老师' },
      basis: 'inferred',
    },
  ]
}

/** A stand-in for Episteme's REST: the queue, delegations and reviews, and every request it was sent. */
function fakeService() {
  const service = {
    suggestions: pending(),
    delegations: [] as Json[],
    reviews: [] as Json[],
    nodes: [] as Json[],
    posted: [] as { path: string; body: Json }[],
    refuse: undefined as string | undefined,
  }
  const answer = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) })
  const fetch: Fetch = (path, init) => {
    if (init.method === 'GET') {
      if (path === '/api/v1/suggestions') return answer(200, { suggestions: service.suggestions })
      if (path === '/api/v1/vocabulary') return answer(200, VOCABULARY)
      if (path === '/api/v1/delegations') return answer(200, { delegations: service.delegations })
      if (path === '/api/v1/state') return answer(200, { nodes: service.nodes })
      if (path === '/api/v1/reviews?channel=delegation') {
        return answer(200, {
          reviews: service.reviews.filter((review) => review['channel'] === 'delegation'),
        })
      }
      if (path === '/api/v1/reviews') return answer(200, { reviews: service.reviews })
      return answer(404, { code: 'no_route' })
    }
    const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as Json
    service.posted.push({ path, body })
    if (service.refuse !== undefined) return answer(422, { code: service.refuse, error: 'no' })
    if (path === '/api/v1/suggestions/decide') {
      service.suggestions = service.suggestions.filter((each) => each['id'] !== body['id'])
      if (body['action'] !== 'dismiss' && body['id'] === 'sug_q') {
        service.nodes = [{ nodeId: 'n1', label: '为什么需要位置编码？', fromSuggestion: 'sug_q' }]
      }
      return answer(200, { suggestions: service.suggestions })
    }
    if (path === '/api/v1/delegations') {
      service.delegations.push({ id: 'del_1', scope: body['scope'], grantedAt: 5 })
      return answer(200, { delegation: service.delegations.at(-1) })
    }
    const revoke = /^\/api\/v1\/delegations\/([^/]+)\/revoke$/.exec(path)
    if (revoke !== null) {
      service.delegations = service.delegations.map((each) =>
        each['id'] === revoke[1] ? { ...each, revokedAt: 9 } : each,
      )
      return answer(200, {})
    }
    const undo = /^\/api\/v1\/reviews\/([^/]+)\/undo$/.exec(path)
    if (undo !== null) {
      service.reviews.push({
        suggestionId: undo[1],
        outcome: 'undone',
        channel: 'learn-review',
        decidedAt: 20,
      })
      return answer(200, { revoked: ['ev_1'] })
    }
    return answer(404, { code: 'no_route' })
  }
  return { service, fetch }
}

let mounted: MindLink | undefined

afterEach(() => {
  mounted?.app.unmount()
  mounted = undefined
  document.body.replaceChildren()
})

async function open(path: string, fetch: Fetch) {
  const registry = createRegistry()
  registry.register({
    id: 'understanding',
    nav: [{ label: '审阅', path: '/review' }],
    routes: [
      { path: '/review', title: '审阅', component: ReviewQueue },
      { path: '/review/delegation', title: '托管确认', component: DelegationPage },
    ],
  })
  const shell = createMindLink({ registry, fetch, history: createMemoryHistory() })
  mounted = shell
  const root = document.createElement('div')
  document.body.append(root)
  shell.app.mount(root)
  await shell.router.push(path)
  await flushPromises()
  const cards = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('article.card')]
  const card = (id: string): HTMLElement => root.querySelector(`[data-suggestion="${id}"]`)!
  const button = (within: ParentNode, text: string): HTMLButtonElement =>
    [...within.querySelectorAll('button')].find((each) => each.textContent?.trim() === text)!
  const click = async (element: HTMLElement): Promise<void> => {
    element.click()
    await flushPromises()
  }
  return { root, shell, cards, card, button, click }
}

describe('the review queue', () => {
  it('shows what each suggestion proposes, who proposed it, the speaker, the words and their basis', async () => {
    const { cards, card } = await open('/review', fakeService().fetch)
    expect(cards()).toHaveLength(2)
    const question = card('sug_q')
    expect(question.querySelector('.kind')?.textContent).toBe('新问题')
    expect(question.querySelector('.basis')?.textContent?.trim()).toBe('原话')
    expect(question.textContent).toContain('学生说')
    expect(question.textContent).toContain('「为什么需要位置编码？」')
    expect(question.textContent).toContain('出处：src_1')
    expect(question.textContent).toContain('提出者：agent：材料整理（规则）')
    const state = card('sug_s')
    expect(state.querySelector('.basis')?.textContent?.trim()).toBe('推断')
    expect(state.textContent).toContain('不是你的原话')
    expect(state.textContent).toContain('老师说')
    expect(state.querySelector('.summary')?.textContent).toBe(
      '「为什么需要位置编码？」（待确认） 的 把握 改为 medium',
    )
    // Quoted words are text, never markup.
    expect(state.querySelector('b')).toBeNull()
    expect(state.textContent).toContain('<b>我明白了</b>')
  })

  it('asks to accept another one first, and accepting that frees it', async () => {
    const { service, fetch } = fakeService()
    const { card, button, click } = await open('/review', fetch)
    expect(card('sug_s').querySelector('.waiting')?.textContent).toContain(
      '先接受另一条：「为什么需要位置编码？」',
    )
    expect(button(card('sug_s'), '接受').disabled).toBe(true)
    await click(button(card('sug_q'), '接受'))
    expect(service.posted).toEqual([
      { path: '/api/v1/suggestions/decide', body: { id: 'sug_q', action: 'accept' } },
    ])
    expect(card('sug_q')).toBeNull()
    expect(card('sug_s').querySelector('.waiting')).toBeNull()
    expect(card('sug_s').querySelector('.summary')?.textContent).toBe(
      '「为什么需要位置编码？」 的 把握 改为 medium',
    )
  })

  it('modifies with only the vocabulary’s current levels, and dismisses', async () => {
    const { service, fetch } = fakeService()
    service.suggestions = service.suggestions.map((each) =>
      each['id'] === 'sug_s'
        ? {
            ...each,
            proposal: { kind: 'state', target: 'n0', dimension: 'confidence', level: 'medium' },
          }
        : each,
    )
    const { card, button, click } = await open('/review', fetch)
    await click(button(card('sug_s'), '修改后接受'))
    const select = card('sug_s').querySelector('select')!
    expect([...select.options].map((option) => option.value)).toEqual(['low', 'medium', 'high'])
    expect(select.value).toBe('medium')
    select.value = 'high'
    select.dispatchEvent(new Event('change'))
    await click(button(card('sug_s'), '按我的修改接受'))
    await click(button(card('sug_q'), '驳回'))
    expect(service.posted.map((each) => each.body)).toEqual([
      {
        id: 'sug_s',
        action: 'modify',
        proposal: { kind: 'state', target: 'n0', dimension: 'confidence', level: 'high' },
      },
      { id: 'sug_q', action: 'dismiss' },
    ])
  })

  it('shows a refusal in Chinese and keeps the suggestion', async () => {
    const { service, fetch } = fakeService()
    const { card, button, click } = await open('/review', fetch)
    service.refuse = 'unknown_suggestion'
    await click(button(card('sug_q'), '驳回'))
    expect(card('sug_q').querySelector('.card-error')?.textContent).toBe(
      REFUSAL_TEXT['unknown_suggestion'],
    )
  })

  it('marks suggestions inside a live delegation and says why they still wait', async () => {
    const { service, fetch } = fakeService()
    service.delegations = [{ id: 'del_1', scope: '*', grantedAt: 5 }]
    const { root, card } = await open('/review', fetch)
    expect(root.querySelector('.delegation-banner')?.textContent).toContain('托管确认已开启')
    expect(card('sug_q').querySelector('.delegated')?.textContent).toBe('托管中')
    expect(card('sug_q').querySelector('.delegated-note')?.textContent).toContain('开启托管之前')
  })
})

describe('polling', () => {
  it('reads again while visible and not paused', async () => {
    vi.useFakeTimers()
    try {
      let reads = 0
      let paused = false
      const page = { visibilityState: 'visible' as DocumentVisibilityState }
      const listeners: (() => void)[] = []
      const scope = effectScope()
      scope.run(() =>
        usePolling(
          () => {
            reads++
            return Promise.resolve()
          },
          {
            interval: 1000,
            paused: () => paused,
            document: {
              get visibilityState() {
                return page.visibilityState
              },
              addEventListener: (_: string, listener: () => void) => listeners.push(listener),
              removeEventListener: () => {},
            } as never,
          },
        ),
      )
      await vi.advanceTimersByTimeAsync(1000)
      expect(reads).toBe(1)
      paused = true
      await vi.advanceTimersByTimeAsync(3000)
      expect(reads).toBe(1)
      paused = false
      page.visibilityState = 'hidden'
      await vi.advanceTimersByTimeAsync(3000)
      expect(reads).toBe(1)
      page.visibilityState = 'visible'
      for (const listener of listeners) listener()
      await vi.advanceTimersByTimeAsync(0)
      expect(reads).toBe(2)
      scope.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(reads).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('delegated confirmation', () => {
  it('says what it will and never will do before turning it on, and turns it off', async () => {
    const { service, fetch } = fakeService()
    const { root, button, click } = await open('/review/delegation?scope=p1', fetch)
    expect(root.querySelector('.off')?.textContent).toContain('「学习项目 p1」的托管确认没有开启')
    await click(button(root, '开启托管'))
    const dialog = root.querySelector('[role="alertdialog"]')!
    expect(dialog.textContent).toContain('为「学习项目 p1」开启托管确认？')
    for (const words of ['替你接受', '发布', '复用', '冲突', '开启或关闭托管本身', '撤销']) {
      expect(dialog.textContent).toContain(words)
    }
    // Cancelling grants nothing.
    await click(button(dialog, '取消'))
    expect(service.posted).toEqual([])
    await click(button(root, '开启托管'))
    await click(button(root.querySelector('[role="alertdialog"]')!, '开启托管'))
    expect(service.posted).toEqual([{ path: '/api/v1/delegations', body: { scope: 'p1' } }])
    expect(root.querySelector('.on')?.textContent).toContain('「学习项目 p1」的托管确认已开启')

    await click(button(root.querySelector('.on')!, '关闭托管'))
    await click(button(root.querySelector('[role="alertdialog"]')!, '关闭托管'))
    expect(service.posted.at(-1)).toEqual({ path: '/api/v1/delegations/del_1/revoke', body: {} })
    expect(root.querySelector('.off')).not.toBeNull()
  })

  it('lists what was confirmed for the person, and undoes one', async () => {
    const { service, fetch } = fakeService()
    service.reviews = [
      { suggestionId: 'sug_x', outcome: 'accepted', channel: 'delegation', decidedAt: 10 },
      { suggestionId: 'sug_y', outcome: 'accepted', channel: 'delegation', decidedAt: 11 },
    ]
    service.nodes = [{ nodeId: 'n7', label: '多头注意力', fromSuggestion: 'sug_x' }]
    const { root, button, click } = await open('/review/delegation', fetch)
    const row = (id: string): HTMLElement => root.querySelector(`[data-suggestion="${id}"]`)!
    expect(row('sug_x').textContent).toContain('托管确认')
    expect(row('sug_x').textContent).toContain('「多头注意力」')
    await click(button(row('sug_x'), '撤销'))
    await click(button(root.querySelector('[role="alertdialog"]')!, '撤销'))
    expect(service.posted).toEqual([{ path: '/api/v1/reviews/sug_x/undo', body: {} }])
    expect(row('sug_x').textContent).toContain('已撤销')
    expect(button(row('sug_y'), '撤销')).toBeDefined()
  })
})
