import { refuse } from '@mindlink/platform'
import { valueProblem } from '../parse.js'
import type {
  Block,
  Cost,
  Intensity,
  Orchestration,
  ParamAssignment,
  ScalarValue,
} from '../types.js'

/**
 * A workflow resolved into a flat plan (block format, sections 5.2 and 5.3), and a project's adjustments laid over
 * it. Pure: nothing here reads or writes anything.
 *
 * A plan holds activities only. Their sub-steps are not expanded into it; `workflow_next` lists them with the
 * activity they belong to.
 */

/** Where a step's intensity came from, highest priority first (block format, 5.3). */
export type IntensitySource =
  | 'temporary'
  | 'adjustment'
  | 'step'
  | 'fragment'
  | 'project-default'
  | 'block-default'

export interface PlanStep {
  /** The step ids from the workflow down, joined with `.`, such as `learn.guide`. Unique in a plan. */
  readonly path: string
  /** The activity's full id. */
  readonly block: string
  readonly intensity: Intensity
  readonly intensitySource: IntensitySource
  /** Every parameter the activity declares, with its value. */
  readonly params: Readonly<Record<string, ScalarValue>>
  readonly optional: boolean
  readonly cost: Cost
  readonly dimensions: readonly string[]
}

export interface Plan {
  readonly workflow: string
  readonly orchestration: Orchestration
  readonly steps: readonly PlanStep[]
}

/** Finds a block by full id: the registry when a run starts, the run's snapshot afterwards. */
export type BlockLookup = (key: string) => Block | undefined

export interface PlanDefaults {
  /** The project's default guidance (MindLink#10). Used only where the activity supports it. */
  readonly intensity?: Intensity
}

function requireBlock(lookup: BlockLookup, key: string): Block {
  const block = lookup(key)
  if (block === undefined) refuse('block_not_found', `没有积木 ${key}，或者它没有通过校验`)
  return block
}

function paramValues(
  block: Block,
  ...layers: readonly (readonly ParamAssignment[])[]
): Record<string, ScalarValue> {
  const values: Record<string, ScalarValue> = {}
  for (const spec of block.params) values[spec.name] = spec.default
  for (const layer of layers)
    for (const assignment of layer) values[assignment.name] = assignment.value
  return values
}

function planStep(
  path: string,
  activity: Block,
  written: { readonly intensity: Intensity; readonly source: IntensitySource } | undefined,
  defaults: PlanDefaults,
  params: Record<string, ScalarValue>,
  optional: boolean,
): PlanStep {
  const chosen =
    written ??
    (defaults.intensity !== undefined && activity.intensities.includes(defaults.intensity)
      ? { intensity: defaults.intensity, source: 'project-default' as const }
      : { intensity: activity.intensities[0]!, source: 'block-default' as const })
  return {
    path,
    block: activity.key,
    intensity: chosen.intensity,
    intensitySource: chosen.source,
    params,
    optional,
    cost: activity.cost ?? 'low',
    dimensions: activity.dimensions.map((dimension) => dimension.value),
  }
}

/** Expands a workflow and the fragments it uses into a flat plan, each step with its intensity and parameters. */
export function resolvePlan(
  workflowKey: string,
  lookup: BlockLookup,
  defaults: PlanDefaults = {},
): Plan {
  const workflow = requireBlock(lookup, workflowKey)
  if (workflow.level !== 'workflow') {
    refuse('not_a_workflow', `${workflowKey} 不是工作流，是 ${workflow.level}`)
  }
  const steps: PlanStep[] = []
  for (const step of workflow.steps) {
    const used = requireBlock(lookup, step.use.key)
    if (used.level === 'activity') {
      steps.push(
        planStep(
          step.id,
          used,
          step.intensity === undefined
            ? undefined
            : { intensity: step.intensity.value, source: 'step' },
          defaults,
          paramValues(used, step.params),
          step.optional,
        ),
      )
      continue
    }
    for (const inner of used.steps) {
      const activity = requireBlock(lookup, inner.use.key)
      const override = step.overrides.find((candidate) => candidate.stepId === inner.id)
      const written =
        override?.intensity !== undefined
          ? { intensity: override.intensity.value, source: 'step' as const }
          : step.intensity !== undefined
            ? { intensity: step.intensity.value, source: 'step' as const }
            : inner.intensity !== undefined
              ? { intensity: inner.intensity.value, source: 'fragment' as const }
              : undefined
      steps.push(
        planStep(
          `${step.id}.${inner.id}`,
          activity,
          written,
          defaults,
          paramValues(activity, inner.params, override?.params ?? []),
          step.optional || inner.optional,
        ),
      )
    }
  }
  return {
    workflow: workflow.key,
    orchestration: workflow.orchestration ?? 'fixed',
    steps,
  }
}

