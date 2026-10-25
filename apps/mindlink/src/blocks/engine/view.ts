import { learnStateDimensions } from '@episteme/domain-learn'
import { LIBRARY } from '../check-library.js'
import { loadBlockDirectory } from '../load.js'
import { checkBlocks, type BlockRegistry } from '../registry.js'
import { blockToolNames } from '../tools.js'
import type { Candidate } from './advance.js'
import { describeAdjustment, type Adjustment } from './plan.js'
import type { RegistryProvider, RunState } from './runs.js'

/** How runs are shown to agents and pages, and where the blocks a run starts from come from. */

let builtin: Promise<BlockRegistry> | undefined

/** The built-in library, read and checked once; a block with issues is left out, as `pnpm modules:check` reports. */
export const builtinRegistry: RegistryProvider = () => {
  builtin ??= loadBlockDirectory(LIBRARY, 'builtin').then(
    (inputs) =>
      checkBlocks(inputs, {
        dimensions: learnStateDimensions.map((dimension) => dimension.id),
        tools: blockToolNames,
      }).registry,
  )
  return builtin
}

export type StepStatus = 'done' | 'left-out' | 'current' | 'pending' | 'skipped' | 'lean'

/** A run as plain data: every step with its status, and the adjustments laid over it. */
export function runView(
  state: RunState,
  adjustments: readonly Adjustment[],
): Readonly<Record<string, unknown>> {
  const { run, plan, position } = state
  const done = new Map(run.done.map((step) => [step.path, step]))
  return {
    id: state.id,
    project: run.project,
    workflow: plan.workflow,
    orchestration: plan.orchestration,
    lean: run.lean,
    startedAt: run.startedAt,
    ...(run.finishedAt === undefined ? {} : { finishedAt: run.finishedAt }),
    finished: position.finished,
    ...(state.current === undefined ? {} : { current: state.current.path }),
    steps: plan.steps.map((step) => {
      const record = done.get(step.path)
      const shown = state.current?.path === step.path ? state.current : step
      const status: StepStatus =
        record !== undefined
          ? record.skipped === true
            ? 'left-out'
            : 'done'
          : step.skipped === 'adjustment'
            ? 'skipped'
            : step.skipped === 'lean'
              ? 'lean'
              : state.current?.path === step.path
                ? 'current'
                : 'pending'
      return {
        path: step.path,
        block: record?.block ?? step.block,
        title: run.blocks[record?.block ?? step.block]?.title ?? step.block,
        intensity: record?.intensity ?? shown.intensity,
        intensitySource: shown.intensitySource,
        params: step.params,
        optional: step.optional,
        cost: step.cost,
        status,
        ...(step.adjusted === undefined ? {} : { adjusted: step.adjusted }),
      }
    }),
    candidates: position.candidates.map((candidate) => candidateView(state, candidate)),
    adjustments: adjustments.map((adjustment, index) => ({
      index,
      ...adjustment,
      description: describeAdjustment(adjustment),
    })),
    ignored: plan.ignored,
  }
}

export function candidateView(
  state: RunState,
  candidate: Candidate,
): Readonly<Record<string, unknown>> {
  const block = state.run.blocks[candidate.step.block]
  return {
    path: candidate.step.path,
    block: candidate.step.block,
    title: block?.title ?? candidate.step.block,
    summary: block?.summary ?? '',
    score: candidate.score,
    reason: candidate.reason,
  }
}
