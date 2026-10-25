import {
  addAdjustment,
  advance,
  checkResult,
  effectivePlan,
  measureGaps,
  nextStep,
  readBlock,
  readResults,
  removeAdjustment,
  reportStep,
  resolvePlan,
  resultStatistics,
  setLean,
  stateOf,
  activeRun,
  switchIntensity,
  type BlockRegistry,
  type EngineContext,
  type ProjectSettings,
} from '@mindlink/app/blocks'
import { isRefusal, type Ports } from '@mindlink/platform'
import { fixedClock, memoryPorts, stubState } from '@mindlink/platform/testing'
import { beforeAll, describe, expect, it } from 'vitest'
import { activity, fakeProjects, registryOf, workflow } from './engine-helpers.js'

/** The block engine against in-memory ports (MindLink#9). */

let registry: BlockRegistry

beforeAll(async () => {
  registry = await registryOf()
})

const lookup = (key: string) => registry.get(key)

function engine(
  projects: Record<string, ProjectSettings>,
  provider: () => BlockRegistry = () => registry,
): EngineContext {
  return { registry: provider, projects: fakeProjects(projects) }
}

function ports(state = stubState()): Ports {
  return memoryPorts('blocks', { clock: fixedClock(1_000), state })
}

async function refusal(promise: Promise<unknown> | (() => unknown)): Promise<{ code: string }> {
  try {
    await (typeof promise === 'function' ? promise() : promise)
  } catch (error) {
    expect(isRefusal(error)).toBe(true)
    return error as { code: string }
  }
  throw new Error('expected a refusal')
}

const APPLY: ProjectSettings = { workflowId: 'builtin:apply', guidance: 'hint' }

describe('resolving a workflow into a plan', () => {
  it('expands the fragment and gives each step its path, intensity and parameters', () => {
    const plan = resolvePlan('builtin:apply', lookup, { intensity: 'hint' })
    expect(plan.orchestration).toBe('fixed')
    expect(
      plan.steps.map((step) => [step.path, step.block, step.intensity, step.intensitySource]),
    ).toEqual([
      ['goal', 'builtin:goal', 'tell', 'block-default'],
      ['diagnose', 'builtin:diagnose', 'tell', 'block-default'],
      ['learn.explain', 'builtin:explain', 'tell', 'block-default'],
      ['learn.guide', 'builtin:guide', 'hint', 'step'],
      ['practice', 'builtin:practice', 'tell', 'block-default'],
      ['guide-after-practice', 'builtin:guide', 'ask', 'step'],
      ['distill', 'builtin:distill', 'tell', 'block-default'],
    ])
    expect(plan.steps[3]!.params).toEqual({ max_questions: 3 })
    expect(plan.steps[5]!.params).toEqual({ max_questions: 2 })
  })

  it('takes the intensity from the first place that sets it', async () => {
    const reg = await registryOf([
      activity('three', { intensities: ['hint', 'ask', 'tell'] }),
      {
        source: 'user',
        id: 'frag',
        files: new Map([
          [
            'WORKFLOW.md',
            `---
format: 1
id: frag
level: fragment
title: 片段
summary: 测试用的片段。
steps:
  - id: own
    use: user:three
    intensity: tell
  - id: plain
    use: user:three
---
`,
          ],
        ]),
      },
      workflow('priority', 'fixed', [
        'id: a\n    use: user:frag\n    overrides:\n      own: { intensity: ask }',
        'id: b\n    use: user:frag',
        'id: c\n    use: user:frag\n    intensity: ask',
        'id: d\n    use: user:three',
      ]),
    ])
    const at = (defaults: { intensity?: 'tell' | 'hint' | 'ask' }) =>
      resolvePlan('user:priority', (key) => reg.get(key), defaults).steps.map((step) => [
        step.path,
        step.intensity,
        step.intensitySource,
      ])
    expect(at({ intensity: 'ask' })).toEqual([
      ['a.own', 'ask', 'step'], // the workflow's override beats the fragment's own
      ['a.plain', 'ask', 'project-default'],
      ['b.own', 'tell', 'fragment'], // the fragment's own beats the project default
      ['b.plain', 'ask', 'project-default'],
      ['c.own', 'ask', 'step'], // the workflow step's intensity reaches the whole fragment
      ['c.plain', 'ask', 'step'],
      ['d', 'ask', 'project-default'],
    ])
    // Without a project default, the block's first intensity.
    expect(at({}).at(-1)).toEqual(['d', 'hint', 'block-default'])

    // An adjustment beats the workflow; a temporary switch beats both (below, through a run).
    const plan = effectivePlan(
      resolvePlan('user:priority', (key) => reg.get(key), { intensity: 'ask' }),
      [{ kind: 'set', path: 'a.own', intensity: 'hint' }],
      (key) => reg.get(key),
    )
    expect(plan.steps[0]).toMatchObject({ intensity: 'hint', intensitySource: 'adjustment' })
  })

  it('skips the project default where the activity does not support it, without an error', () => {
    const plan = resolvePlan('builtin:apply', lookup, { intensity: 'ask' })
    expect(plan.steps[0]).toMatchObject({ intensity: 'tell', intensitySource: 'block-default' })
  })
})

