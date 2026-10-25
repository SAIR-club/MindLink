import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { learnStateDimensions } from '@episteme/domain-learn'
import {
  checkBlocks,
  loadBlockDirectory,
  type BlockInput,
  type BlockRegistry,
  type EngineContext,
  type ProjectSettings,
} from '@mindlink/app/blocks'
import { expect } from 'vitest'

/**
 * Blocks and projects for the engine tests: the format draft's `apply` workflow from the fixtures, plus small user
 * blocks for lean mode and agent orchestration, and a project source standing in for MindLink#10.
 */

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

export const VOCABULARY = {
  dimensions: learnStateDimensions.map((dimension) => dimension.id),
  tools: ['state_gaps', 'recent_turns', 'course_hotspots'],
}

/** A user activity with one intensity, `tell`, and no result fields unless given. */
export function activity(
  id: string,
  options: {
    readonly dimensions?: readonly string[]
    readonly cost?: 'low' | 'medium' | 'high'
    readonly intensities?: readonly string[]
    readonly result?: string
  } = {},
): BlockInput {
  const intensities = options.intensities ?? ['tell']
  const sections = intensities.map(
    (intensity) => `## ${intensity}\n\n${id} 的 ${intensity} 说明。\n`,
  )
  const text = `---
format: 1
id: ${id}
level: activity
title: 活动 ${id}
summary: 测试用的活动 ${id}。
dimensions: [${(options.dimensions ?? []).join(', ')}]
intensities: [${intensities.join(', ')}]
cost: ${options.cost ?? 'low'}
${options.result ?? 'result: {}'}
---

${sections.join('\n')}${options.result === undefined ? '' : '\n## 结果\n\n按实际情况填。\n'}
## 结束条件

做完。
`
  return { source: 'user', id, files: new Map([['BLOCK.md', text]]) }
}

export function workflow(
  id: string,
  orchestration: 'fixed' | 'agent',
  steps: readonly string[],
): BlockInput {
  const text = `---
format: 1
id: ${id}
level: workflow
title: 工作流 ${id}
summary: 测试用的工作流 ${id}。
orchestration: ${orchestration}
steps:
${steps.map((step) => `  - ${step}`).join('\n')}
---
${orchestration === 'agent' ? '\n## 编排说明\n\n缺口最大的先做。\n' : ''}`
  return { source: 'user', id, files: new Map([['WORKFLOW.md', text]]) }
}

/** The user blocks beside the fixtures. */
export const USER_BLOCKS: readonly BlockInput[] = [
  activity('light-a', { dimensions: ['exposure'] }),
  activity('light-b', { dimensions: ['articulation'] }),
  activity('heavy', { dimensions: ['evidence'], cost: 'high' }),
  activity('none'),
  activity('scored', {
    intensities: ['tell', 'ask'],
    result: `result:
  done:
    type: boolean
    required: true
  tries:
    type: integer
    min: 1
    max: 3`,
  }),
  workflow('lean-flow', 'fixed', ['use: user:light-a', 'use: user:heavy', 'use: user:light-b']),
  workflow('pick', 'agent', [
    'use: user:light-a',
    'use: user:light-b',
    'use: user:none',
    'use: user:heavy',
  ]),
]

/**
 * The fixtures and the user blocks, checked together; fails the test on any issue. A user block in `extra` replaces
 * the one with its id.
 */
export async function registryOf(extra: readonly BlockInput[] = []): Promise<BlockRegistry> {
  const inputs = [
    ...(await loadBlockDirectory(FIXTURES, 'builtin')),
    ...USER_BLOCKS.filter((block) => !extra.some((other) => other.id === block.id)),
    ...extra,
  ]
  const { registry, issues } = checkBlocks(inputs, VOCABULARY)
  expect(issues).toEqual([])
  return registry
}

/** Projects held in a map, standing in for MindLink#10's `getProject`. */
export function fakeProjects(projects: Record<string, ProjectSettings>): EngineContext['projects'] {
  return (_ports, id) => projects[id]
}
