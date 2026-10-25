import { BLOCK_ISSUE_CODES, type BlockIssueCode, type CheckOptions } from '@mindlink/app/blocks'
import { describe, expect, it } from 'vitest'
import {
  NOTES,
  PRIMITIVE,
  WORKFLOW,
  FRAGMENT,
  baseBlocks,
  check,
  edit,
  inputsOf,
  lineOf,
  type Files,
} from './helpers.js'

/**
 * Every validation error of the block format (section 8), each from one deliberate mistake, reported at its file and
 * line. The last test makes sure no code in `BLOCK_ISSUE_CODES` is left without a case here.
 */

interface Arranged {
  readonly user?: Record<string, Files>
  readonly builtin?: Record<string, Files>
  readonly course?: Record<string, Files>
}

interface Case {
  readonly name: string
  readonly code: BlockIssueCode
  /** Changes the valid base set; returns the user blocks, plus any blocks in other sources. */
  readonly arrange: (blocks: Record<string, Files>) => Arranged | void
  readonly file: string
  /** The line, or the text whose first line it is in the file after the change, or `none` for a whole-file issue. */
  readonly at: number | { readonly text: string } | 'none'
  readonly options?: CheckOptions
}

const set = (
  blocks: Record<string, Files>,
  id: string,
  path: string,
  content: string | Uint8Array,
) => {
  blocks[id] = { ...blocks[id], [path]: content }
}
const change = (
  blocks: Record<string, Files>,
  id: string,
  path: string,
  from: string,
  to: string,
) => {
  set(blocks, id, path, edit(blocks[id]![path] as string, from, to))
}
const withExamples = (main: string): Files => ({
  'BLOCK.md': main,
  'examples/tell.md': '---\nintensity: tell\n---\n\n### agent\n\n讲。\n',
  'examples/hint.md': '---\nintensity: hint\n---\n\n### agent\n\n提示。\n',
})