describe('advancing', () => {
  it('runs a fixed workflow in order', () => {
    const plan = effectivePlan(resolvePlan('user:lean-flow', lookup), [], lookup)
    const order: string[] = []
    const done = new Set<string>()
    for (let position = advance(plan, done); !position.finished; position = advance(plan, done)) {
      order.push(position.current!.path)
      done.add(position.current!.path)
    }
    expect(order).toEqual(['light-a', 'heavy', 'light-b'])
  })

  it('skips high-cost steps in lean mode', () => {
    const plan = effectivePlan(resolvePlan('user:lean-flow', lookup), [], lookup, { lean: true })
    expect(plan.steps.map((step) => [step.path, step.skipped])).toEqual([
      ['light-a', undefined],
      ['heavy', 'lean'],
      ['light-b', undefined],
    ])
    expect(advance(plan, new Set(['light-a'])).current?.path).toBe('light-b')
  })

  it('ranks agent candidates by the gaps in their dimensions, and the ranking follows the state', () => {
    const plan = effectivePlan(resolvePlan('user:pick', lookup), [], lookup)
    const rank = (nodes: readonly (readonly string[])[]) =>
      advance(plan, new Set(), {
        gaps: measureGaps(
          nodes.map((dimensions) => ({ dimensions })),
          ['exposure', 'articulation', 'evidence'],
        ),
      }).candidates.map((candidate) => candidate.step.path)

    // Nothing recorded yet: every dimension is a full gap, so plan order, and the dimensionless one last.
    expect(rank([])).toEqual(['light-a', 'light-b', 'heavy', 'none'])
    // Exposure recorded everywhere: its activity drops to just above the dimensionless one.
    expect(rank([['exposure'], ['exposure', 'evidence']])).toEqual([
      'light-b',
      'heavy',
      'light-a',
      'none',
    ])
    // Articulation recorded too: evidence is now the largest gap.
    expect(
      rank([
        ['exposure', 'articulation'],
        ['exposure', 'articulation'],
      ]),
    ).toEqual(['heavy', 'light-a', 'light-b', 'none'])
  })

  it('writes the reason for each candidate in Chinese', () => {
    const plan = effectivePlan(resolvePlan('user:pick', lookup), [], lookup)
    const { candidates } = advance(plan, new Set(), {
      gaps: measureGaps(
        [{ dimensions: ['exposure'] }, { dimensions: [] }],
        ['exposure', 'articulation', 'evidence'],
      ),
    })
    const reason = (path: string) =>
      candidates.find((candidate) => candidate.step.path === path)!.reason
    expect(reason('light-a')).toBe('推动 exposure（2 个节点里 1 个还没有记录）；平均缺口 50%')
    expect(reason('none')).toBe('不针对具体的维度；排在有缺口的候选之后')
    expect(
      advance(plan, new Set(), { gaps: measureGaps([], ['exposure']) }).candidates[0]!.reason,
    ).toBe('推动 exposure；项目里还没有任何节点，按工作流里的顺序')
  })
})

