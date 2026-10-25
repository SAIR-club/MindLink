import { refuse, type Ports, type RecordKind } from '@mindlink/platform'
import { getProject, scopeTag } from '../../project/index.js'
import { parseRef } from '../parse.js'
import type { BlockRegistry } from '../registry.js'
import { INTENSITIES, type Block, type Intensity, type ScalarValue } from '../types.js'
import { advance, measureGaps, type Gaps, type Position } from './advance.js'
import {
  activityInstructions,
  referenceText,
  subStepInstructions,
  type Instructions,
} from './instructions.js'
import {
  adjustmentProblem,
  effectivePlan,
  resolvePlan,
  type Adjustment,
  type BlockLookup,
  type EffectivePlan,
  type EffectiveStep,
  type IntensitySource,
  type Plan,
  type PlanDefaults,
} from './plan.js'
import { checkResult, type ResultEntry } from './results.js'

/**
 * Runs (MindLink#9): one pass of a project through its workflow, kept in the blocks feature's records.
 *
 * A run keeps a snapshot of its plan and of every block it uses, taken when it starts, so editing a workflow or a
 * block never changes a run under way. The project's adjustments are laid over the snapshot each time it is read,
 * so they take effect at the next step. A temporary intensity holds for the current step only.
 */

/** The feature's name, and so the prefix of every record it keeps. */
export const FEATURE = 'blocks'

/** What a run needs from a learning project (MindLink#10). */
export interface ProjectSettings {
  /** A full workflow id, such as `builtin:<id>`. */
  readonly workflowId: string
  /** The project's default guidance. */
  readonly guidance: Intensity
  /** The tag the project's nodes carry, `scope:<course>`, when the project belongs to a course. */
  readonly scope?: string
}

/** Where runs read a project's settings. Tests pass their own; the app reads the learning projects. */
export type ProjectSource = (
  ports: Ports,
  projectId: string,
) => ProjectSettings | undefined | Promise<ProjectSettings | undefined>

/** A learning project's settings (MindLink#10), read from the project feature's records through `getProject`. */
export const learningProjects: ProjectSource = (ports, projectId) => {
  const project = getProject(ports, projectId)
  if (project === undefined) return undefined
  const scope = scopeTag(project)
  return {
    workflowId: project.workflowId,
    guidance: project.guidance,
    ...(scope === undefined ? {} : { scope }),
  }
}

/** The blocks runs may start from: the built-in library, and later the course's and the person's own. */
export type RegistryProvider = (ports: Ports) => BlockRegistry | Promise<BlockRegistry>

export interface EngineContext {
  readonly registry: RegistryProvider
  readonly projects: ProjectSource
}

interface DoneStep {
  readonly path: string
  readonly block: string
  readonly intensity: Intensity
  readonly at: number
  /** An optional step the agent left out. */
  readonly skipped?: true
}

export interface StoredRun {
  readonly project: string
  readonly startedAt: number
  readonly finishedAt?: number
  readonly lean: boolean
  readonly defaults: PlanDefaults
  /** The tag of the project's nodes, when it belongs to a course. */
  readonly scope?: string
  /** The plan when the run started. */
  readonly plan: Plan
  /** Every block the run may use, as it was when the run started or an adjustment brought it in. */
  readonly blocks: Readonly<Record<string, Block>>
  readonly done: readonly DoneStep[]
  /** Agent orchestration: the candidate being worked on. */
  readonly current?: string
  /** An intensity for one step only, until it is done. */
  readonly temporary?: { readonly path: string; readonly intensity: Intensity }
}

export const RUN_RECORD: RecordKind<StoredRun> = Object.freeze({ kind: 'run', version: 1 })

/** The project's latest run, by project id. */
export const ACTIVE_RECORD: RecordKind<{ readonly run: string }> = Object.freeze({
  kind: 'active',
  version: 1,
})

/** A project's adjustments, in the order they were made, by project id. */
export const ADJUSTMENTS_RECORD: RecordKind<{ readonly adjustments: readonly Adjustment[] }> =
  Object.freeze({ kind: 'adjustments', version: 1 })

/** One reported result, by `<run>~<step path>`. */
export const RESULT_RECORD: RecordKind<ResultEntry> = Object.freeze({ kind: 'result', version: 1 })