const CASES: readonly Case[] = [
  // files and directories
  {
    name: 'a directory with no main file',
    code: 'missing-main-file',
    arrange: (b) => set(b, 'x', 'references/a.md', '# a\n'),
    file: 'user:x/',
    at: 'none',
  },
  {
    name: 'both main files',
    code: 'both-main-files',
    arrange: (b) => set(b, 'p', 'WORKFLOW.md', FRAGMENT),
    file: 'user:p/WORKFLOW.md',
    at: 'none',
  },
  {
    name: 'a script in the block',
    code: 'forbidden-file',
    arrange: (b) => set(b, 'p', 'scripts/run.sh', 'rm -rf /\n'),
    file: 'user:p/scripts/run.sh',
    at: 'none',
  },
  {
    name: 'a main file over 500 lines',
    code: 'file-too-large',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '做完。\n', `做完。\n${'更多。\n'.repeat(500)}`),
    file: 'user:p/BLOCK.md',
    at: 501,
  },
  {
    name: 'a file that is not UTF-8',
    code: 'encoding',
    arrange: (b) => set(b, 'a', 'references/bad.md', new Uint8Array([0xff, 0xfe, 0x41])),
    file: 'user:a/references/bad.md',
    at: 'none',
  },
  {
    name: 'an id that is not the directory name',
    code: 'dir-name-mismatch',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'id: p', 'id: q'),
    file: 'user:p/BLOCK.md',
    at: { text: 'id: q' },
  },
  // frontmatter
  {
    name: 'no frontmatter',
    code: 'frontmatter-missing',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '---\nformat', 'format'),
    file: 'user:p/BLOCK.md',
    at: 1,
  },
  {
    name: 'YAML outside the subset (an anchor)',
    code: 'frontmatter-syntax',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'title: 一步', 'title: &t 一步'),
    file: 'user:p/BLOCK.md',
    at: { text: 'title: &t' },
  },
  {
    name: 'an unknown field',
    code: 'unknown-field',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'tools: [t1]', 'tools: [t1]\ncolour: red'),
    file: 'user:p/BLOCK.md',
    at: { text: 'colour: red' },
  },
  {
    name: 'a field another level has',
    code: 'field-not-allowed',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'tools: [t1]', 'tools: [t1]\ncost: low'),
    file: 'user:p/BLOCK.md',
    at: { text: 'cost: low' },
  },
  {
    name: 'a missing required field',
    code: 'missing-field',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'summary: 一个基础动作。\n', ''),
    file: 'user:p/BLOCK.md',
    at: 1,
  },
  {
    name: 'a field of the wrong type',
    code: 'field-type',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'format: 1', 'format: "1"'),
    file: 'user:p/BLOCK.md',
    at: { text: 'format: "1"' },
  },
  {
    name: 'a title too long',
    code: 'field-format',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'title: 一步', `title: ${'长'.repeat(41)}`),
    file: 'user:p/BLOCK.md',
    at: { text: 'title: 长' },
  },
  {
    name: 'a workflow level in BLOCK.md',
    code: 'level-file-mismatch',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'level: primitive', 'level: workflow'),
    file: 'user:p/BLOCK.md',
    at: { text: 'level: workflow' },
  },
  // format version
  {
    name: 'a format newer than this build',
    code: 'format-too-new',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'format: 1', 'format: 2'),
    file: 'user:p/BLOCK.md',
    at: { text: 'format: 2' },
  },
  {
    name: 'a format no build supports',
    code: 'format-unsupported',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'format: 1', 'format: 0'),
    file: 'user:p/BLOCK.md',
    at: { text: 'format: 0' },
  },
  {
    name: 'a built-in block on an older format',
    code: 'format-outdated',
    arrange: () => ({ user: {}, builtin: { p: withExamples(PRIMITIVE.replace('user:', '')) } }),
    file: 'builtin:p/BLOCK.md',
    at: { text: 'format: 1' },
    options: { formats: { supported: [1, 2], latest: 2 } },
  },
  // dimensions, tools, references
  {
    name: 'a dimension not in the vocabulary',
    code: 'unknown-dimension',
    arrange: (b) => change(b, 'a', 'BLOCK.md', '[articulation]', '[articulation, mood]'),
    file: 'user:a/BLOCK.md',
    at: { text: 'dimensions: [articulation, mood]' },
  },
  {
    name: 'a tool that is not registered',
    code: 'unknown-tool',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'tools: [t1]', 'tools: [t1, t9]'),
    file: 'user:p/BLOCK.md',
    at: { text: 'tools: [t1, t9]' },
  },
  {
    name: 'a reference to an unknown source',
    code: 'unknown-source',
    arrange: (b) => change(b, 'w', 'WORKFLOW.md', 'use: user:f', 'use: team:f'),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'use: team:f' },
  },
  {
    name: 'a reference to no block',
    code: 'unknown-block',
    arrange: (b) => change(b, 'w', 'WORKFLOW.md', 'use: user:f', 'use: user:nope'),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'use: user:nope' },
  },
  {
    name: 'a course block using a user block',
    code: 'source-not-visible',
    arrange: (b) => ({
      user: b,
      course: { cf: { 'WORKFLOW.md': FRAGMENT.replace('id: f', 'id: cf') } },
    }),
    file: 'course:cf/WORKFLOW.md',
    at: { text: 'use: user:a' },
  },
  {
    name: 'a fragment using a workflow',
    code: 'level-not-lower',
    arrange: (b) =>
      change(b, 'f', 'WORKFLOW.md', '  - use: user:a\n', '  - use: user:a\n  - use: user:w\n'),
    file: 'user:f/WORKFLOW.md',
    at: { text: 'use: user:w' },
  },
  {
    name: 'two fragments using each other',
    code: 'cycle',
    arrange: (b) => {
      change(b, 'f', 'WORKFLOW.md', '  - use: user:a\n', '  - use: user:a\n  - use: user:g\n')
      set(
        b,
        'g',
        'WORKFLOW.md',
        FRAGMENT.replace('id: f', 'id: g').replace('use: user:a', 'use: user:f'),
      )
    },
    file: 'user:f/WORKFLOW.md',
    at: { text: 'use: user:g' },
  },
  // intensities
  {
    name: 'an intensity that does not exist',
    code: 'unknown-intensity',
    arrange: (b) => change(b, 'w', 'WORKFLOW.md', 'intensity: hint', 'intensity: shout'),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'intensity: shout' },
  },
  {
    name: 'a step at an intensity its block does not support',
    code: 'intensity-not-supported',
    arrange: (b) => change(b, 'w', 'WORKFLOW.md', 'intensity: hint', 'intensity: ask'),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'intensity: ask' },
  },
  {
    name: 'an activity supporting an intensity its primitive does not',
    code: 'intensity-not-covered',
    arrange: (b) => {
      change(b, 'a', 'BLOCK.md', 'intensities: [tell, hint]', 'intensities: [tell, hint, ask]')
      change(b, 'a', 'BLOCK.md', '## 结果', '## ask\n\n只问。\n\n## 结果')
    },
    file: 'user:a/BLOCK.md',
    at: { text: 'use: user:p' },
  },
  {
    name: 'a supported intensity with no section',
    code: 'intensity-section-missing',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## hint\n\n给提示。\n\n', ''),
    file: 'user:p/BLOCK.md',
    at: lineOf(PRIMITIVE.replace('## hint\n\n给提示。\n\n', ''), '做完。') + 1,
  },
  {
    name: 'a section for an unsupported intensity',
    code: 'intensity-section-extra',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## 结束条件', '## ask\n\n只问。\n\n## 结束条件'),
    file: 'user:p/BLOCK.md',
    at: { text: '## ask' },
  },
  // body
  {
    name: 'a section heading in the wrong case',
    code: 'unknown-section',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## tell', '## Tell'),
    file: 'user:p/BLOCK.md',
    at: { text: '## Tell' },
  },
  {
    name: 'a section twice',
    code: 'duplicate-section',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## 结束条件', '## tell\n\n再讲。\n\n## 结束条件'),
    file: 'user:p/BLOCK.md',
    at: lineOf(PRIMITIVE, '## 结束条件'),
  },
  {
    name: 'no end condition',
    code: 'section-missing',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## 结束条件\n\n做完。\n', ''),
    file: 'user:p/BLOCK.md',
    at: lineOf(PRIMITIVE, '## 结束条件'),
  },
  {
    name: 'a result section on a primitive',
    code: 'section-not-allowed',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '## 结束条件', '## 结果\n\n无。\n\n## 结束条件'),
    file: 'user:p/BLOCK.md',
    at: { text: '## 结果' },
  },
  {
    name: 'an empty section',
    code: 'section-empty',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '直接讲。\n', ''),
    file: 'user:p/BLOCK.md',
    at: { text: '## tell' },
  },
  {
    name: 'text before the first section',
    code: 'content-before-section',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '---\n\n## 通用', '---\n\n前言。\n\n## 通用'),
    file: 'user:p/BLOCK.md',
    at: { text: '前言。' },
  },
  {
    name: 'a parameter reference with no parameter',
    code: 'unknown-param-ref',
    arrange: (b) => change(b, 'p', 'BLOCK.md', '{{n}}', '{{m}}'),
    file: 'user:p/BLOCK.md',
    at: { text: '{{m}}' },
  },
  {
    name: 'a link to a missing reference',
    code: 'broken-link',
    arrange: (b) =>
      change(b, 'a', 'BLOCK.md', '## tell\n', '## tell\n\n见[别处](references/missing.md)。\n'),
    file: 'user:a/BLOCK.md',
    at: { text: 'references/missing.md' },
  },
  {
    name: 'a reference nothing links to',
    code: 'unlinked-reference',
    arrange: (b) => set(b, 'a', 'references/extra.md', '# 多余\n'),
    file: 'user:a/references/extra.md',
    at: 'none',
  },
  {
    name: 'a reference linking another',
    code: 'nested-reference-link',
    arrange: (b) => set(b, 'a', 'references/notes.md', `${NOTES}\n更多见[另一个](other.md)。\n`),
    file: 'user:a/references/notes.md',
    at: lineOf(`${NOTES}\n更多见[另一个](other.md)。\n`, 'other.md'),
  },
  // steps, parameters, results
  {
    name: 'the same step id twice',
    code: 'duplicate-step-id',
    arrange: (b) =>
      change(b, 'w', 'WORKFLOW.md', '  - id: again', '  - use: user:f\n  - id: again'),
    file: 'user:w/WORKFLOW.md',
    at: lineOf(WORKFLOW, '  - id: again'),
  },
  {
    name: 'an override of a step the fragment does not have',
    code: 'unknown-override-step',
    arrange: (b) =>
      change(
        b,
        'w',
        'WORKFLOW.md',
        '  - use: user:f\n',
        '  - use: user:f\n    overrides:\n      nope: { intensity: tell }\n',
      ),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'nope:' },
  },
  {
    name: 'a value for a parameter the block does not have',
    code: 'unknown-param',
    arrange: (b) =>
      change(
        b,
        'w',
        'WORKFLOW.md',
        '    intensity: hint',
        '    intensity: hint\n    params: { zzz: 1 }',
      ),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'params: { zzz: 1 }' },
  },
  {
    name: 'a parameter value out of range',
    code: 'param-value',
    arrange: (b) =>
      change(
        b,
        'w',
        'WORKFLOW.md',
        '    intensity: hint',
        '    intensity: hint\n    params: { k: 9 }',
      ),
    file: 'user:w/WORKFLOW.md',
    at: { text: 'params: { k: 9 }' },
  },
  {
    name: 'a parameter default out of range',
    code: 'param-default',
    arrange: (b) => change(b, 'p', 'BLOCK.md', 'default: 2', 'default: 9'),
    file: 'user:p/BLOCK.md',
    at: { text: 'default: 9' },
  },
  {
    name: 'an enum result field with no values',
    code: 'result-field',
    arrange: (b) => change(b, 'a', 'BLOCK.md', 'values: [done, skipped]', 'values: []'),
    file: 'user:a/BLOCK.md',
    at: { text: 'values: []' },
  },
  {
    name: 'required_when naming a value the field does not have',
    code: 'required-when',
    arrange: (b) => change(b, 'a', 'BLOCK.md', '{ outcome: [done] }', '{ outcome: [maybe] }'),
    file: 'user:a/BLOCK.md',
    at: { text: '[maybe]' },
  },
  // examples
  {
    name: 'an example with an unknown heading',
    code: 'example-format',
    arrange: (b) => change(b, 'a', 'examples/one.md', '### learner', '### narrator'),
    file: 'user:a/examples/one.md',
    at: { text: '### narrator' },
  },
  {
    name: 'an example at an unsupported intensity',
    code: 'example-intensity',
    arrange: (b) => change(b, 'a', 'examples/one.md', 'intensity: tell', 'intensity: ask'),
    file: 'user:a/examples/one.md',
    at: { text: 'intensity: ask' },
  },
  {
    name: 'an example result the block does not declare',
    code: 'example-result',
    arrange: (b) => change(b, 'a', 'examples/one.md', 'outcome: done', 'outcome: perhaps'),
    file: 'user:a/examples/one.md',
    at: { text: 'outcome: perhaps' },
  },
  {
    name: 'an example calling an undeclared tool',
    code: 'example-tool',
    arrange: (b) => change(b, 'a', 'examples/one.md', '### tool t1', '### tool t9'),
    file: 'user:a/examples/one.md',
    at: { text: '### tool t9' },
  },
  {
    name: 'a built-in block with no example for an intensity',
    code: 'example-missing',
    arrange: () => ({ user: {}, builtin: { p: { 'BLOCK.md': PRIMITIVE } } }),
    file: 'builtin:p/BLOCK.md',
    at: { text: 'intensities:' },
  },
  // registry
  {
    name: 'two blocks with one id in one source',
    code: 'duplicate-id',
    arrange: () => ({ user: {}, course: {} }),
    file: 'course:p/BLOCK.md',
    at: { text: 'id: p' },
  },
  {
    name: 'a user block taking a built-in name',
    code: 'shadows-builtin',
    arrange: (b) => ({ user: b, builtin: { p: withExamples(PRIMITIVE) } }),
    file: 'user:p/BLOCK.md',
    at: { text: 'id: p' },
  },
]