describe('a run', () => {
  it('walks a fixed workflow, each guide at its own intensity', async () => {
    const p = ports()
    const context = engine({ p1: APPLY })
    const seen: [string, string][] = []
    for (let answer = await nextStep(p, context, 'p1'); answer.state.current !== undefined; ) {
      const current = answer.state.current
      seen.push([current.path, current.intensity])
      const result = current.block === 'builtin:guide' ? { offered: 2, outcome: 'ignored' } : {}
      await reportStep(p, 'p1', { step: current.path, result })
      answer = await nextStep(p, context, 'p1')
    }
    expect(seen).toEqual([
      ['goal', 'tell'],
      ['diagnose', 'tell'],
      ['learn.explain', 'tell'],
      ['learn.guide', 'hint'],
      ['practice', 'tell'],
      ['guide-after-practice', 'ask'],
      ['distill', 'tell'],
    ])
    expect(activeRun(p, 'p1')!.run.finishedAt).toBe(1_000)
    expect((await nextStep(p, context, 'p1')).instructions).toBeUndefined()
    expect((await nextStep(p, context, 'p1', { restart: true })).state.id).toBe('p1~2')
  })

  it('keeps its snapshot when the workflow changes under it', async () => {
    const p = ports()
    let current = registry
    const context = engine(
      { p1: { workflowId: 'user:lean-flow', guidance: 'tell' } },
      () => current,
    )
    await nextStep(p, context, 'p1')
    // The workflow is edited, and so is an activity it uses.
    current = await registryOf([
      workflow('lean-flow', 'fixed', ['use: user:light-b']),
      activity('light-a', { dimensions: ['exposure'], intensities: ['hint'] }),
    ])
    const answer = await nextStep(p, context, 'p1')
    expect(answer.state.plan.steps.map((step) => step.path)).toEqual([
      'light-a',
      'heavy',
      'light-b',
    ])
    expect(answer.state.current).toMatchObject({ path: 'light-a', intensity: 'tell' })
    expect(answer.instructions!.text).toContain('light-a 的 tell 说明')

    // A new run takes the edited workflow.
    const next = await nextStep(p, context, 'p1', { restart: true })
    expect(next.state.plan.steps.map((step) => step.path)).toEqual(['light-b'])
  })

  it('applies adjustments at the next step, for this run and the next', async () => {
    const p = ports()
    const context = engine({ p1: { workflowId: 'user:lean-flow', guidance: 'tell' } })
    await nextStep(p, context, 'p1')
    await reportStep(p, 'p1', { step: 'light-a' })

    await addAdjustment(p, context, 'p1', { kind: 'skip', path: 'heavy' })
    expect((await nextStep(p, context, 'p1')).state.current?.path).toBe('light-b')

    await addAdjustment(p, context, 'p1', {
      kind: 'insert',
      after: 'heavy',
      id: 'extra',
      use: 'user:scored',
      intensity: 'ask',
    })
    const inserted = await nextStep(p, context, 'p1')
    expect(inserted.state.current).toMatchObject({
      path: 'extra',
      block: 'user:scored',
      intensity: 'ask',
      intensitySource: 'adjustment',
    })

    await addAdjustment(p, context, 'p1', { kind: 'replace', path: 'extra', use: 'user:none' })
    expect((await nextStep(p, context, 'p1')).state.current?.block).toBe('user:none')

    // Undoing the skip brings the high-cost step back, before the inserted one.
    await removeAdjustment(p, 'p1', 0)
    expect((await nextStep(p, context, 'p1')).state.current?.path).toBe('heavy')

    // The next run starts with the project's adjustments.
    const next = await nextStep(p, context, 'p1', { restart: true })
    expect(next.state.plan.steps.map((step) => [step.path, step.block])).toEqual([
      ['light-a', 'user:light-a'],
      ['heavy', 'user:heavy'],
      ['extra', 'user:none'],
      ['light-b', 'user:light-b'],
    ])
  })

  it('refuses an adjustment that does not fit the plan', async () => {
    const p = ports()
    const context = engine({ p1: { workflowId: 'user:lean-flow', guidance: 'tell' } })
    expect(
      (await refusal(addAdjustment(p, context, 'p1', { kind: 'skip', path: 'nope' }))).code,
    ).toBe('invalid_adjustment')
    expect(
      (
        await refusal(
          addAdjustment(p, context, 'p1', { kind: 'set', path: 'light-a', intensity: 'ask' }),
        )
      ).code,
    ).toBe('invalid_adjustment')
    expect(
      (
        await refusal(
          addAdjustment(p, context, 'p1', { kind: 'insert', id: 'w', use: 'user:pick' }),
        )
      ).code,
    ).toBe('invalid_adjustment')
    // Without a prefix a reference means a built-in block, and there is no built-in `none`.
    expect(
      (
        await refusal(
          addAdjustment(p, context, 'p1', { kind: 'replace', path: 'heavy', use: 'none' }),
        )
      ).code,
    ).toBe('invalid_adjustment')
  })

  it('switches the intensity for the current step only', async () => {
    const p = ports()
    const context = engine({ p1: { workflowId: 'user:scored-flow', guidance: 'tell' } })
    const reg = await registryOf([
      workflow('scored-flow', 'fixed', [
        'id: one\n    use: user:scored',
        'id: two\n    use: user:scored',
      ]),
    ])
    const withFlow: EngineContext = { ...context, registry: () => reg }
    const first = await nextStep(p, withFlow, 'p1', { intensity: 'ask' })
    expect(first.state.current).toMatchObject({
      path: 'one',
      intensity: 'ask',
      intensitySource: 'temporary',
    })
    expect(first.instructions!.text).toContain('scored 的 ask 说明')
    expect(first.instructions!.text).not.toContain('scored 的 tell 说明')
    // It holds until the step is done.
    expect((await nextStep(p, withFlow, 'p1')).state.current?.intensity).toBe('ask')
    await reportStep(p, 'p1', { step: 'one', result: { done: true } })
    expect((await nextStep(p, withFlow, 'p1')).state.current).toMatchObject({
      path: 'two',
      intensity: 'tell',
    })
    expect((await refusal(switchIntensity(p, 'p1', 'hint'))).code).toBe('intensity_not_supported')
  })

  it('turns lean mode on mid-run', async () => {
    const p = ports()
    const context = engine({ p1: { workflowId: 'user:lean-flow', guidance: 'tell' } })
    await nextStep(p, context, 'p1')
    await reportStep(p, 'p1', { step: 'light-a' })
    const state = await setLean(p, 'p1', true)
    expect(state.current?.path).toBe('light-b')
  })

  it('lets the agent pick a candidate, ranked by the project’s nodes', async () => {
    const nodes = [
      { nodeId: 'n1', tags: ['scope:c1'] },
      { nodeId: 'n2', tags: ['scope:c1'] },
      { nodeId: 'other', tags: [] },
    ]
    const recorded: Record<string, readonly string[]> = {
      n1: ['exposure', 'articulation'],
      n2: ['exposure'],
      other: [],
    }
    const state = stubState({
      nodes: () => nodes as never,
      understandingOf: (id) =>
        (recorded[String(id)] ?? []).map((dimension) => ({ id: dimension, level: 'x' })),
    })
    const p = ports(state)
    const context = engine({ p1: { workflowId: 'user:pick', guidance: 'tell', course: 'c1' } })
    const first = await nextStep(p, context, 'p1')
    expect(first.state.position.candidates.map((candidate) => candidate.step.path)).toEqual([
      'heavy',
      'light-b',
      'light-a',
      'none',
    ])
    expect(first.orchestrationNotes).toBe('缺口最大的先做。')
    expect((await refusal(reportStep(p, 'p1', { step: 'light-b' }))).code).toBe('not_current_step')

    const picked = await nextStep(p, context, 'p1', { step: 'light-b' })
    expect(picked.state.current?.path).toBe('light-b')
    await reportStep(p, 'p1', { step: 'light-b' })
    expect((await nextStep(p, context, 'p1')).state.current?.path).toBe('heavy')
  })
})

