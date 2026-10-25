import { describe, expect, it } from 'vitest'
import { PRIMITIVE, baseBlocks, check, edit, inputsOf, lineOf } from './helpers.js'
import { checkBlocks } from '@mindlink/app/blocks'

/**
 * The frontmatter's YAML subset (block format, section 3.1), seen through the blocks it is read for: what it accepts,
 * and every construct outside it reported as `frontmatter-syntax` on its own line.
 */

function withTitle(line: string): ReturnType<typeof inputsOf> {
  const blocks = baseBlocks()
  blocks.p = { 'BLOCK.md': edit(PRIMITIVE, 'title: 一步', line) }
  return inputsOf(blocks)
}

function syntaxIssue(line: string) {
  return check(withTitle(line)).find((issue) => issue.code === 'frontmatter-syntax')
}

describe('the YAML subset', () => {
  it('reads plain, quoted and escaped strings', () => {
    for (const [written, read] of [
      ['title: 一步 # a comment', '一步'],
      ["title: 'it''s'", "it's"],
      ['title: "说 \\"好\\""', '说 "好"'],
      ["title: it's fine", "it's fine"],
      ['title: "# not a comment"', '# not a comment'],
    ] as const) {
      const { registry, issues } = checkBlocks(withTitle(written), {
        dimensions: ['articulation'],
        tools: ['t1'],
      })
      expect(issues).toEqual([])
      expect(registry.get('user:p')?.title).toBe(read)
    }
  })

  it('reads nested flow values and block lists under a key at the same indent', () => {
    const blocks = baseBlocks()
    blocks.p = {
      'BLOCK.md': edit(PRIMITIVE, 'intensities: [tell, hint]', 'intensities:\n- tell\n- hint'),
    }
    expect(check(inputsOf(blocks))).toEqual([])
  })

  for (const [construct, written] of [
    ['an alias', 'title: *t'],
    ['a tag', 'title: !!str 一步'],
    ['a multi-line string', 'title: |'],
    ['a null', 'title: null'],
    ['a tilde null', 'title: ~'],
    ['a float', 'title: 1.5'],
    ['a hexadecimal number', 'title: 0x1f'],
    ['a YAML 1.1 boolean', 'title: yes'],
    ['an unquoted ": "', 'title: a: b'],
    ['an unclosed quote', 'title: "一步'],
    ['an unsupported escape', 'title: "\\x41"'],
    ['a key with no value', 'title:'],
    ['a duplicate key', 'title: 一步\ntitle: 两步'],
    ['a flow list over two lines', 'title: [a,\n  b]'],
  ] as const) {
    it(`refuses ${construct}`, () => {
      const issue = syntaxIssue(written)
      expect(issue, construct).toBeDefined()
      const last =
        written.split('\n').length > 1 && construct === 'a duplicate key' ? 'title: 两步' : 'title:'
      expect(issue!.line).toBe(lineOf(edit(PRIMITIVE, 'title: 一步', written), last))
      expect(issue!.column).toBeGreaterThan(0)
    })
  }

  it('refuses tab indentation', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': edit(PRIMITIVE, '  n: {', '\tn: {') }
    const issue = check(inputsOf(blocks)).find(
      (candidate) => candidate.code === 'frontmatter-syntax',
    )
    expect(issue?.line).toBe(lineOf(PRIMITIVE, '  n: {'))
  })

  it('refuses a top level that is not a mapping', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': '---\n- a\n---\n' }
    expect(check(inputsOf(blocks)).map((issue) => issue.code)).toContain('frontmatter-syntax')
  })
})
