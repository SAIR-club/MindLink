import { LEVEL_NAMES, parseBlock, parseRef, valueProblem } from './parse.js'
import {
  FORMAT_POLICY,
  type Block,
  type BlockInput,
  type BlockIssue,
  type BlockIssueCode,
  type BlockLevel,
  type BlockVocabulary,
  type FormatPolicy,
  type Intensity,
  type ParamAssignment,
  type ParamSpec,
  type Position,
  type Step,
} from './types.js'

/**
 * The block registry (block format, sections 5, 6 and 8): every block from the three sources, checked against each
 * other.
 *
 * Keys are full ids, `<source>:<id>`, so blocks from different sources never replace one another. Two blocks with the
 * same id in one source are an error, and so is a course or user block that takes a built-in block's id. A block with
 * any issue, or one that uses such a block, is left out of the registry; its issues say why.
 */

export interface BlockRegistry {
  /** A block by full id, such as `builtin:guide`. */
  get(key: string): Block | undefined
  /** A block by reference as written in a step: `guide` is the built-in one, `user:x` the person's own. */
  resolve(written: string): Block | undefined
  list(): readonly Block[]
}

export interface CheckOptions {
  /** The format versions to read. Defaults to this build's; tests and the next format's migration pass their own. */
  readonly formats?: FormatPolicy
}

export interface CheckResult {
  readonly registry: BlockRegistry
  /** Every issue, in input order. */
  readonly issues: readonly BlockIssue[]
}

const RANK: Record<BlockLevel, number> = { primitive: 1, activity: 2, fragment: 3, workflow: 4 }

/** What each level may use. Lower but not listed (a workflow using a primitive) is refused too. */
const USES: Record<BlockLevel, readonly BlockLevel[]> = {
  primitive: [],
  activity: ['primitive'],
  fragment: ['activity'],
  workflow: ['activity', 'fragment'],
}

interface Entry {
  readonly input: BlockInput
  readonly key: string
  readonly block?: Block
  readonly issues: BlockIssue[]
}

/** The line `id:` is written on in a block's main file, for issues about the id itself. */
function idLineOf(input: BlockInput): { readonly file: string; readonly line: number } {
  for (const name of ['BLOCK.md', 'WORKFLOW.md']) {
    const content = input.files.get(name)
    if (content === undefined) continue
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
    const index = text.split(/\r?\n/).findIndex((line) => /^id[ ]*:/.test(line))
    return { file: `${input.source}:${input.id}/${name}`, line: index === -1 ? 1 : index + 1 }
  }
  return { file: `${input.source}:${input.id}/`, line: 1 }
}

export function checkBlocks(
  inputs: readonly BlockInput[],
  vocabulary: BlockVocabulary,
  options: CheckOptions = {},
): CheckResult {
  const context = {
    dimensions: new Set(vocabulary.dimensions),
    tools: new Set(vocabulary.tools),
    formats: options.formats ?? FORMAT_POLICY,
  }
  const entries: Entry[] = inputs.map((input) => {
    const parsed = parseBlock(input, context)
    return {
      input,
      key: `${input.source}:${input.id}`,
      ...(parsed.block === undefined ? {} : { block: parsed.block }),
      issues: [...parsed.issues],
    }
  })

  const byKey = new Map<string, Entry[]>()
  for (const entry of entries) byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry])

  for (const group of byKey.values()) {
    if (group.length < 2) continue
    for (const entry of group) {
      const at = idLineOf(entry.input)
      entry.issues.push({
        code: 'duplicate-id',
        file: at.file,
        line: at.line,
        message: `${entry.key} 不止一块；同一来源里 id 不能重复，两块都不会注册`,
        related: group.filter((other) => other !== entry).map((other) => idLineOf(other.input)),
      })
    }
  }
  const builtinIds = new Set(
    entries.filter((entry) => entry.input.source === 'builtin').map((entry) => entry.input.id),
  )
  for (const entry of entries) {
    if (entry.input.source !== 'builtin' && builtinIds.has(entry.input.id)) {
      const at = idLineOf(entry.input)
      entry.issues.push({
        code: 'shadows-builtin',
        file: at.file,
        line: at.line,
        message: `"${entry.input.id}" 是内置积木的名字；课程和用户的积木请换一个名字（复制内置积木时也要改名）`,
        related: entries
          .filter((other) => other.input.source === 'builtin' && other.input.id === entry.input.id)
          .map((other) => idLineOf(other.input)),
      })
    }
  }

  /** The one parsed block under a key, if there is exactly one. */
  const target = (key: string): Block | undefined => {
    const group = byKey.get(key)
    return group?.length === 1 ? group[0]!.block : undefined
  }

  for (const entry of entries) {
    if (entry.block !== undefined) crossCheck(entry, entry.block, target, byKey)
  }
  cycles(entries, target)

  // A block that uses a block with issues has an issue too, until nothing changes.
  const failed = new Set(
    entries.filter((entry) => entry.issues.length > 0).map((entry) => entry.key),
  )
  for (const group of byKey.values()) if (group.length > 1) failed.add(group[0]!.key)
  for (let changed = true; changed; ) {
    changed = false
    for (const entry of entries) {
      if (entry.block === undefined || failed.has(entry.key)) continue
      for (const step of entry.block.steps) {
        const used = target(step.use.key)
        if (used !== undefined && failed.has(used.key)) {
          entry.issues.push(
            issueAt(
              entry.block,
              'unknown-block',
              step.use,
              `引用的积木 ${used.key} 存在但未通过校验；先修好它`,
            ),
          )
          failed.add(entry.key)
          changed = true
          break
        }
      }
    }
  }

  const registered = new Map<string, Block>()
  for (const entry of entries) {
    if (entry.block !== undefined && !failed.has(entry.key)) registered.set(entry.key, entry.block)
  }
  const registry: BlockRegistry = Object.freeze({
    get: (key: string) => registered.get(key),
    resolve: (written: string) => {
      const ref = parseRef(written)
      return ref.ok ? registered.get(`${ref.source}:${ref.id}`) : undefined
    },
    list: () => [...registered.values()],
  })
  return { registry, issues: entries.flatMap((entry) => entry.issues) }
}