function lookupOf(run: StoredRun): BlockLookup {
  return (key) => run.blocks[key]
}

/** A block and every block it uses, as plain data without its examples, which a run never reads. */
function snapshot(registry: BlockRegistry, keys: readonly string[]): Record<string, Block> {
  const blocks: Record<string, Block> = {}
  const pending = [...keys]
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (blocks[key] !== undefined) continue
    const block = registry.get(key)
    if (block === undefined) continue
    blocks[key] = structuredClone({ ...block, examples: [] })
    pending.push(...block.steps.map((step) => step.use.key))
  }
  return blocks
}

/** A reference as written (`x`, `user:x`) as a full id. */
export function fullId(written: string): string {
  const ref = parseRef(written)
  if (!ref.ok) refuse('invalid_block_ref', ref.message)
  return `${ref.source}:${ref.id}`
}

async function projectSettings(
  ports: Ports,
  context: EngineContext,
  project: string,
): Promise<ProjectSettings> {
  if (project === '') refuse('invalid_project', '"project" 应该是项目 id')
  const settings = await context.projects(ports, project)
  if (settings === undefined) refuse('project_not_found', `没有项目 "${project}"`)
  return settings
}

export function adjustmentsOf(ports: Ports, project: string): readonly Adjustment[] {
  return ports.records.of(ADJUSTMENTS_RECORD).get(project)?.adjustments ?? []
}

export function activeRun(
  ports: Ports,
  project: string,
): { readonly id: string; readonly run: StoredRun } | undefined {
  const pointer = ports.records.of(ACTIVE_RECORD).get(project)
  if (pointer === undefined) return undefined
  const run = ports.records.of(RUN_RECORD).get(pointer.run)
  return run === undefined ? undefined : { id: pointer.run, run }
}

/** Starts a run of the project's workflow, snapshotting its plan and blocks. */
export async function startRun(
  ports: Ports,
  context: EngineContext,
  project: string,
  options: { readonly lean?: boolean } = {},
): Promise<{ readonly id: string; readonly run: StoredRun }> {
  const settings = await projectSettings(ports, context, project)
  const registry = await context.registry(ports)
  const workflow = fullId(settings.workflowId)
  const defaults: PlanDefaults = { intensity: settings.guidance }
  const plan = resolvePlan(workflow, (key) => registry.get(key), defaults)
  const adjusted = adjustmentsOf(ports, project).flatMap((adjustment) =>
    adjustment.kind === 'insert' || adjustment.kind === 'replace' ? [adjustment.use] : [],
  )
  const runs = ports.records.of(RUN_RECORD)
  const count = runs.list().filter((entry) => entry.value.project === project).length
  const id = `${project}~${count + 1}`
  const run: StoredRun = {
    project,
    startedAt: ports.clock.now(),
    lean: options.lean ?? false,
    defaults,
    ...(settings.scope === undefined ? {} : { scope: settings.scope }),
    plan,
    blocks: snapshot(registry, [workflow, ...adjusted]),
    done: [],
  }
  await runs.put(id, run)
  await ports.records.of(ACTIVE_RECORD).put(project, { run: id })
  return { id, run }
}

/** The run's plan with the project's current adjustments and its lean setting. */
export function planOf(ports: Ports, run: StoredRun): EffectivePlan {
  return effectivePlan(run.plan, adjustmentsOf(ports, run.project), lookupOf(run), {
    lean: run.lean,
    defaults: run.defaults,
  })
}

/** How much each dimension the remaining steps declare is still missing among the project's nodes. */
function gapsOf(ports: Ports, run: StoredRun, plan: EffectivePlan): Gaps {
  const dimensions = new Set(plan.steps.flatMap((step) => step.dimensions))
  if (dimensions.size === 0) return new Map()
  const tag = run.scope
  const nodes = ports.state
    .nodes()
    .filter((node) => tag === undefined || node.tags.includes(tag))
    .map((node) => ({
      dimensions: ports.state.understandingOf(node.nodeId).map((entry) => entry.id),
    }))
  return measureGaps(nodes, dimensions)
}

export interface RunState {
  readonly id: string
  readonly run: StoredRun
  readonly plan: EffectivePlan
  readonly position: Position
  /** The current step with a temporary intensity applied. */
  readonly current?: EffectiveStep
}

