/**
 * Blocks (layer L2): the block format, its checks, and the registry of blocks from the three sources (MindLink#5);
 * the engine that resolves a workflow into a plan, runs it and keeps result statistics (MindLink#9).
 *
 * Blocks are declarative content, never code (MindLink spec, D7). `checkBlocks` reads blocks from their files and
 * returns every problem as a value with its file and line; the registry it returns holds only blocks with none.
 */

export { checkLibrary, formatIssue, LIBRARY, type LibraryCheck } from './check-library.js'
export {
  advance,
  measureGaps,
  rankCandidates,
  type AdvanceOptions,
  type Candidate,
  type DimensionGap,
  type Gaps,
  type Position as RunPosition,
} from './engine/advance.js'
export {
  activityInstructions,
  fillParams,
  subStepInstructions,
  type Instructions,
  type ReferenceLink,
  type SubStep,
} from './engine/instructions.js'
export {
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
  type PlanStep,
  type SkipReason,
} from './engine/plan.js'
export {
  checkResult,
  resultStatistics,
  type BlockStatistics,
  type FieldStatistics,
  type GroupStatistics,
  type ResultEntry,
  type ResultValues,
} from './engine/results.js'
export {
  FEATURE as BLOCKS_FEATURE,
  activeRun,
  addAdjustment,
  adjustmentsOf,
  nextStep,
  planOf,
  readBlock,
  readResults,
  removeAdjustment,
  reportStep,
  setLean,
  startRun,
  stateOf,
  switchIntensity,
  learningProjects,
  type EngineContext,
  type NextAnswer,
  type NextOptions,
  type ReportInput,
  type RunState,
  type StoredRun,
  type ProjectSettings,
  type ProjectSource,
  type RegistryProvider,
} from './engine/runs.js'
export { builtinRegistry } from './engine/view.js'
export { loadBlockDirectory } from './load.js'
export { checkBlocks, type BlockRegistry, type CheckOptions, type CheckResult } from './registry.js'
export { blockToolNames } from './tools.js'
export {
  BLOCK_ISSUE_CODES,
  BLOCK_LEVELS,
  BLOCK_SOURCES,
  FORMAT_POLICY,
  INTENSITIES,
  type Block,
  type BlockInput,
  type BlockIssue,
  type BlockIssueCode,
  type BlockLevel,
  type BlockRef,
  type BlockSource,
  type BlockVocabulary,
  type Cost,
  type Example,
  type ExampleTurn,
  type FormatPolicy,
  type Intensity,
  type Located,
  type Orchestration,
  type ParamAssignment,
  type ParamSpec,
  type Position,
  type Reference,
  type Requirement,
  type ResultFieldSpec,
  type ScalarValue,
  type Section,
  type Step,
  type StepOverride,
  type ValueSpec,
} from './types.js'
