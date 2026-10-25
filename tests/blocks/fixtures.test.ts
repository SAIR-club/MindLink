import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { learnStateDimensions } from '@episteme/domain-learn'
import {
  checkBlocks,
  checkLibrary,
  formatIssue,
  loadBlockDirectory,
  type Block,
} from '@mindlink/app/blocks'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * The two examples from the format draft on MindLink#5, `guide` and the `apply` workflow (#30's `practice`), with the
 * blocks they use, read from real files the way built-in blocks are.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const VOCABULARY = {
  dimensions: learnStateDimensions.map((dimension) => dimension.id),
  tools: ['state_gaps', 'recent_turns', 'course_hotspots'],
}

async function fixtures() {
  return checkBlocks(await loadBlockDirectory(FIXTURES, 'builtin'), VOCABULARY)
}

describe('the draft’s examples', () => {
  it('pass every check', async () => {
    const { registry, issues } = await fixtures()
    expect(issues).toEqual([])
    expect(registry.list()).toHaveLength(10)
  })

  it('read guide: its intensities, sub-steps, parameters and result fields', async () => {
    const guide = (await fixtures()).registry.get('builtin:guide')!
    expect(guide).toMatchObject<Partial<Block>>({
      level: 'activity',
      title: '引导提问',
      cost: 'low',
    })
    expect(guide.intensities).toEqual(['hint', 'ask', 'tell'])
    expect(guide.steps.map((step) => [step.id, step.use.key, step.optional])).toEqual([
      ['predict-questions', 'builtin:predict-questions', false],
      ['check', 'builtin:retell-check', true],
    ])
    expect(guide.steps[0]!.params).toMatchObject([{ name: 'count', forward: 'max_questions' }])
    expect(guide.result.map((field) => [field.name, field.type, field.requirement.kind])).toEqual([
      ['offered', 'integer', 'always'],
      ['outcome', 'enum', 'always'],
      ['picked_rank', 'integer', 'when'],
      ['basis', 'enum', 'when'],
    ])
    expect(guide.sections.map((section) => section.title)).toEqual([
      '通用',
      'hint',
      'ask',
      'tell',
      '结果',
      '结束条件',
    ])
    // Each intensity is its own section, so one can be returned without the other two.
    const ask = guide.sections.find((section) => section.title === 'ask')!.text
    expect(ask).toContain('绝不直接给出答案')
    expect(ask).not.toContain('给一条线索')
    expect(guide.references.map((reference) => reference.path)).toEqual(['references/hotspots.md'])
    expect(guide.examples.map((example) => example.intensity).sort()).toEqual([
      'ask',
      'hint',
      'tell',
    ])
  })

  it('read apply: two guides at different intensities', async () => {
    const apply = (await fixtures()).registry.get('builtin:apply')!
    expect(apply.orchestration).toBe('fixed')
    expect(apply.steps.map((step) => step.id)).toEqual([
      'goal',
      'diagnose',
      'learn',
      'practice',
      'guide-after-practice',
      'distill',
    ])
    const learn = apply.steps.find((step) => step.id === 'learn')!
    expect(learn.use.key).toBe('builtin:explain-then-guide')
    expect(learn.overrides).toMatchObject([{ stepId: 'guide', intensity: { value: 'hint' } }])
    const second = apply.steps.find((step) => step.id === 'guide-after-practice')!
    expect(second.use.key).toBe('builtin:guide')
    expect(second.intensity?.value).toBe('ask')
    expect(second.params).toMatchObject([{ name: 'max_questions', value: 2 }])
  })
})

describe('pnpm modules:check', () => {
  let dir: string | undefined
  afterEach(async () => {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('passes on the repository’s built-in blocks', async () => {
    expect((await checkLibrary()).issues).toEqual([])
  })

  it('reports a broken built-in block at its real path and line', async () => {
    dir = await mkdtemp(join(tmpdir(), 'blocks-'))
    await mkdir(join(dir, 'x'))
    await writeFile(
      join(dir, 'x', 'BLOCK.md'),
      '---\nformat: 1\nid: x\nlevel: primitive\nlevel: activity\n---\n',
    )
    const { blocks, issues } = await checkLibrary(`${dir}/`)
    expect(blocks).toBe(1)
    expect(issues).toMatchObject([
      { code: 'frontmatter-syntax', file: 'builtin:x/BLOCK.md', line: 5 },
    ])
    expect(formatIssue(issues[0]!, `${dir}/`)).toMatch(/x\/BLOCK\.md:5:1 frontmatter-syntax /)
  })
})
