import { describe, expect, it } from 'vitest'
import { PRIMITIVE, baseBlocks, check, edit, inputsOf, lineOf } from './helpers.js'
import { checkBlocks } from '@mindlink/app/blocks'

/**
 * The frontmatter's YAML (block format, section 3.1), seen through the blocks it is read for: standard YAML 1.2 as an
 * editor or Prettier writes it is accepted, and the four constructs a shared block must not use (anchors, aliases,
 * tags, merge keys) are reported as `frontmatter-syntax` on their own line.
 */

const OPTIONS = { dimensions: ['articulation'], tools: ['t1'] }

function withPrimitive(source: string): ReturnType<typeof inputsOf> {
  const blocks = baseBlocks()
  blocks.p = { 'BLOCK.md': source }
  return inputsOf(blocks)
}

function withTitle(line: string): ReturnType<typeof inputsOf> {
  return withPrimitive(edit(PRIMITIVE, 'title: 一步', line))
}

function syntaxIssue(line: string) {
  return check(withTitle(line)).find((issue) => issue.code === 'frontmatter-syntax')
}

describe('the frontmatter YAML', () => {
  it('reads plain, quoted and escaped strings', () => {
    for (const [written, read] of [
      ['title: 一步 # a comment', '一步'],
      ["title: 'it''s'", "it's"],
      ['title: "说 \\"好\\""', '说 "好"'],
      ["title: it's fine", "it's fine"],
      ['title: "# not a comment"', '# not a comment'],
      ['title: yes', 'yes'],
      ['title: "\\x41"', 'A'],
    ] as const) {
      const { registry, issues } = checkBlocks(withTitle(written), OPTIONS)
      expect(issues, written).toEqual([])
      expect(registry.get('user:p')?.title).toBe(read)
    }
  })

  it('reads nested flow values and block lists under a key at the same indent', () => {
    const source = edit(PRIMITIVE, 'intensities: [tell, hint]', 'intensities:\n- tell\n- hint')
    expect(check(withPrimitive(source))).toEqual([])
  })

  it('reads the frontmatter as Prettier writes it: a wrapped flow list and double quotes', () => {
    const source = edit(
      edit(PRIMITIVE, 'intensities: [tell, hint]', 'intensities: [\n    "tell",\n    "hint",\n  ]'),
      'tools: [t1]',
      'tools:\n  [\n    "t1",\n  ]',
    )
    const { registry, issues } = checkBlocks(withPrimitive(source), OPTIONS)
    expect(issues).toEqual([])
    expect(registry.get('user:p')?.intensities).toEqual(['tell', 'hint'])
  })

  it('reads a summary written as a block scalar', () => {
    for (const style of ['>', '>-', '|']) {
      const source = edit(
        PRIMITIVE,
        'summary: 一个基础动作。',
        `summary: ${style}\n  一个基础动作。`,
      )
      const { registry, issues } = checkBlocks(withPrimitive(source), OPTIONS)
      expect(issues, style).toEqual([])
      expect(registry.get('user:p')?.summary).toBe('一个基础动作。')
    }
  })

  for (const [construct, written, at] of [
    ['an anchor', 'title: &t 一步', 'title: &t'],
    ['an alias', 'title: *t', 'title: *t'],
    ['a tag', 'title: !t 一步', 'title: !t'],
    ['a python tag', 'title: !!python/object/apply:os.system ["x"]', 'title: !!python'],
    ['a standard tag', 'title: !!str 一步', 'title: !!str'],
    ['an anchor on a list', 'title: 一步\ncost: &c\n  - x', 'cost: &c'],
  ] as const) {
    it(`refuses ${construct} on its own line`, () => {
      const issue = syntaxIssue(written)
      expect(issue, construct).toBeDefined()
      expect(issue!.line).toBe(lineOf(edit(PRIMITIVE, 'title: 一步', written), at))
      expect(issue!.column).toBeGreaterThan(0)
    })
  }

  it('refuses a merge key on its own line', () => {
    const source = edit(PRIMITIVE, 'tools: [t1]', 'tools: [t1]\n<<: { cost: low }')
    const issue = check(withPrimitive(source)).find(
      (candidate) => candidate.code === 'frontmatter-syntax',
    )
    expect(issue?.line).toBe(lineOf(source, '<<:'))
    expect(issue?.column).toBe(1)
  })

  it('refuses an anchor inside a flow list at the anchor', () => {
    const source = edit(PRIMITIVE, 'intensities: [tell, hint]', 'intensities: [tell, &h hint]')
    const issue = check(withPrimitive(source)).find(
      (candidate) => candidate.code === 'frontmatter-syntax',
    )
    expect(issue?.line).toBe(lineOf(source, 'intensities'))
    expect(issue?.column).toBe('intensities: [tell, '.length + 1)
  })

  for (const [construct, written] of [
    ['an unclosed quote', 'title: "一步'],
    ['an unquoted ": "', 'title: a: b'],
    ['a duplicate key', 'title: 一步\ntitle: 两步'],
  ] as const) {
    it(`refuses ${construct}`, () => {
      const issue = syntaxIssue(written)
      expect(issue, construct).toBeDefined()
      const last = construct === 'a duplicate key' ? 'title: 两步' : 'title:'
      expect(issue!.line).toBe(lineOf(edit(PRIMITIVE, 'title: 一步', written), last))
      expect(issue!.column).toBeGreaterThan(0)
    })
  }

  it('refuses tab indentation', () => {
    const source = edit(PRIMITIVE, '  n: {', '\tn: {')
    const issue = check(withPrimitive(source)).find(
      (candidate) => candidate.code === 'frontmatter-syntax',
    )
    expect(issue?.line).toBe(lineOf(PRIMITIVE, '  n: {'))
  })

  it('refuses a top level that is not a mapping', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': '---\n- a\n---\n' }
    expect(check(inputsOf(blocks)).map((issue) => issue.code)).toContain('frontmatter-syntax')
  })

  it('reports a float, an empty value and a number as text where the field is not that', () => {
    for (const [written, what] of [
      ['title: 1.5', '浮点数'],
      ['title: null', '空值'],
      ['title: ~', '空值'],
      ['title:', '空值'],
      ['title: 12', '整数'],
    ] as const) {
      const issue = check(withTitle(written)).find((candidate) => candidate.code === 'field-type')
      expect(issue, written).toBeDefined()
      expect(issue!.line).toBe(lineOf(PRIMITIVE, 'title:'))
      expect(issue!.message, written).toContain(what)
    }
  })

  it('reports a float in an integer field with its line', () => {
    const source = edit(PRIMITIVE, 'format: 1', 'format: 1.5')
    const issue = check(withPrimitive(source)).find((candidate) => candidate.code === 'field-type')
    expect(issue).toMatchObject({ line: lineOf(source, 'format:'), column: 9 })
    expect(issue?.message).toContain('整数')
    expect(issue?.message).toContain('浮点数')
  })

  it('reports a float as a parameter default and as an assigned value', () => {
    const asDefault = edit(PRIMITIVE, 'default: 2', 'default: 2.5')
    expect(check(withPrimitive(asDefault))).toContainEqual(
      expect.objectContaining({ code: 'param-default', line: lineOf(asDefault, 'n: {') }),
    )
    const blocks = baseBlocks()
    blocks.a = {
      ...blocks.a,
      'BLOCK.md': edit(
        blocks.a!['BLOCK.md'] as string,
        'params: { n: "{{k}}" }',
        'params: { n: 1.5 }',
      ),
    }
    const issues = check(inputsOf(blocks))
    expect(
      issues.some((issue) => issue.code === 'field-type' && issue.message.includes('浮点数')),
    ).toBe(true)
  })
})