function withTemporary(run: StoredRun, step: EffectiveStep | undefined): EffectiveStep | undefined {
  if (step === undefined || run.temporary?.path !== step.path) return step
  if (!run.blocks[step.block]?.intensities.includes(run.temporary.intensity)) return step
  const source: IntensitySource = 'temporary'
  return { ...step, intensity: run.temporary.intensity, intensitySource: source }
}

export function stateOf(
  ports: Ports,
  id: string,
  run: StoredRun,
  chosen: string | undefined = run.current,
): RunState {
  const plan = planOf(ports, run)
  const done = new Set(run.done.map((step) => step.path))
  const position = advance(plan, done, {
    ...(plan.orchestration === 'agent' ? { gaps: gapsOf(ports, run, plan) } : {}),
    ...(chosen === undefined ? {} : { chosen }),
  })
  const current = withTemporary(run, position.current)
  return { id, run, plan, position, ...(current === undefined ? {} : { current }) }
}

function requireActive(
  ports: Ports,
  project: string,
): { readonly id: string; readonly run: StoredRun } {
  const active = activeRun(ports, project)
  if (active === undefined) {
    refuse('no_run', `项目 "${project}" 还没有开始运行；先调用 workflow_next`)
  }
  return active
}

function requireCurrent(state: RunState): EffectiveStep {
  if (state.current === undefined) refuse('run_finished', '这次运行的每一步都已经做完了')
  return state.current
}

export interface NextOptions {
  /** Agent orchestration: the candidate to work on, by step path. */
  readonly step?: string
  /** An intensity for the current step only. */
  readonly intensity?: Intensity
  /** When a new run starts: skip high-cost steps. */
  readonly lean?: boolean
  /** Start a new run even though the last one has not finished, or has. */
  readonly restart?: boolean
}

export interface NextAnswer {
  readonly state: RunState
  readonly started: boolean
  readonly instructions?: Instructions
  /** The workflow's `## 编排说明`, for agent orchestration. */
  readonly orchestrationNotes?: string
}

/** `workflow_next`: the project's run, started if need be, and what to do now. */
export async function nextStep(
  ports: Ports,
  context: EngineContext,
  project: string,
  options: NextOptions = {},
): Promise<NextAnswer> {
  let active = options.restart === true ? undefined : activeRun(ports, project)
  const started = active === undefined
  if (active === undefined) {
    active = await startRun(ports, context, project, {
      ...(options.lean === undefined ? {} : { lean: options.lean }),
    })
  }
  const id = active.id
  let run = active.run
  if (options.step !== undefined) {
    const plan = planOf(ports, run)
    if (plan.orchestration !== 'agent') {
      refuse('fixed_order', '这个工作流是固定编排，按顺序推进，不能选步骤')
    }
    const step = plan.steps.find((candidate) => candidate.path === options.step)
    const done = run.done.some((entry) => entry.path === options.step)
    if (step === undefined || step.skipped !== undefined || done) {
      refuse('unknown_step', `步骤 ${options.step} 不在剩下的候选里`)
    }
  }
  let state = stateOf(ports, id, run, options.step ?? run.current)
  if (options.intensity !== undefined) {
    const current = requireCurrent(state)
    const block = run.blocks[current.block]!
    if (!block.intensities.includes(options.intensity)) {
      refuse(
        'intensity_not_supported',
        `${block.key} 只支持 ${block.intensities.join('、')}，不支持 ${options.intensity}`,
      )
    }
    run = { ...run, temporary: { path: current.path, intensity: options.intensity } }
  }
  if (
    state.plan.orchestration === 'agent' &&
    state.current !== undefined &&
    run.current !== state.current.path
  ) {
    run = { ...run, current: state.current.path }
  }
  if (run !== active.run) {
    await ports.records.of(RUN_RECORD).put(id, run)
    state = stateOf(ports, id, run)
  }
  if (state.current === undefined) return { state, started }
  const lookup = lookupOf(run)
  const notes = run.blocks[run.plan.workflow]?.sections.find(
    (section) => section.title === '编排说明',
  )?.text
  return {
    state,
    started,
    instructions: activityInstructions(
      run.blocks[state.current.block]!,
      state.current.intensity,
      state.current.params,
      lookup,
    ),
    ...(state.plan.orchestration === 'agent' && notes !== undefined
      ? { orchestrationNotes: notes }
      : {}),
  }
}

