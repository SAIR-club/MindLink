import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBlocks } from '@mindlink/app/blocks'
import { describe, expect, it } from 'vitest'
import { PRIMITIVE, VOCABULARY, baseBlocks, edit, inputsOf } from './helpers.js'

/**
 * A block is content, never code (MindLink spec, D7): code blocks in a block's files are text, and the parser has no
 * way to run anything.
 */

const SOURCE = join(dirname(fileURLToPath(import.meta.url)), '../../apps/mindlink/src/blocks')

const CODE = [
  '```js',
  'globalThis.__blockRan = true',
  'process.exit(1)',
  '```',
  '',
  '```',
  '## ask',
  '[a link](references/missing.md)',
  '```',
  '',
  '<script>globalThis.__blockRan = true</script>',
].join('\n')

describe('code in a block', () => {
  it('is kept as text and never run', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': edit(PRIMITIVE, '做 {{n}} 次。', `做 {{n}} 次。\n\n${CODE}`) }
    const { registry, issues } = checkBlocks(inputsOf(blocks), VOCABULARY)
    expect(issues).toEqual([])
    expect((globalThis as Record<string, unknown>).__blockRan).toBeUndefined()
    const block = registry.get('user:p')!
    // The `## ask` inside the fence is not a section, and the link inside it is not a link.
    expect(block.sections.map((section) => section.title)).toEqual([
      '通用',
      'tell',
      'hint',
      '结束条件',
    ])
    expect(block.sections[0]!.text).toContain('process.exit(1)')
    expect(block.sections[0]!.text).toContain('<script>')
  })

  it('stays text in an example and in frontmatter values', () => {
    const blocks = baseBlocks()
    blocks.p = { 'BLOCK.md': edit(PRIMITIVE, 'title: 一步', 'title: "${process.exit(1)}"') }
    const { registry, issues } = checkBlocks(inputsOf(blocks), VOCABULARY)
    expect(issues).toEqual([])
    expect(registry.get('user:p')!.title).toBe('${process.exit(1)}')
  })

  it('cannot be run by the parser, which has no way to evaluate anything', async () => {
    const files = (await readdir(SOURCE)).filter((file) => file.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = await readFile(join(SOURCE, file), 'utf8')
      expect(text, file).not.toMatch(
        /\beval\s*\(|new\s+Function\b|\bimport\s*\(|node:vm|child_process|node:worker_threads/,
      )
    }
  })
})
