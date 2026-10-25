import {
  checkBlocks,
  type BlockInput,
  type BlockIssue,
  type BlockSource,
  type CheckOptions,
} from '@mindlink/app/blocks'

/**
 * A small, valid set of user blocks for the validation tests: a primitive `p`, an activity `a` built on it, a
 * fragment `f` and a workflow `w`. Each test changes one file and expects one issue at one place.
 */

export const VOCABULARY = { dimensions: ['exposure', 'articulation'], tools: ['t1'] }

export type Files = Record<string, string | Uint8Array>

export const PRIMITIVE = `---
format: 1
id: p
level: primitive
title: 一步
summary: 一个基础动作。
intensities: [tell, hint]
tools: [t1]
params:
  n: { type: integer, min: 1, max: 5, default: 2 }
---

## 通用

做 {{n}} 次。

## tell

直接讲。

## hint

给提示。

## 结束条件

做完。
`

export const ACTIVITY = `---
format: 1
id: a
level: activity
title: 一个环节
summary: 一个完整的学习环节。
dimensions: [articulation]
intensities: [tell, hint]
cost: low
params:
  k: { type: integer, min: 1, max: 5, default: 3 }
steps:
  - use: user:p
    params: { n: "{{k}}" }
result:
  outcome:
    type: enum
    values: [done, skipped]
    required: true
  detail:
    type: integer
    min: 1
    max: 3
    required_when: { outcome: [done] }
---

## 通用

先做 user:p，资料见[笔记](references/notes.md)。

## tell

直接讲。

## hint

给提示。

## 结果

outcome 填 done 或 skipped。

## 结束条件

做完。
`

export const NOTES = `# 笔记

一些资料。
`

export const EXAMPLE = `---
intensity: tell
result:
  outcome: done
  detail: 1
---

### tool t1

\`\`\`json
{ "ok": true }
\`\`\`

### agent

我们开始。

### learner

好。
`

export const FRAGMENT = `---
format: 1
id: f
level: fragment
title: 一个片段
summary: 几个环节。
steps:
  - use: user:a
---

## 说明

一个片段。
`

export const WORKFLOW = `---
format: 1
id: w
level: workflow
title: 一个工作流
summary: 一次学习。
orchestration: fixed
steps:
  - use: user:f
  - id: again
    use: user:a
    intensity: hint
---

## 说明

一个工作流。
`

export function baseBlocks(): Record<string, Files> {
  return {
    p: { 'BLOCK.md': PRIMITIVE },
    a: { 'BLOCK.md': ACTIVITY, 'references/notes.md': NOTES, 'examples/one.md': EXAMPLE },
    f: { 'WORKFLOW.md': FRAGMENT },
    w: { 'WORKFLOW.md': WORKFLOW },
  }
}

export function inputsOf(
  blocks: Record<string, Files>,
  source: BlockSource = 'user',
): BlockInput[] {
  return Object.entries(blocks).map(([id, files]) => ({
    source,
    id,
    files: new Map(Object.entries(files)),
  }))
}

export function check(
  inputs: readonly BlockInput[],
  options?: CheckOptions,
): readonly BlockIssue[] {
  return checkBlocks(inputs, VOCABULARY, options).issues
}

/** The 1-based line of the first occurrence of `needle` in `text`. */
export function lineOf(text: string, needle: string): number {
  const index = text.indexOf(needle)
  if (index === -1) throw new Error(`"${needle}" is not in the text`)
  return text.slice(0, index).split('\n').length
}

/** Replaces `from` with `to` once, failing if `from` is not there, so a test cannot silently change nothing. */
export function edit(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`"${from}" is not in the text`)
  return text.replace(from, to)
}