function issueAt(block: Block, code: BlockIssueCode, at: Position, message: string): BlockIssue {
  return { code, file: `${block.key}/${block.mainFile}`, line: at.line, column: at.column, message }
}

function crossCheck(
  entry: Entry,
  block: Block,
  target: (key: string) => Block | undefined,
  byKey: ReadonlyMap<string, readonly Entry[]>,
): void {
  const add = (code: BlockIssueCode, at: Position, message: string): void => {
    entry.issues.push(issueAt(block, code, at, message))
  }

  for (const step of block.steps) {
    const ref = step.use
    if (
      (block.source === 'builtin' && ref.source !== 'builtin') ||
      (block.source === 'course' && ref.source === 'user')
    ) {
      add(
        'source-not-visible',
        ref,
        `${block.source === 'builtin' ? '内置积木只能引用内置积木' : '课程积木不能引用用户积木，同学看不到它'}：${ref.written}`,
      )
      continue
    }
    const used = target(ref.key)
    if (used === undefined) {
      const exists = byKey.has(ref.key)
      add(
        'unknown-block',
        ref,
        exists ? `引用的积木 ${ref.key} 存在但未通过校验；先修好它` : `没有积木 ${ref.key}`,
      )
      continue
    }
    if (RANK[used.level] >= RANK[block.level] || !USES[block.level].includes(used.level)) {
      const allowed = USES[block.level].map((level) => LEVEL_NAMES[level]).join('、') || '任何积木'
      add(
        'level-not-lower',
        ref,
        `${LEVEL_NAMES[block.level]}只能引用${allowed}；${ref.key} 是${LEVEL_NAMES[used.level]}`,
      )
      continue
    }
    if (block.level === 'activity') {
      for (const intensity of block.intensities) {
        if (!used.intensities.includes(intensity)) {
          add(
            'intensity-not-covered',
            ref,
            `活动支持 ${intensity}，但子步骤 ${ref.key} 不支持；子步骤跟随活动的强度`,
          )
        }
      }
      checkParams(add, step.params, used, block)
    } else if (used.level === 'activity') {
      if (step.intensity !== undefined && !used.intensities.includes(step.intensity.value)) {
        add(
          'intensity-not-supported',
          step.intensity,
          `${ref.key} 只支持 ${used.intensities.join('、')}，不支持 ${step.intensity.value}`,
        )
      }
      checkParams(add, step.params, used, undefined)
      for (const override of step.overrides) {
        add(
          'unknown-override-step',
          override,
          `overrides 只能用在引用片段的步骤上；${ref.key} 是活动积木`,
        )
      }
    } else {
      checkFragmentStep(add, step, used, target)
    }
  }

  if (block.examples.length > 0) {
    const allowed = new Set(block.tools.map((tool) => tool.value))
    for (const step of block.steps) {
      for (const tool of target(step.use.key)?.tools ?? []) allowed.add(tool.value)
    }
    for (const example of block.examples) {
      for (const turn of example.turns) {
        if (turn.tool !== undefined && !allowed.has(turn.tool)) {
          entry.issues.push({
            code: 'example-tool',
            file: `${block.key}/${example.path}`,
            line: turn.line,
            message: `示例调用了 ${turn.tool}，但积木和它的子步骤都没有在 tools 里声明它`,
          })
        }
      }
    }
  }
}

