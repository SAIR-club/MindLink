import { describe, expect, it } from 'vitest'
import { ApiError } from '../../apps/mindlink/web/client.js'
import {
  confirm,
  el,
  emptyState,
  errorState,
  form,
  list,
  loading,
} from '../../apps/mindlink/web/components/index.js'
import { REFUSAL_TEXT } from '../../apps/mindlink/web/refusals.js'
import {
  FakeDocument,
  FakeText,
  all,
  asDocument,
  byTag,
  byText,
  click,
  event,
  fake,
  settle,
} from './fake-dom.js'

const doc = new FakeDocument()
const document = asDocument(doc)

describe('el', () => {
  it('sets attributes, adds listeners and turns strings into text nodes', () => {
    let clicked = 0
    const node = fake(
      el(
        document,
        'button',
        { type: 'button', disabled: true, hidden: false, onclick: () => clicked++ },
        'a',
        1,
        null,
      ),
    )
    expect(node.getAttribute('type')).toBe('button')
    expect(node.getAttribute('disabled')).toBe('')
    expect(node.hasAttribute('hidden')).toBe(false)
    expect(node.childNodes.every((child) => child instanceof FakeText)).toBe(true)
    expect(node.textContent).toBe('a1')
    click(node)
    expect(clicked).toBe(1)
  })

  it('shows markup in a string as text, never as elements', () => {
    const node = fake(el(document, 'p', {}, '<img src=x onerror=alert(1)>'))
    expect(node.children).toEqual([])
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('states', () => {
  it('shows loading as a busy status', () => {
    const node = fake(loading(document))
    expect(node.getAttribute('role')).toBe('status')
    expect(node.textContent).toBe('加载中…')
  })

  it('shows an empty state with what to do about it', () => {
    const node = fake(
      emptyState(
        document,
        '还没有学习项目。',
        el(document, 'a', { href: '#/projects/new' }, '新建'),
      ),
    )
    expect(node.textContent).toBe('还没有学习项目。新建')
  })

  it('shows a refusal in Chinese with its code, and retries', () => {
    let retried = 0
    const node = fake(
      errorState(document, new ApiError(422, 'sharing_disabled', 'sharing is off'), {
        retry: () => retried++,
      }),
    )
    expect(node.getAttribute('role')).toBe('alert')
    expect(byText(node, REFUSAL_TEXT['sharing_disabled']!)).toBeDefined()
    expect(byText(node, '代码：sharing_disabled')).toBeDefined()
    expect(node.textContent).not.toContain('sharing is off')
    click(byText(node, '重试'))
    expect(retried).toBe(1)
  })

  it('shows a page’s own failure without its message', () => {
    const node = fake(errorState(document, new TypeError('x is undefined')))
    expect(node.textContent).toBe('页面出了问题，请刷新后再试。')
  })
})

describe('list', () => {
  it('renders one item per entry', () => {
    const node = fake(
      list(document, { items: ['甲', '乙'], render: (item, index) => [`${index + 1}. `, item] }),
    )
    expect(node.tagName).toBe('ul')
    expect(byTag(node, 'li').map((item) => item.textContent)).toEqual(['1. 甲', '2. 乙'])
  })

  it('shows the empty state when there is nothing', () => {
    const node = fake(list(document, { items: [], render: String, empty: '还没有线程。' }))
    expect(node.tagName).toBe('div')
    expect(node.textContent).toBe('还没有线程。')
  })
})

describe('form', () => {
  function build(onSubmit: (values: Readonly<Record<string, string>>) => unknown) {
    const node = fake(
      form(document, {
        fields: [
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
        ],
        submitLabel: '保存',
        onSubmit,
      }),
    )
    const [title, about, tier] = [
      ...byTag(node, 'input'),
      ...byTag(node, 'textarea'),
      ...byTag(node, 'select'),
    ]
    const submit = byText(node, '保存')
    const error = all(node).find((each) => each.getAttribute('role') === 'alert')!
    return { node, title: title!, about: about!, tier: tier!, submit, error }
  }

  it('labels every field and starts from the given values', () => {
    const { node, about, tier } = build(() => {})
    expect(byTag(node, 'label').map((label) => label.children[0]?.textContent)).toEqual([
      '名称',
      '说明',
      '级别',
    ])
    expect(about.value).toBe('默认')
    expect(tier.value).toBe('basic')
  })

  it('submits the values once, with the button disabled while it runs', async () => {
    const sent: Readonly<Record<string, string>>[] = []
    let finish: () => void = () => {}
    const { node, title, tier, submit } = build(
      (values) =>
        new Promise<void>((resolve) => {
          sent.push(values)
          finish = resolve
        }),
    )
    title.value = '线性代数'
    tier.value = 'activity'
    const submitted = event('submit')
    node.dispatchEvent(submitted)
    expect(submitted.defaultPrevented).toBe(true)
    expect(submit.disabled).toBe(true)
    node.dispatchEvent(event('submit'))
    finish()
    await settle()
    expect(sent).toEqual([{ title: '线性代数', about: '默认', tier: 'activity' }])
    expect(submit.disabled).toBe(false)
  })

  it('catches an empty required field before sending anything', async () => {
    const sent: unknown[] = []
    const { node, title, error } = build((values) => sent.push(values))
    title.value = '   '
    node.dispatchEvent(event('submit'))
    await settle()
    expect(sent).toEqual([])
    expect(error.textContent).toBe('请填写“名称”。')
  })

  it('shows the refusal’s Chinese text when the service says no, and clears it on the next try', async () => {
    let refuse = true
    const { node, title, error, submit } = build(() => {
      if (refuse) throw new ApiError(422, 'missing_property', 'a node needs a label')
    })
    title.value = 'x'
    node.dispatchEvent(event('submit'))
    await settle()
    expect(error.textContent).toBe(REFUSAL_TEXT['missing_property'])
    expect(submit.disabled).toBe(false)
    refuse = false
    node.dispatchEvent(event('submit'))
    await settle()
    expect(error.textContent).toBe('')
  })

  it('disables a select with nothing to offer', () => {
    const node = fake(
      form(document, {
        fields: [{ name: 'level', label: '等级', kind: 'select', options: [] }],
        onSubmit: () => {},
      }),
    )
    expect(byTag(node, 'select')[0]?.hasAttribute('disabled')).toBe(true)
  })
})

describe('confirm', () => {
  function open(spec: Parameters<typeof confirm>[1] = { message: '撤回这条发布？' }) {
    const page = new FakeDocument()
    const answer = confirm(asDocument(page), spec)
    const overlay = page.body.children[0]!
    return { page, answer, overlay }
  }

  it('asks in a modal dialog, with focus on cancel', () => {
    const { overlay } = open({
      message: '撤回这条发布？',
      detail: '同学将看不到它。',
      confirmLabel: '撤回',
      danger: true,
    })
    const dialog = all(overlay).find((node) => node.getAttribute('role') === 'alertdialog')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(byText(dialog, '同学将看不到它。')).toBeDefined()
    expect(byText(dialog, '取消').focused).toBe(true)
    expect(byText(dialog, '撤回').getAttribute('class')).toBe('danger')
  })

  it('resolves true on confirm and removes itself', async () => {
    const { page, answer, overlay } = open()
    click(byText(overlay, '确定'))
    expect(await answer).toBe(true)
    expect(page.body.children).toEqual([])
  })

  it('resolves false on cancel, on Escape and on a click outside the box', async () => {
    const cancelled = open()
    click(byText(cancelled.overlay, '取消'))
    expect(await cancelled.answer).toBe(false)

    const escaped = open()
    escaped.overlay.dispatchEvent(event('keydown', { key: 'Escape' }))
    expect(await escaped.answer).toBe(false)
    expect(escaped.page.body.children).toEqual([])

    const outside = open()
    const inBox = event('click')
    inBox.target = outside.overlay.children[0]!
    outside.overlay.dispatchEvent(inBox)
    expect(outside.page.body.children).toEqual([outside.overlay])
    outside.overlay.dispatchEvent(event('click'))
    expect(await outside.answer).toBe(false)
  })
})