/** `block_read`: one sub-step of the current activity, or a reference of it or of one of its sub-steps. */
export function readBlock(
  ports: Ports,
  project: string,
  target: { readonly subStep?: string; readonly reference?: string },
): {
  readonly step: EffectiveStep
  readonly instructions?: Instructions
  readonly reference?: string
} {
  const { id, run } = requireActive(ports, project)
  const state = stateOf(ports, id, run)
  const step = requireCurrent(state)
  if (state.plan.orchestration === 'agent' && run.current !== step.path) {
    refuse('no_current_step', '还没有选定当前的活动；先调用 workflow_next')
  }
  const lookup = lookupOf(run)
  const activity = run.blocks[step.block]!
  if (target.subStep === undefined && target.reference === undefined) {
    refuse('invalid_read', '写 block（子步骤 id）或 reference（附件路径），至少一个')
  }
  if (target.subStep === undefined) {
    return { step, reference: referenceText(activity, target.reference!) }
  }
  const instructions = subStepInstructions(
    activity,
    target.subStep,
    step.intensity,
    step.params,
    lookup,
  )
  if (target.reference === undefined) return { step, instructions }
  return { step, reference: referenceText(run.blocks[instructions.block]!, target.reference) }
}

export interface ReportInput {
  readonly step: string
  readonly result?: unknown
  /** An optional step the agent decided to leave out. */
  readonly skipped?: boolean
}

/** `workflow_report`: records the current step's result and moves the run on. */
export async function reportStep(
  ports: Ports,
  project: string,
  input: ReportInput,
): Promise<{ readonly recorded?: ResultEntry; readonly state: RunState }> {
  const { id, run } = requireActive(ports, project)
  const before = stateOf(ports, id, run)
  const step = requireCurrent(before)
  if (before.plan.orchestration === 'agent' && run.current !== step.path) {
    refuse('no_current_step', '还没有选定当前的活动；先调用 workflow_next')
  }
  if (input.step !== step.path) {
    refuse('not_current_step', `当前的步骤是 ${step.path}，不是 ${input.step}`)
  }
  const at = ports.clock.now()
  let recorded: ResultEntry | undefined
  if (input.skipped === true) {
    if (!step.optional) refuse('not_optional', `步骤 ${step.path} 不是可选的，不能跳过`)
    if (input.result !== undefined) refuse('invalid_result', '跳过的步骤不报结果')
  } else {
    const block = run.blocks[step.block]!
    const values = checkResult(block.key, block.result, input.result ?? {})
    recorded = {
      run: id,
      project,
      workflow: run.plan.workflow,
      path: step.path,
      block: block.key,
      intensity: step.intensity,
      at,
      fields: block.result,
      values,
    }
    await ports.records.of(RESULT_RECORD).put(`${id}~${step.path}`, recorded)
  }
  const { current: _current, temporary: _temporary, ...rest } = run
  const moved: StoredRun = {
    ...rest,
    done: [
      ...run.done,
      {
        path: step.path,
        block: step.block,
        intensity: step.intensity,
        at,
        ...(input.skipped === true ? { skipped: true as const } : {}),
      },
    ],
  }
  const after = stateOf(ports, id, moved)
  const final: StoredRun = after.position.finished ? { ...moved, finishedAt: at } : moved
  await ports.records.of(RUN_RECORD).put(id, final)
  return { ...(recorded === undefined ? {} : { recorded }), state: stateOf(ports, id, final) }
}

