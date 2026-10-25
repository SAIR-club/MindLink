/**
 * The block format (MindLink#5): what a parsed block is, and every way one can be wrong.
 *
 * A block is declarative content and nothing else (MindLink spec, D7). These types describe what the parser reads out
 * of a block's files; nothing here runs anything a block contains.
 */

/** Where a block was loaded from. A reference without a prefix means a built-in block. */
export type BlockSource = 'builtin' | 'course' | 'user'

export const BLOCK_SOURCES: readonly BlockSource[] = ['builtin', 'course', 'user']

/** A block's level, lowest first. A block may only use blocks of a strictly lower level. */
export type BlockLevel = 'primitive' | 'activity' | 'fragment' | 'workflow'

export const BLOCK_LEVELS: readonly BlockLevel[] = ['primitive', 'activity', 'fragment', 'workflow']

/** How much of the answer a block gives: tell it, hint at it, or only ask. */
export type Intensity = 'tell' | 'hint' | 'ask'

export const INTENSITIES: readonly Intensity[] = ['tell', 'hint', 'ask']

export type Cost = 'low' | 'medium' | 'high'

export type Orchestration = 'fixed' | 'agent'

/** The format versions this build reads, and the one it writes. */
export interface FormatPolicy {
  readonly supported: readonly number[]
  readonly latest: number
}

export const FORMAT_POLICY: FormatPolicy = Object.freeze({ supported: [1], latest: 1 })

/** A position in a block's file, 1-based. */
export interface Position {
  readonly line: number
  readonly column: number
}

export interface Located<T> extends Position {
  readonly value: T
}

/** A reference to another block, as written and as resolved to a full id such as `builtin:guide`. */
export interface BlockRef extends Position {
  readonly written: string
  readonly source: BlockSource
  readonly id: string
  /** `<source>:<id>`. */
  readonly key: string
}

/** The type of a parameter or a result field. */
export type ValueSpec =
  | { readonly type: 'enum'; readonly values: readonly string[] }
  | { readonly type: 'boolean' }
  | { readonly type: 'integer'; readonly min: number; readonly max: number }

export type ScalarValue = string | number | boolean

export type ParamSpec = ValueSpec & {
  readonly name: string
  readonly default: ScalarValue
  readonly label?: string
  readonly line: number
}

/** When a result field must be reported. */
export type Requirement =
  | { readonly kind: 'always' }
  | { readonly kind: 'optional' }
  | { readonly kind: 'when'; readonly field: string; readonly values: readonly string[] }

export type ResultFieldSpec = ValueSpec & {
  readonly name: string
  readonly requirement: Requirement
  readonly label?: string
  readonly line: number
}

/** A value given to a parameter: a literal, or (inside an activity) the activity's own parameter passed on. */
export interface ParamAssignment extends Position {
  readonly name: string
  readonly value: ScalarValue
  /** Set when the value is `"{{name}}"`: the activity parameter it forwards. */
  readonly forward?: string
}

export interface StepOverride extends Position {
  readonly stepId: string
  readonly intensity?: Located<Intensity>
  readonly params: readonly ParamAssignment[]
}

export interface Step {
  readonly id: string
  readonly line: number
  readonly use: BlockRef
  readonly intensity?: Located<Intensity>
  readonly params: readonly ParamAssignment[]
  readonly overrides: readonly StepOverride[]
  readonly optional: boolean
}

/** A `## ` section of a main file. `text` is everything under the heading, verbatim. */
export interface Section {
  readonly title: string
  readonly line: number
  readonly text: string
}

export interface Reference {
  readonly path: string
  readonly text: string
}

export interface ExampleTurn {
  readonly role: 'learner' | 'agent' | 'tool'
  readonly tool?: string
  readonly line: number
  readonly text: string
}

export interface Example {
  readonly path: string
  readonly intensity?: Intensity
  readonly params: readonly ParamAssignment[]
  readonly result: readonly (Position & { readonly name: string; readonly value: ScalarValue })[]
  readonly turns: readonly ExampleTurn[]
}

/** A block as read from its files. */
export interface Block {
  readonly source: BlockSource
  readonly id: string
  /** `<source>:<id>`. */
  readonly key: string
  /** The main file's name, `BLOCK.md` or `WORKFLOW.md`. */
  readonly mainFile: string
  readonly format: number
  readonly level: BlockLevel
  readonly title: string
  readonly summary: string
  readonly origin?: string
  readonly originDigest?: string
  readonly dimensions: readonly Located<string>[]
  /** In declared order; the first is the block's default. */
  readonly intensities: readonly Intensity[]
  readonly tools: readonly Located<string>[]
  readonly steps: readonly Step[]
  readonly params: readonly ParamSpec[]
  readonly result: readonly ResultFieldSpec[]
  readonly cost?: Cost
  readonly orchestration?: Orchestration
  readonly sections: readonly Section[]
  readonly references: readonly Reference[]
  readonly examples: readonly Example[]
}

export const BLOCK_ISSUE_CODES = [
  // files and directories
  'missing-main-file',
  'both-main-files',
  'forbidden-file',
  'file-too-large',
  'encoding',
  'dir-name-mismatch',
  // frontmatter
  'frontmatter-missing',
  'frontmatter-syntax',
  'unknown-field',
  'field-not-allowed',
  'missing-field',
  'field-type',
  'field-format',
  'level-file-mismatch',
  // format version
  'format-too-new',
  'format-unsupported',
  'format-outdated',
  // dimensions, tools, references
  'unknown-dimension',
  'unknown-tool',
  'unknown-source',
  'unknown-block',
  'source-not-visible',
  'level-not-lower',
  'cycle',
  // intensities
  'unknown-intensity',
  'intensity-not-supported',
  'intensity-not-covered',
  'intensity-section-missing',
  'intensity-section-extra',
  // body
  'unknown-section',
  'duplicate-section',
  'section-missing',
  'section-not-allowed',
  'section-empty',
  'content-before-section',
  'unknown-param-ref',
  'broken-link',
  'unlinked-reference',
  'nested-reference-link',
  // steps, parameters, results
  'duplicate-step-id',
  'unknown-override-step',
  'unknown-param',
  'param-value',
  'param-default',
  'result-field',
  'required-when',
  // examples
  'example-format',
  'example-intensity',
  'example-result',
  'example-tool',
  'example-missing',
  // registry
  'duplicate-id',
  'shadows-builtin',
] as const

export type BlockIssueCode = (typeof BLOCK_ISSUE_CODES)[number]

/** One thing wrong with a block. Returned as a value, never thrown. */
export interface BlockIssue {
  readonly code: BlockIssueCode
  /** `<source>:<id>/<path in the block>`, for example `builtin:guide/BLOCK.md`. */
  readonly file: string
  /** 1-based. Absent only for whole-file problems, such as a missing or forbidden file. */
  readonly line?: number
  readonly column?: number
  /** In Simplified Chinese: what is wrong and how to fix it. */
  readonly message: string
  /** Other places involved: the other block with the same id, the rest of a cycle. */
  readonly related?: readonly { readonly file: string; readonly line: number }[]
}

/** The dimensions and tools a block may name. Passed in, so the format knows neither. */
export interface BlockVocabulary {
  readonly dimensions: Iterable<string>
  readonly tools: Iterable<string>
}

/** One block to read: its source, its directory or record name, and its files by path inside the block. */
export interface BlockInput {
  readonly source: BlockSource
  readonly id: string
  readonly files: ReadonlyMap<string, string | Uint8Array>
}