function fileText(inputs: ReturnType<typeof inputsOf>, file: string): string {
  const [key, ...rest] = file.split('/')
  const input = inputs.find((candidate) => `${candidate.source}:${candidate.id}` === key)!
  return input.files.get(rest.join('/')) as string
}

describe('the valid base set', () => {
  it('has no issues', () => {
    expect(check(inputsOf(baseBlocks()))).toEqual([])
  })
})

describe('each validation error', () => {
  for (const testCase of CASES) {
    it(`${testCase.code}: ${testCase.name}`, () => {
      const blocks = baseBlocks()
      const arranged = (testCase.arrange(blocks) as Arranged | undefined) ?? {}
      let inputs = [
        ...inputsOf(arranged.user ?? blocks, 'user'),
        ...inputsOf(arranged.builtin ?? {}, 'builtin'),
        ...inputsOf(arranged.course ?? {}, 'course'),
      ]
      if (testCase.code === 'duplicate-id') {
        const p = { source: 'course' as const, id: 'p', files: new Map([['BLOCK.md', PRIMITIVE]]) }
        inputs = [p, { ...p }]
      }
      const issues = check(inputs, testCase.options)
      const found = issues.filter(
        (issue) => issue.code === testCase.code && issue.file === testCase.file,
      )
      expect(found, JSON.stringify(issues, null, 2)).not.toHaveLength(0)
      const issue = found[0]!
      if (testCase.at === 'none') {
        expect(issue.line).toBeUndefined()
      } else if (typeof testCase.at === 'number') {
        expect(issue.line).toBe(testCase.at)
      } else {
        expect(issue.line).toBe(lineOf(fileText(inputs, testCase.file), testCase.at.text))
      }
      expect(issue.message).not.toBe('')
    })
  }

  it('has a case for every code', () => {
    const covered = new Set(CASES.map((testCase) => testCase.code))
    expect(BLOCK_ISSUE_CODES.filter((code) => !covered.has(code))).toEqual([])
  })
})