describe('reading on demand', () => {
  it('gives the current intensity’s section only, its sub-steps and references', async () => {
    const p = ports()
    const context = engine({ p1: APPLY })
    await nextStep(p, context, 'p1')
    for (const path of ['goal', 'diagnose', 'learn.explain'])
      await reportStep(p, 'p1', { step: path })
    const { instructions } = await nextStep(p, context, 'p1')
    expect(instructions!.text).toContain('## hint')
    expect(instructions!.text).not.toContain('## ask')
    expect(instructions!.text).not.toContain('## tell')
    expect(instructions!.text).toContain('把 3 个预测问题展示给学习者')
    expect(instructions!.subSteps.map((step) => [step.id, step.block, step.optional])).toEqual([
      ['predict-questions', 'builtin:predict-questions', false],
      ['check', 'builtin:retell-check', true],
    ])
    expect(instructions!.references).toEqual([
      { path: 'references/hotspots.md', text: '同课卡点怎么用' },
    ])

    const sub = readBlock(p, 'p1', { subStep: 'predict-questions' })
    expect(sub.instructions!.intensity).toBe('hint')
    expect(sub.instructions!.text).toContain('生成 3 个问题')
    expect(sub.instructions!.text).toContain('## hint')
    expect(sub.instructions!.text).not.toContain('## tell')
    expect(sub.instructions!.text).not.toContain('## ask')
    expect(readBlock(p, 'p1', { reference: 'references/hotspots.md' }).reference).toBeTruthy()
    expect((await refusal(() => readBlock(p, 'p1', { subStep: 'nope' }))).code).toBe(
      'unknown_sub_step',
    )
  })
})