/** Adds an adjustment to the project, checked against its current run's plan, or a fresh one. */
export async function addAdjustment(
  ports: Ports,
  context: EngineContext,
  project: string,
  adjustment: Adjustment,
): Promise<readonly Adjustment[]> {
  const registry = await context.registry(ports)
  const normalized: Adjustment =
    adjustment.kind === 'insert' || adjustment.kind === 'replace'
      ? { ...adjustment, use: fullId(adjustment.use) }
      : adjustment
  const active = activeRun(ports, project)
  const existing = adjustmentsOf(ports, project)
  let base: EffectivePlan
  let lookup: BlockLookup
  if (active !== undefined && active.run.finishedAt === undefined) {
    const extra =
      normalized.kind === 'insert' || normalized.kind === 'replace' ? [normalized.use] : []
    const blocks = { ...snapshot(registry, extra), ...active.run.blocks }
    if (Object.keys(blocks).length !== Object.keys(active.run.blocks).length) {
      await ports.records.of(RUN_RECORD).put(active.id, { ...active.run, blocks })
    }
    lookup = (key) => blocks[key]
    base = effectivePlan(active.run.plan, existing, lookup, { defaults: active.run.defaults })
    if (
      normalized.kind !== 'insert' &&
      active.run.done.some((step) => step.path === normalized.path)
    ) {
      refuse('step_done', `步骤 ${normalized.path} 在这次运行里已经做完了`)
    }
  } else {
    const settings = await projectSettings(ports, context, project)
    lookup = (key) => registry.get(key)
    const defaults: PlanDefaults = { intensity: settings.guidance }
    base = effectivePlan(
      resolvePlan(fullId(settings.workflowId), lookup, defaults),
      existing,
      lookup,
      {
        defaults,
      },
    )
  }
  const problem = adjustmentProblem(base.steps, normalized, lookup)
  if (problem !== undefined) refuse('invalid_adjustment', problem)
  const adjustments = [...existing, normalized]
  await ports.records.of(ADJUSTMENTS_RECORD).put(project, { adjustments })
  return adjustments
}

/** Removes the adjustment at `index`; later ones are kept, in order. */
export async function removeAdjustment(
  ports: Ports,
  project: string,
  index: number,
): Promise<readonly Adjustment[]> {
  const existing = adjustmentsOf(ports, project)
  if (!Number.isInteger(index) || index < 0 || index >= existing.length) {
    refuse('unknown_adjustment', `没有第 ${index} 条调整；共 ${existing.length} 条，从 0 开始`)
  }
  const adjustments = existing.filter((_, at) => at !== index)
  await ports.records.of(ADJUSTMENTS_RECORD).put(project, { adjustments })
  return adjustments
}

/** Switches the current step's intensity until it is done. */
export async function switchIntensity(
  ports: Ports,
  project: string,
  intensity: Intensity,
): Promise<RunState> {
  const { id, run } = requireActive(ports, project)
  const step = requireCurrent(stateOf(ports, id, run))
  const block = run.blocks[step.block]!
  if (!block.intensities.includes(intensity)) {
    refuse(
      'intensity_not_supported',
      `${block.key} 只支持 ${block.intensities.join('、')}，不支持 ${intensity}`,
    )
  }
  const next: StoredRun = { ...run, temporary: { path: step.path, intensity } }
  await ports.records.of(RUN_RECORD).put(id, next)
  return stateOf(ports, id, next)
}

/** Turns lean mode on or off for the project's current run. */
export async function setLean(ports: Ports, project: string, lean: boolean): Promise<RunState> {
  const { id, run } = requireActive(ports, project)
  const next: StoredRun = { ...run, lean }
  await ports.records.of(RUN_RECORD).put(id, next)
  return stateOf(ports, id, next)
}

/** Every result reported, optionally for one project only. */
export function readResults(ports: Ports, project?: string): ResultEntry[] {
  return ports.records
    .of(RESULT_RECORD)
    .list()
    .map((entry) => entry.value)
    .filter((entry) => project === undefined || entry.project === project)
}

export function parseIntensity(value: unknown, what = 'intensity'): Intensity {
  if (typeof value !== 'string' || !(INTENSITIES as readonly string[]).includes(value)) {
    refuse('invalid_intensity', `"${what}" 应该是 ${INTENSITIES.join(' / ')} 之一`)
  }
  return value as Intensity
}

export function parseParams(value: unknown): Readonly<Record<string, ScalarValue>> | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse('invalid_params', '"params" 应该是一个对象：参数名 → 值')
  }
  for (const [name, entry] of Object.entries(value)) {
    if (!['string', 'number', 'boolean'].includes(typeof entry)) {
      refuse('invalid_params', `参数 ${name} 应该是字符串、整数或布尔值`)
    }
  }
  return value as Readonly<Record<string, ScalarValue>>
}
