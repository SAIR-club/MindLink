// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { effectScope, h, nextTick, ref } from 'vue'
import { ApiError } from '../../apps/mindlink/web/src/client.js'
import AsyncView from '../../apps/mindlink/web/src/components/AsyncView.vue'
import ConfirmDialog from '../../apps/mindlink/web/src/components/ConfirmDialog.vue'
import EmptyState from '../../apps/mindlink/web/src/components/EmptyState.vue'
import ErrorState from '../../apps/mindlink/web/src/components/ErrorState.vue'
import FormView from '../../apps/mindlink/web/src/components/FormView.vue'
import ListView from '../../apps/mindlink/web/src/components/ListView.vue'
import LoadingState from '../../apps/mindlink/web/src/components/LoadingState.vue'
import { createConfirmer } from '../../apps/mindlink/web/src/confirm.js'
import type { Field, Values } from '../../apps/mindlink/web/src/form.js'
import { useLoad } from '../../apps/mindlink/web/src/load.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/src/refusals.js'

describe('states', () => {
  it('shows loading as a busy status', () => {
    const node = mount(LoadingState)
    expect(node.get('p').attributes('role')).toBe('status')
    expect(node.text()).toBe('加载中…')
  })

  it('shows an empty state with what to do about it', () => {
    const node = mount(EmptyState, {
      props: { text: '还没有学习项目。' },
      slots: { default: () => h('a', { href: '#/projects/new' }, '新建') },
    })
    expect(node.text()).toBe('还没有学习项目。新建')
  })

  it('shows a refusal in Chinese with its code, and retries', async () => {
    let retried = 0
    const node = mount(ErrorState, {
      props: {
        error: new ApiError(422, 'sharing_disabled', 'sharing is off'),
        retry: () => retried++,
      },
    })
    expect(node.get('div').attributes('role')).toBe('alert')
    expect(node.text()).toContain(REFUSAL_TEXT['sharing_disabled'])
    expect(node.text()).toContain('代码：sharing_disabled')
    expect(node.text()).not.toContain('sharing is off')
    await node.get('button').trigger('click')
    expect(retried).toBe(1)
  })

  it('shows a page’s own failure without its message, and no retry unless given one', () => {
    const node = mount(ErrorState, { props: { error: new TypeError('x is undefined') } })
    expect(node.text()).toBe('页面出了问题，请刷新后再试。')
    expect(node.find('button').exists()).toBe(false)
  })

  it('shows markup in a string as text, never as elements', () => {
    const node = mount(EmptyState, { props: { text: '<img src=x onerror=alert(1)>' } })
    expect(node.find('img').exists()).toBe(false)
    expect(node.text()).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('the list', () => {
  it('renders one item per entry', () => {
    const node = mount(ListView, {
      props: { items: ['甲', '乙'], label: '列表' },
      slots: {
        default: ({ item, index }: { item: string; index: number }) => `${index + 1}. ${item}`,
      },
    })
    expect(node.get('ul').attributes('aria-label')).toBe('列表')
    expect(node.findAll('li').map((item) => item.text())).toEqual(['1. 甲', '2. 乙'])
  })

  it('shows the empty state, and what to do, when there is nothing', () => {
    const node = mount(ListView, {
      props: { items: [], empty: '还没有线程。' },
      slots: { 'empty-action': () => h('a', { href: '#/threads/new' }, '新建') },
    })
    expect(node.find('ul').exists()).toBe(false)
    expect(node.text()).toBe('还没有线程。新建')
  })
})

describe('the form', () => {
  const FIELDS: readonly Field[] = [
    { name: 'title', label: '名称', required: true },
    { name: 'about', label: '说明', kind: 'textarea', value: '默认' },
    {
      name: 'tier',
      label: '级别',
      kind: 'select',
      options: [
        { value: 'basic', label: '基础' },
        { value: 'activity', label: '活动' },
      ],
    },
  ]

  function build(submit: (values: Values) => unknown) {
    const node = mount(FormView, { props: { fields: FIELDS, submitLabel: '保存', submit } })
    return {
      node,
      title: node.get('input'),
      about: node.get('textarea'),
      tier: node.get('select'),
      button: node.get('button[type="submit"]'),
      error: node.get('[role="alert"]'),
    }
  }

  it('labels every field and starts from the given values', () => {
    const { node, about, tier } = build(() => {})
    expect(node.findAll('.field-label').map((label) => label.text())).toEqual([
      '名称',
      '说明',
      '级别',
    ])
    expect((about.element as HTMLTextAreaElement).value).toBe('默认')
    expect((tier.element as HTMLSelectElement).value).toBe('basic')
    expect(node.get('button').text()).toBe('保存')
  })

  it('submits the values once, with the button disabled while it runs', async () => {
    const sent: Values[] = []
    let finish: () => void = () => {}
    const { node, title, tier, button } = build(
      (values) =>
        new Promise<void>((resolve) => {
          sent.push(values)
          finish = resolve
        }),
    )
    await title.setValue('线性代数')
    await tier.setValue('activity')
    await node.get('form').trigger('submit')
    expect(button.attributes('disabled')).toBeDefined()
    await node.get('form').trigger('submit')
    finish()
    await flushPromises()
    expect(sent).toEqual([{ title: '线性代数', about: '默认', tier: 'activity' }])
    expect(button.attributes('disabled')).toBeUndefined()
  })

  it('catches an empty required field before sending anything', async () => {
    const sent: unknown[] = []
    const { node, title, error } = build((values) => sent.push(values))
    await title.setValue('   ')
    await node.get('form').trigger('submit')
    await flushPromises()
    expect(sent).toEqual([])
    expect(error.text()).toBe('请填写“名称”。')
  })

  it('shows the refusal’s Chinese text when the service says no, and clears it on the next try', async () => {
    let refuse = true
    const { node, title, error, button } = build(() => {
      if (refuse) throw new ApiError(422, 'missing_property', 'a node needs a label')
    })
    await title.setValue('x')
    await node.get('form').trigger('submit')
    await flushPromises()
    expect(error.text()).toBe(REFUSAL_TEXT['missing_property'])
    expect(button.attributes('disabled')).toBeUndefined()
    refuse = false
    await node.get('form').trigger('submit')
    await flushPromises()
    expect(error.text()).toBe('')
  })

  it('disables a select with nothing to offer', () => {
    const node = mount(FormView, {
      props: {
        fields: [{ name: 'level', label: '等级', kind: 'select', options: [] }],
        submit: () => {},
      },
    })
    expect(node.get('select').attributes('disabled')).toBeDefined()
  })
})

describe('the confirm dialog', () => {
  it('asks in a modal dialog, with focus on cancel', () => {
    const node = mount(ConfirmDialog, {
      attachTo: document.body,
      props: {
        spec: {
          message: '撤回这条发布？',
          detail: '同学将看不到它。',
          confirmLabel: '撤回',
          danger: true,
        },
      },
    })
    const dialog = node.get('[role="alertdialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(dialog.text()).toContain('同学将看不到它。')
    const [cancel, accept] = node.findAll('button')
    expect(document.activeElement).toBe(cancel?.element)
    expect(accept?.text()).toBe('撤回')
    expect(accept?.classes()).toEqual(['danger'])
    node.unmount()
  })

  it('answers true only on confirm; cancel, Escape and a click outside the box answer false', async () => {
    const node = mount(ConfirmDialog, { props: { spec: { message: '撤回这条发布？' } } })
    await node.findAll('button')[1]?.trigger('click')
    await node.findAll('button')[0]?.trigger('click')
    await node.get('.overlay').trigger('keydown', { key: 'Escape' })
    await node.get('.dialog').trigger('click')
    await node.get('.overlay').trigger('click')
    expect(node.emitted('answer')).toEqual([[true], [false], [false], [false]])
  })

  it('gives the page its answer, one question at a time', async () => {
    const confirmer = createConfirmer()
    const first = confirmer.ask({ message: '一' })
    expect(confirmer.current.value?.message).toBe('一')
    const second = confirmer.ask({ message: '二' })
    expect(await first).toBe(false)
    confirmer.answer(true)
    expect(await second).toBe(true)
    expect(confirmer.current.value).toBeUndefined()
  })
})

describe('loading', () => {
  it('shows loading, then the answer, and drops an answer that arrives after a newer load', async () => {
    const answers: ((value: string) => void)[] = []
    const id = ref('a')
    const scope = effectScope()
    const load = scope.run(() =>
      useLoad(() => new Promise<string>((resolve) => answers.push(resolve)), [id]),
    )!
    expect(load.state.value).toEqual({ status: 'loading' })
    id.value = 'b'
    await nextTick()
    expect(answers).toHaveLength(2)
    answers[1]?.('second')
    answers[0]?.('first')
    await flushPromises()
    expect(load.state.value).toEqual({ status: 'ready', data: 'second' })
    scope.stop()
  })

  it('shows a failure in Chinese with retry, and the slot once the retry succeeds', async () => {
    let fail = true
    const scope = effectScope()
    const load = scope.run(() =>
      useLoad(() =>
        fail
          ? Promise.reject(new ApiError(422, 'unknown_record', 'no such record'))
          : Promise.resolve('概率论'),
      ),
    )!
    const node = mount(AsyncView, {
      props: { load },
      slots: { default: ({ data }: { data: string }) => `项目：${data}` },
    })
    expect(node.text()).toBe('加载中…')
    await flushPromises()
    expect(node.text()).toContain(REFUSAL_TEXT['unknown_record'])
    fail = false
    await node.get('button').trigger('click')
    await flushPromises()
    expect(node.text()).toBe('项目：概率论')
    scope.stop()
  })
})
