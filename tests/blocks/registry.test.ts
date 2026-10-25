import { checkBlocks, type BlockInput } from '@mindlink/app/blocks'
import { describe, expect, it } from 'vitest'
import { FRAGMENT, PRIMITIVE, VOCABULARY, baseBlocks, edit, inputsOf } from './helpers.js'

/** The registry of the three sources (block format, section 6): namespaced, never overriding. */

const builtinPrimitive = (): BlockInput => ({
  source: 'builtin',
  id: 'p',
  files: new Map([
    ['BLOCK.md', PRIMITIVE],
    ['examples/tell.md', '---\nintensity: tell\n---\n\n### agent\n\n讲。\n'],
    ['examples/hint.md', '---\nintensity: hint\n---\n\n### agent\n\n提示。\n'],
  ]),
})

describe('the block registry', () => {
  it('keys blocks by source and id', () => {
    const { registry, issues } = checkBlocks(inputsOf(baseBlocks()), VOCABULARY)
    expect(issues).toEqual([])
    expect(registry.list().map((block) => block.key)).toEqual([
      'user:p',
      'user:a',
      'user:f',
      'user:w',
    ])
    expect(registry.get('user:w')?.level).toBe('workflow')
    expect(registry.resolve('user:a')?.key).toBe('user:a')
  })

  it('resolves a reference without a prefix to the built-in block only', () => {
    const { registry } = checkBlocks([builtinPrimitive(), ...inputsOf(baseBlocks())], VOCABULARY)
    expect(registry.resolve('p')?.key).toBe('builtin:p')
    expect(registry.resolve('a')).toBeUndefined()
  })

  it('never lets a block replace another with the same name', () => {
    const user = inputsOf(baseBlocks()).find((input) => input.id === 'p')!
    const { registry, issues } = checkBlocks([builtinPrimitive(), user], VOCABULARY)
    expect(issues.map((issue) => issue.code)).toEqual(['shadows-builtin'])
    expect(registry.get('builtin:p')).toBeDefined()
    expect(registry.get('user:p')).toBeUndefined()
  })

  it('registers neither of two blocks with one id', () => {
    const p = inputsOf(baseBlocks(), 'course').find((input) => input.id === 'p')!
    const { registry, issues } = checkBlocks([p, { ...p }], VOCABULARY)
    expect(issues.map((issue) => issue.code)).toEqual(['duplicate-id', 'duplicate-id'])
    expect(issues[0]!.related).toEqual([{ file: 'course:p/BLOCK.md', line: 3 }])
    expect(registry.list()).toEqual([])
  })

  it('allows the same name in the course and user sources', () => {
    const course = inputsOf(baseBlocks(), 'course').filter((input) => input.id === 'p')
    const course2 = course.map((input) => ({
      ...input,
      files: new Map([
        ['BLOCK.md', (input.files.get('BLOCK.md') as string).replace('tools: [t1]', 'tools: []')],
      ]),
    }))
    const { registry, issues } = checkBlocks([...course2, ...inputsOf(baseBlocks())], VOCABULARY)
    expect(issues).toEqual([])
    expect(registry.get('course:p')).toBeDefined()
    expect(registry.get('user:p')).toBeDefined()
  })

  it('leaves out a block that uses a block with issues, and says why', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': edit(PRIMITIVE, '## tell', '## Tell') }
    const { registry, issues } = checkBlocks(inputsOf(blocks), VOCABULARY)
    expect(issues.map((issue) => [issue.code, issue.file])).toEqual([
      ['unknown-section', 'user:p/BLOCK.md'],
      ['intensity-section-missing', 'user:p/BLOCK.md'],
      ['unknown-block', 'user:a/BLOCK.md'],
      ['unknown-block', 'user:f/WORKFLOW.md'],
      ['unknown-block', 'user:w/WORKFLOW.md'],
    ])
    expect(issues[2]!.message).toContain('存在但未通过校验')
    expect(registry.list()).toEqual([])
  })

  it('lets a user block use course and built-in blocks, but not the other way round', () => {
    const course: BlockInput = {
      source: 'course',
      id: 'cf',
      files: new Map([['WORKFLOW.md', FRAGMENT.replace('id: f', 'id: cf')]]),
    }
    const codes = checkBlocks([course, ...inputsOf(baseBlocks())], VOCABULARY).issues.map(
      (issue) => [issue.code, issue.file],
    )
    expect(codes).toEqual([['source-not-visible', 'course:cf/WORKFLOW.md']])
  })

  it('refuses a workflow using a primitive directly', () => {
    const blocks = baseBlocks()
    blocks.w = {
      'WORKFLOW.md': edit(
        blocks.w!['WORKFLOW.md'] as string,
        '  - use: user:f\n',
        '  - use: user:f\n  - use: user:p\n',
      ),
    }
    const issue = checkBlocks(inputsOf(blocks), VOCABULARY).issues[0]
    expect(issue).toMatchObject({ code: 'level-not-lower', file: 'user:w/WORKFLOW.md', line: 10 })
  })
})
