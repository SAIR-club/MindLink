/**
 * Blocks (layer L2): the block format, its checks, and the registry of blocks from the three sources (MindLink#5).
 *
 * Blocks are declarative content, never code (MindLink spec, D7). `checkBlocks` reads blocks from their files and
 * returns every problem as a value with its file and line; the registry it returns holds only blocks with none.
 */

export { checkLibrary, formatIssue, LIBRARY, type LibraryCheck } from './check-library.js'
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