describe('reporting', () => {
  it('reports many problems in one pass', () => {
    const blocks = baseBlocks()
    change(blocks, 'p', 'BLOCK.md', 'tools: [t1]', 'tools: [t9]\ncolour: red')
    change(blocks, 'p', 'BLOCK.md', '## tell', '## Tell')
    const codes = check(inputsOf(blocks)).map((issue) => issue.code)
    expect(codes).toEqual(
      expect.arrayContaining(['unknown-tool', 'unknown-field', 'unknown-section']),
    )
  })

  it('gives the column of a YAML problem', () => {
    const blocks = baseBlocks()
    change(blocks, 'p', 'BLOCK.md', 'title: 一步', 'title: &t 一步')
    const [issue] = check(inputsOf(blocks)).filter(
      (candidate) => candidate.code === 'frontmatter-syntax',
    )
    expect(issue).toMatchObject({ line: lineOf(PRIMITIVE, 'title:'), column: 8 })
  })

  it('names the cycle and its other places', () => {
    const blocks = baseBlocks()
    change(blocks, 'f', 'WORKFLOW.md', '  - use: user:a\n', '  - use: user:a\n  - use: user:g\n')
    set(
      blocks,
      'g',
      'WORKFLOW.md',
      FRAGMENT.replace('id: f', 'id: g').replace('use: user:a', 'use: user:f'),
    )
    const cycle = check(inputsOf(blocks)).find((issue) => issue.code === 'cycle')!
    expect(cycle.message).toContain('user:f → user:g → user:f')
    expect(cycle.related).toEqual([
      { file: 'user:g/WORKFLOW.md', line: lineOf(FRAGMENT, 'use: user:a') },
    ])
  })
})