/** A workflow step that uses a fragment: its intensity, parameters and overrides reach the fragment's steps. */
function checkFragmentStep(
  add: (code: BlockIssueCode, at: Position, message: string) => void,
  step: Step,
  fragment: Block,
  target: (key: string) => Block | undefined,
): void {
  for (const assignment of step.params) {
    add(
      'unknown-param',
      assignment,
      `片段没有参数；给片段里的某一步传参请用 overrides.<步骤 id>.params`,
    )
  }
  for (const override of step.overrides) {
    const inner = fragment.steps.find((candidate) => candidate.id === override.stepId)
    if (inner === undefined) {
      add(
        'unknown-override-step',
        override,
        `片段 ${fragment.key} 里没有步骤 "${override.stepId}"；有 ${fragment.steps.map((candidate) => candidate.id).join('、')}`,
      )
      continue
    }
    const used = target(inner.use.key)
    if (used === undefined) continue
    if (override.intensity !== undefined)
      checkIntensity(add, override.intensity, override.intensity.value, used, inner)
    checkParams(add, override.params, used, undefined)
  }
  if (step.intensity !== undefined) {
    for (const inner of fragment.steps) {
      const overridden = step.overrides.some(
        (override) => override.stepId === inner.id && override.intensity !== undefined,
      )
      const used = target(inner.use.key)
      if (!overridden && used !== undefined)
        checkIntensity(add, step.intensity, step.intensity.value, used, inner)
    }
  }
}

function checkIntensity(
  add: (code: BlockIssueCode, at: Position, message: string) => void,
  at: Position,
  intensity: Intensity,
  used: Block,
  inner: Step,
): void {
  if (!used.intensities.includes(intensity)) {
    add(
      'intensity-not-supported',
      at,
      `片段里的步骤 ${inner.id}（${used.key}）只支持 ${used.intensities.join('、')}，不支持 ${intensity}`,
    )
  }
}

/** Values given to `used`'s parameters. Only an activity's own steps may forward its parameters (`from`). */
function checkParams(
  add: (code: BlockIssueCode, at: Position, message: string) => void,
  assignments: readonly ParamAssignment[],
  used: Block,
  from: Block | undefined,
): void {
  for (const assignment of assignments) {
    const spec = used.params.find((param) => param.name === assignment.name)
    if (spec === undefined) {
      add('unknown-param', assignment, `${used.key} 没有参数 "${assignment.name}"`)
      continue
    }
    if (assignment.forward === undefined) {
      const problem = valueProblem(spec, assignment.value)
      if (problem !== undefined)
        add('param-value', assignment, `参数 ${assignment.name} ${problem}`)
      continue
    }
    if (from === undefined) {
      add('param-value', assignment, '只有活动积木的子步骤才能用 "{{参数}}" 传参；这里要写具体的值')
      continue
    }
    const source = from.params.find((param) => param.name === assignment.forward)
    if (source === undefined) {
      add('param-value', assignment, `活动没有参数 "${assignment.forward}"`)
    } else if (!fits(source, spec)) {
      add(
        'param-value',
        assignment,
        `活动的参数 ${source.name} 和 ${used.key} 的参数 ${spec.name} 类型或范围对不上`,
      )
    }
  }
}

/** Whether every value `source` allows is one `into` accepts. */
function fits(source: ParamSpec, into: ParamSpec): boolean {
  if (source.type === 'boolean') return into.type === 'boolean'
  if (source.type === 'integer')
    return into.type === 'integer' && source.min >= into.min && source.max <= into.max
  return into.type === 'enum' && source.values.every((value) => into.values.includes(value))
}

/** Reports every cycle of references once, at the first block of the cycle by key. */
function cycles(entries: readonly Entry[], target: (key: string) => Block | undefined): void {
  const blocks = new Map<string, Block>()
  for (const entry of entries)
    if (entry.block !== undefined && target(entry.key) !== undefined)
      blocks.set(entry.key, entry.block)
  const edges = (block: Block): Step[] => block.steps.filter((step) => blocks.has(step.use.key))

  // Tarjan's strongly connected components.
  let counter = 0
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []
  const visit = (key: string): void => {
    index.set(key, counter)
    low.set(key, counter)
    counter++
    stack.push(key)
    onStack.add(key)
    for (const step of edges(blocks.get(key)!)) {
      const next = step.use.key
      if (!index.has(next)) {
        visit(next)
        low.set(key, Math.min(low.get(key)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(key, Math.min(low.get(key)!, index.get(next)!))
      }
    }
    if (low.get(key) === index.get(key)) {
      const component: string[] = []
      let popped: string
      do {
        popped = stack.pop()!
        onStack.delete(popped)
        component.push(popped)
      } while (popped !== key)
      components.push(component)
    }
  }
  for (const key of blocks.keys()) if (!index.has(key)) visit(key)

  for (const component of components) {
    const members = new Set(component)
    const start = [...component].sort()[0]!
    const first = blocks.get(start)!
    const into = (block: Block): Step | undefined =>
      edges(block).find((step) => members.has(step.use.key))
    const firstStep = into(first)
    if (firstStep === undefined || (component.length === 1 && firstStep.use.key !== start)) continue
    // Walk the cycle from `start` for the message.
    const chain = [start]
    for (let at = firstStep.use.key; at !== start && !chain.includes(at); ) {
      chain.push(at)
      at = into(blocks.get(at)!)!.use.key
    }
    const owner = entries.find((entry) => entry.key === start)!
    owner.issues.push({
      ...issueAt(first, 'cycle', firstStep.use, `引用成环：${[...chain, start].join(' → ')}`),
      related: chain.slice(1).map((key) => {
        const block = blocks.get(key)!
        return { file: `${key}/${block.mainFile}`, line: into(block)!.use.line }
      }),
    })
  }
}