/**
 * A change a person made to one step in their project, located by step path (block format, 6.3). It changes no
 * block: it is laid over the plan each time the plan is read.
 */
export type Adjustment =
  | { readonly kind: 'skip'; readonly path: string }
  | {
      readonly kind: 'insert'
      /** The step to insert after; absent inserts at the start. */
      readonly after?: string
      /** The new step's path: a step id, unique in the plan. */
      readonly id: string
      readonly use: string
      readonly intensity?: Intensity
      readonly params?: Readonly<Record<string, ScalarValue>>
    }
  | {
      readonly kind: 'replace'
      readonly path: string
      readonly use: string
      readonly intensity?: Intensity
      readonly params?: Readonly<Record<string, ScalarValue>>
    }
  | {
      /** Sets the step's intensity or parameters, keeping its activity. */
      readonly kind: 'set'
      readonly path: string
      readonly intensity?: Intensity
      readonly params?: Readonly<Record<string, ScalarValue>>
    }

/** Why a step will not be run. */
export type SkipReason = 'adjustment' | 'lean'

export interface EffectiveStep extends PlanStep {
  readonly skipped?: SkipReason
  /** Set on a step an adjustment inserted or replaced. */
  readonly adjusted?: 'insert' | 'replace' | 'set'
}

export interface EffectivePlan {
  readonly workflow: string
  readonly orchestration: Orchestration
  readonly steps: readonly EffectiveStep[]
  /** Adjustments that no longer apply, such as one for a step the workflow no longer has, in Chinese. */
  readonly ignored: readonly string[]
}

const STEP_ID = /^[a-z][a-z0-9-]{0,63}$/

/**
 * What is wrong with an adjustment against a plan, in Chinese, or `undefined` when it applies. Used both to refuse
 * a new adjustment and to set aside a stored one the plan has outgrown.
 */
export function adjustmentProblem(
  steps: readonly PlanStep[],
  adjustment: Adjustment,
  lookup: BlockLookup,
): string | undefined {
  const at = (path: string | undefined): string | undefined =>
    path === undefined || steps.some((step) => step.path === path)
      ? undefined
      : `计划里没有步骤 ${path}`
  const target = (use: string | undefined, path: string | undefined): Block | string => {
    const key = use ?? steps.find((step) => step.path === path)?.block
    const block = key === undefined ? undefined : lookup(key)
    if (block === undefined) return `没有积木 ${use}，或者它没有通过校验`
    if (block.level !== 'activity')
      return `${block.key} 是${block.level}；计划里的每一步都是活动积木`
    return block
  }
  const settings = (
    block: Block,
    intensity: Intensity | undefined,
    params: Readonly<Record<string, ScalarValue>> | undefined,
  ): string | undefined => {
    if (intensity !== undefined && !block.intensities.includes(intensity)) {
      return `${block.key} 只支持 ${block.intensities.join('、')}，不支持 ${intensity}`
    }
    for (const [name, value] of Object.entries(params ?? {})) {
      const spec = block.params.find((param) => param.name === name)
      if (spec === undefined) return `${block.key} 没有参数 "${name}"`
      const problem = valueProblem(spec, value)
      if (problem !== undefined) return `参数 ${name} ${problem}`
    }
    return undefined
  }
  switch (adjustment.kind) {
    case 'skip':
      return at(adjustment.path)
    case 'insert': {
      const problem = at(adjustment.after)
      if (problem !== undefined) return problem
      if (!STEP_ID.test(adjustment.id)) return `步骤 id "${adjustment.id}" 只能用小写字母、数字和 -`
      if (steps.some((step) => step.path === adjustment.id))
        return `计划里已经有步骤 ${adjustment.id}`
      const block = target(adjustment.use, undefined)
      return typeof block === 'string'
        ? block
        : settings(block, adjustment.intensity, adjustment.params)
    }
    case 'replace':
    case 'set': {
      const problem = at(adjustment.path)
      if (problem !== undefined) return problem
      const block = target(
        adjustment.kind === 'replace' ? adjustment.use : undefined,
        adjustment.path,
      )
      return typeof block === 'string'
        ? block
        : settings(block, adjustment.intensity, adjustment.params)
    }
  }
}

