import { learnStateDimensions } from '@episteme/domain-learn'
import {
  blockToolNames,
  checkBlocks,
  LIBRARY,
  loadBlockDirectory,
  nextStep,
  reportStep,
  resolvePlan,
  type Block,
  type BlockRegistry,
  type ResultValues,
} from '@mindlink/app/blocks'
import { fixedClock, memoryPorts, stubState } from '@mindlink/platform/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { fakeProjects } from './engine-helpers.js'

/** The built-in block library in `apps/mindlink/blocks/`, and the `speedrun` workflow it ships. */

let registry: BlockRegistry

beforeAll(async () => {
  const { registry: checked, issues } = checkBlocks(await loadBlockDirectory(LIBRARY, 'builtin'), {
    dimensions: learnStateDimensions.map((dimension) => dimension.id),
    tools: blockToolNames,
  })
  expect(issues).toEqual([])
  registry = checked
})

const lookup = (key: string) => registry.get(key)

function block(id: string): Block {
  const found = registry.get(`builtin:${id}`)
  if (found === undefined) throw new Error(`no built-in block ${id}`)
  return found
}

/** A block's result from its first example at that intensity: the examples are the library's test data. */
function exampleResult(id: string, intensity: string): ResultValues {
  const example = block(id).examples.find((candidate) => candidate.intensity === intensity)
  if (example === undefined) throw new Error(`${id} has no ${intensity} example`)
  return Object.fromEntries(example.result.map((field) => [field.name, field.value]))
}

describe('the built-in library', () => {
  it('holds the speedrun blocks at their levels', () => {
    expect(
      registry
        .list()
        .map((entry) => [entry.id, entry.level])
        .sort(),
    ).toEqual([
      ['diagnose', 'activity'],
      ['distill', 'activity'],
      ['explain', 'activity'],
      ['goal', 'activity'],
      ['guide', 'activity'],
      ['map', 'activity'],
      ['predict-questions', 'primitive'],
      ['recall', 'activity'],
      ['retell-check', 'primitive'],
      ['self-test', 'primitive'],
      ['speedrun', 'workflow'],
      ['submit-distill', 'primitive'],
    ])
  })

  it('gives every block all three intensities, each with an example', () => {
    for (const entry of registry.list()) {
      if (entry.level !== 'primitive' && entry.level !== 'activity') continue
      expect([...entry.intensities].sort(), entry.id).toEqual(['ask', 'hint', 'tell'])
      expect(
        [...new Set(entry.examples.map((example) => example.intensity))].sort(),
        entry.id,
      ).toEqual(['ask', 'hint', 'tell'])
    }
  })

  it('records in guide whether the learner picked, edited or ignored a predicted question', () => {
    const guide = block('guide')
    expect(guide.result.find((field) => field.name === 'outcome')).toMatchObject({
      type: 'enum',
      values: ['picked', 'edited', 'ignored'],
    })
    expect(guide.steps.map((step) => step.use.key)).toEqual([
      'builtin:predict-questions',
      'builtin:retell-check',
    ])
    expect(block('predict-questions').tools.map((tool) => tool.value)).toEqual([
      'state_gaps',
      'recent_turns',
      'course_hotspots',
    ])
  })
})

describe('builtin:speedrun', () => {
  it('resolves into a plan', () => {
    const plan = resolvePlan('builtin:speedrun', lookup, { intensity: 'ask' })
    expect(plan.orchestration).toBe('fixed')
    expect(
      plan.steps.map((step) => [step.path, step.intensity, step.intensitySource]),
    ).toMatchInlineSnapshot(`
        [
          [
            "goal",
            "ask",
            "project-default",
          ],
          [
            "diagnose",
            "ask",
            "project-default",
          ],
          [
            "map",
            "tell",
            "step",
          ],
          [
            "explain",
            "tell",
            "step",
          ],
          [
            "guide",
            "hint",
            "step",
          ],
          [
            "recall",
            "ask",
            "project-default",
          ],
          [
            "distill",
            "ask",
            "project-default",
          ],
        ]
      `)
    expect(plan.steps.find((step) => step.path === 'guide')!.params).toEqual({ max_questions: 3 })
    expect(plan.steps.find((step) => step.path === 'recall')!.params).toEqual({ count: 3 })
  })

  it('falls back to each block’s first intensity without a project default', () => {
    expect(
      resolvePlan('builtin:speedrun', lookup).steps.map((step) => [step.path, step.intensity]),
    ).toEqual([
      ['goal', 'hint'],
      ['diagnose', 'hint'],
      ['map', 'tell'],
      ['explain', 'tell'],
      ['guide', 'hint'],
      ['recall', 'hint'],
      ['distill', 'hint'],
    ])
  })

  it('runs from goal to distill, reporting each step with its example’s result', async () => {
    const ports = memoryPorts('blocks', { clock: fixedClock(1_000), state: stubState() })
    const context = {
      registry: () => registry,
      projects: fakeProjects({ p1: { workflowId: 'builtin:speedrun', guidance: 'hint' } }),
    }
    const first = await nextStep(ports, context, 'p1')
    expect(first.started).toBe(true)
    expect(first.instructions).toMatchObject({ block: 'builtin:goal', intensity: 'hint' })
    expect(first.instructions!.text).toContain('project_update')

    const seen: string[] = []
    for (let answer = first; answer.state.current !== undefined; ) {
      const current = answer.state.current
      const id = current.block.replace(/^builtin:/, '')
      seen.push(`${current.path}:${current.intensity}`)
      if (id === 'guide') {
        // Only the current intensity's section reaches the agent.
        expect(answer.instructions!.text).toContain('给一条线索')
        expect(answer.instructions!.text).not.toContain('绝不直接给出答案')
      }
      await reportStep(ports, 'p1', {
        step: current.path,
        result: exampleResult(id, current.intensity),
      })
      answer = await nextStep(ports, context, 'p1')
    }
    expect(seen).toEqual([
      'goal:hint',
      'diagnose:hint',
      'map:tell',
      'explain:tell',
      'guide:hint',
      'recall:hint',
      'distill:hint',
    ])
  })
})