describe('results', () => {
  const guide = () => registry.get('builtin:guide')!

  it('are checked against the fields the activity declares', async () => {
    expect(
      checkResult('builtin:guide', guide().result, { offered: 3, outcome: 'ignored' }),
    ).toEqual({
      offered: 3,
      outcome: 'ignored',
    })
    const problems = (value: unknown) =>
      refusal(() => checkResult('builtin:guide', guide().result, value)).then(
        (error) => (error as unknown as Error).message,
      )
    expect(await problems({ outcome: 'picked' })).toContain('缺少必填字段 offered')
    expect(await problems({ offered: 3, outcome: 'picked' })).toContain('必须报 picked_rank')
    expect(await problems({ offered: 3, outcome: 'ignored', basis: 'state-gap' })).toContain(
      '这次不要报',
    )
    expect(await problems({ offered: 9, outcome: 'ignored' })).toContain(
      'offered 应该在 1 到 5 之间',
    )
    expect(await problems({ offered: 3, outcome: 'ignored', note: 'x' })).toContain(
      '没有结果字段 "note"',
    )
  })

  it('are counted per block, per step and per intensity', async () => {
    const p = ports()
    const context = engine({ p1: APPLY })
    const resultFor = (run: number, path: string): Record<string, unknown> => {
      if (path === 'learn.guide') {
        return run === 0
          ? { offered: 3, outcome: 'picked', picked_rank: 1, basis: 'state-gap' }
          : { offered: 3, outcome: 'rewrote', picked_rank: 2, basis: 'course-hotspot' }
      }
      return path === 'guide-after-practice' ? { offered: 2, outcome: 'ignored' } : {}
    }
    for (let run = 0; run < 2; run++) {
      let answer = await nextStep(p, context, 'p1', { restart: run > 0 })
      while (answer.state.current !== undefined) {
        const path = answer.state.current.path
        await reportStep(p, 'p1', { step: path, result: resultFor(run, path) })
        answer = await nextStep(p, context, 'p1')
      }
    }
    const stats = resultStatistics(readResults(p, 'p1'))
    const guideStats = stats.find((entry) => entry.block === 'builtin:guide')!
    expect(guideStats.reports).toBe(4)
    const outcome = guideStats.fields.find((field) => field.name === 'outcome')!
    expect(outcome).toMatchObject({
      type: 'enum',
      reported: 4,
      counts: { picked: 1, rewrote: 1, ignored: 2 },
      shares: { picked: 0.25, rewrote: 0.25, ignored: 0.5 },
    })
    expect(guideStats.fields.find((field) => field.name === 'offered')).toMatchObject({
      type: 'integer',
      mean: 2.5,
      counts: { '2': 2, '3': 2 },
    })
    expect(
      guideStats.bySteps.map((group) => [
        group.path,
        group.reports,
        (
          group.fields.find((field) => field.name === 'outcome') as {
            shares: Record<string, number>
          }
        ).shares['ignored'],
      ]),
    ).toEqual([
      ['guide-after-practice', 2, 1],
      ['learn.guide', 2, 0],
    ])
    expect(guideStats.byIntensity.map((group) => [group.intensity, group.reports])).toEqual([
      ['hint', 2],
      ['ask', 2],
    ])
    // Activities without result fields are counted too, with nothing to tally.
    expect(stats.find((entry) => entry.block === 'builtin:goal')).toMatchObject({
      reports: 2,
      fields: [],
    })
  })

  it('counts a boolean field as the share that is true', () => {
    const scored = registry.get('user:scored')!
    const entry = (done: boolean) => ({
      run: 'r',
      project: 'p',
      workflow: 'w',
      path: 's',
      block: scored.key,
      intensity: 'tell' as const,
      at: 0,
      fields: scored.result,
      values: { done },
    })
    expect(
      resultStatistics([entry(true), entry(false), entry(true), entry(true)])[0]!.fields[0],
    ).toMatchObject({
      name: 'done',
      type: 'boolean',
      trueCount: 3,
      trueShare: 0.75,
    })
  })
})

describe('state over records', () => {
  it('reads the same run back from the records', async () => {
    const p = ports()
    const context = engine({ p1: APPLY })
    const { state } = await nextStep(p, context, 'p1')
    const again = activeRun(p, 'p1')!
    expect(stateOf(p, again.id, again.run).current).toEqual(state.current)
  })
})