function adjustedStep(
  base: PlanStep,
  block: Block,
  intensity: Intensity | undefined,
  params: Readonly<Record<string, ScalarValue>> | undefined,
  kind: 'insert' | 'replace' | 'set',
): EffectiveStep {
  const values: Record<string, ScalarValue> = {}
  for (const spec of block.params) {
    values[spec.name] = kind === 'set' ? (base.params[spec.name] ?? spec.default) : spec.default
  }
  Object.assign(values, params)
  const keep = block.intensities.includes(base.intensity) ? base : undefined
  return {
    path: base.path,
    block: block.key,
    intensity: intensity ?? keep?.intensity ?? block.intensities[0]!,
    intensitySource:
      intensity !== undefined ? 'adjustment' : (keep?.intensitySource ?? 'block-default'),
    params: values,
    optional: base.optional,
    cost: block.cost ?? 'low',
    dimensions: block.dimensions.map((dimension) => dimension.value),
    adjusted: kind,
  }
}

/**
 * The plan as it will be run: the project's adjustments laid over it in order, then, in lean mode, every
 * high-cost step marked as skipped. An adjustment that no longer applies is left out and named in `ignored`.
 */
export function effectivePlan(
  plan: Plan,
  adjustments: readonly Adjustment[],
  lookup: BlockLookup,
  options: { readonly lean?: boolean; readonly defaults?: PlanDefaults } = {},
): EffectivePlan {
  let steps: EffectiveStep[] = [...plan.steps]
  const ignored: string[] = []
  for (const adjustment of adjustments) {
    const problem = adjustmentProblem(steps, adjustment, lookup)
    if (problem !== undefined) {
      ignored.push(`${describeAdjustment(adjustment)}：${problem}`)
      continue
    }
    switch (adjustment.kind) {
      case 'skip':
        steps = steps.map((step) =>
          step.path === adjustment.path ? { ...step, skipped: 'adjustment' } : step,
        )
        break
      case 'insert': {
        const block = lookup(adjustment.use)!
        const base = planStep(adjustment.id, block, undefined, options.defaults ?? {}, {}, false)
        const step = adjustedStep(base, block, adjustment.intensity, adjustment.params, 'insert')
        const index =
          adjustment.after === undefined
            ? 0
            : steps.findIndex((candidate) => candidate.path === adjustment.after) + 1
        steps.splice(index, 0, step)
        break
      }
      case 'replace':
      case 'set':
        steps = steps.map((step) => {
          if (step.path !== adjustment.path) return step
          const block = lookup(adjustment.kind === 'replace' ? adjustment.use : step.block)!
          const base =
            adjustment.kind === 'replace'
              ? planStep(step.path, block, undefined, options.defaults ?? {}, {}, step.optional)
              : step
          const next = adjustedStep(
            base,
            block,
            adjustment.intensity,
            adjustment.params,
            adjustment.kind,
          )
          return step.skipped === undefined ? next : { ...next, skipped: step.skipped }
        })
        break
    }
  }
  if (options.lean === true) {
    steps = steps.map((step) =>
      step.skipped === undefined && step.cost === 'high' ? { ...step, skipped: 'lean' } : step,
    )
  }
  return { workflow: plan.workflow, orchestration: plan.orchestration, steps, ignored }
}

export function describeAdjustment(adjustment: Adjustment): string {
  switch (adjustment.kind) {
    case 'skip':
      return `跳过 ${adjustment.path}`
    case 'insert':
      return `在 ${adjustment.after ?? '开头'}${adjustment.after === undefined ? '' : ' 之后'}插入 ${adjustment.id}（${adjustment.use}）`
    case 'replace':
      return `把 ${adjustment.path} 换成 ${adjustment.use}`
    case 'set':
      return `调整 ${adjustment.path}`
  }
}
