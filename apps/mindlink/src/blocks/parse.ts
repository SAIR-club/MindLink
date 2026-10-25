import {
  isExternal,
  linksOf,
  paramRefsOf,
  partsAt,
  scan,
  splitFrontmatter,
  textOf,
  type MarkdownLine,
} from './markdown.js'
import {
  BLOCK_LEVELS,
  BLOCK_SOURCES,
  INTENSITIES,
  type Block,
  type BlockInput,
  type BlockIssue,
  type BlockIssueCode,
  type BlockLevel,
  type BlockRef,
  type BlockSource,
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
  type Requirement,
  type ResultFieldSpec,
  type ScalarValue,
  type Section,
  type Step,
  type StepOverride,
  type ValueSpec,
} from './types.js'
import { parseYaml, type YamlEntry, type YamlMap, type YamlNode, type YamlScalar } from './yaml.js'

/**
 * Reads one block from its files and checks everything that needs no other block (block format, sections 2–4 and 8).
 *
 * Checks that need other blocks, such as whether a reference exists or is of a lower level, are the registry's.
 * The block comes back whenever its frontmatter could be read, so those checks can still run and one pass reports as
 * much as it can.
 */

export interface ParsedBlock {
  readonly block?: Block
  readonly issues: readonly BlockIssue[]
}

export interface ParseContext {
  readonly dimensions: ReadonlySet<string>
  readonly tools: ReadonlySet<string>
  readonly formats: FormatPolicy
}

const BLOCK_FILE = 'BLOCK.md'
const WORKFLOW_FILE = 'WORKFLOW.md'
const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.md$/
const MAX_MAIN_LINES = 500
const MAX_FILE_BYTES = 64 * 1024
const MAX_BLOCK_BYTES = 256 * 1024

export const ID = /^[a-z][a-z0-9-]{0,63}$/
const FIELD_NAME = /^[a-z][a-z0-9_]{0,31}$/
const ENUM_VALUE = /^[a-z][a-z0-9-]*$/
const TOOL_NAME = /^[a-z][a-z0-9_]*$/
const REF = /^(?:([a-z][a-z0-9]*):)?([a-z][a-z0-9-]{0,63})$/
const FORWARD = /^\{\{\s*([^}]*?)\s*\}\}$/

const BLOCK_SECTIONS = ['通用', 'tell', 'hint', 'ask', '结果', '结束条件'] as const
const WORKFLOW_SECTIONS = ['说明', '编排说明'] as const

/** Which top-level fields each level requires and allows. */
const FIELDS: Record<
  BlockLevel,
  { readonly required: readonly string[]; readonly optional: readonly string[] }
> = {
  primitive: {
    required: ['format', 'id', 'level', 'title', 'summary', 'intensities'],
    optional: ['origin', 'origin_digest', 'dimensions', 'tools', 'params'],
  },
  activity: {
    required: [
      'format',
      'id',
      'level',
      'title',
      'summary',
      'dimensions',
      'intensities',
      'result',
      'cost',
    ],
    optional: ['origin', 'origin_digest', 'tools', 'steps', 'params'],
  },
  fragment: {
    required: ['format', 'id', 'level', 'title', 'summary', 'steps'],
    optional: ['origin', 'origin_digest'],
  },
  workflow: {
    required: ['format', 'id', 'level', 'title', 'summary', 'steps', 'orchestration'],
    optional: ['origin', 'origin_digest'],
  },
}

const ALL_FIELDS = new Set(
  Object.values(FIELDS).flatMap((level) => [...level.required, ...level.optional]),
)
const COMMON_FIELDS = ['format', 'id', 'level', 'title', 'summary', 'origin', 'origin_digest']

const LEVEL_NAMES: Record<BlockLevel, string> = {
  primitive: '基础积木',
  activity: '活动积木',
  fragment: '片段',
  workflow: '工作流',
}

/** A reference as written in `use:`, resolved to its source; `undefined` with a reason when it cannot be. */
export function parseRef(
  written: string,
):
  | { readonly ok: true; readonly source: BlockSource; readonly id: string }
  | { readonly ok: false; readonly code: BlockIssueCode; readonly message: string } {
  const match = REF.exec(written)
  if (match === null) {
    return {
      ok: false,
      code: 'field-format',
      message: `"${written}" 不是合法的积木引用；写成 guide、course:名字 或 user:名字`,
    }
  }
  const prefix = match[1]
  if (prefix !== undefined && !(BLOCK_SOURCES as readonly string[]).includes(prefix)) {
    return {
      ok: false,
      code: 'unknown-source',
      message: `不认识的来源 "${prefix}:"；只有 builtin:、course:、user:`,
    }
  }
  return { ok: true, source: (prefix ?? 'builtin') as BlockSource, id: match[2]! }
}

/** Checks a value against a parameter or result field's type. Returns what is wrong, or `undefined`. */
export function valueProblem(spec: ValueSpec, value: ScalarValue): string | undefined {
  switch (spec.type) {
    case 'boolean':
      return typeof value === 'boolean' ? undefined : '应该是 true 或 false'
    case 'integer':
      if (typeof value !== 'number') return '应该是整数'
      return value < spec.min || value > spec.max
        ? `应该在 ${spec.min} 到 ${spec.max} 之间`
        : undefined
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
        ? undefined
        : `应该是 ${spec.values.join(' / ')} 之一`
  }
}

const describe = (node: YamlNode): string =>
  node.kind === 'mapping'
    ? '映射'
    : node.kind === 'sequence'
      ? '列表'
      : typeof node.value === 'string'
        ? '字符串'
        : typeof node.value === 'number'
          ? '整数'
          : '布尔值'

class BlockReader {
  readonly issues: BlockIssue[] = []
  private readonly prefix: string

  constructor(
    private readonly input: BlockInput,
    readonly context: ParseContext,
  ) {
    this.prefix = `${input.source}:${input.id}/`
  }

  file(path: string): string {
    return this.prefix + path
  }

  add(
    code: BlockIssueCode,
    path: string,
    at: Partial<Position> | undefined,
    message: string,
  ): void {
    this.issues.push({
      code,
      file: this.file(path),
      ...(at?.line === undefined ? {} : { line: at.line }),
      ...(at?.column === undefined ? {} : { column: at.column }),
      message,
    })
  }

  read(): Block | undefined {
    const texts = this.decode()
    const hasBlock = texts.has(BLOCK_FILE)
    const hasWorkflow = texts.has(WORKFLOW_FILE)
    if (hasBlock && hasWorkflow) {
      this.add(
        'both-main-files',
        WORKFLOW_FILE,
        undefined,
        `一块积木只能有 ${BLOCK_FILE} 或 ${WORKFLOW_FILE} 中的一个`,
      )
      return undefined
    }
    if (!hasBlock && !hasWorkflow) {
      if (!this.issues.some((issue) => issue.code === 'encoding')) {
        this.issues.push({
          code: 'missing-main-file',
          file: this.prefix,
          message: `目录里没有 ${BLOCK_FILE} 或 ${WORKFLOW_FILE}`,
        })
      }
      return undefined
    }
    const mainFile = hasBlock ? BLOCK_FILE : WORKFLOW_FILE
    const references = [...texts].filter(([path]) => path.startsWith('references/'))
    const examples = [...texts].filter(([path]) => path.startsWith('examples/'))
    if (!hasBlock) {
      for (const [path] of examples) {
        this.add('forbidden-file', path, undefined, '片段和工作流没有示例对话；请删除 examples/')
      }
    }
    return this.main(mainFile, texts.get(mainFile)!, references, hasBlock ? examples : [])
  }

  /** Decodes every file, and reports the ones that are not allowed or too large. */
  private decode(): Map<string, string> {
    const texts = new Map<string, string>()
    let total = 0
    for (const [path, content] of this.input.files) {
      const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
      total += bytes.length
      const allowed =
        path === BLOCK_FILE ||
        path === WORKFLOW_FILE ||
        (/^(references|examples)\/[^/]+$/.test(path) &&
          FILE_NAME.test(path.slice(path.indexOf('/') + 1)))
      if (!allowed) {
        this.add(
          'forbidden-file',
          path,
          undefined,
          '积木目录里只能有 BLOCK.md 或 WORKFLOW.md、references/*.md 和 examples/*.md；不能有脚本、其他文件或子目录，文件名只用小写字母、数字和 -',
        )
        continue
      }
      let text: string
      try {
        text =
          typeof content === 'string'
            ? content
            : new TextDecoder('utf-8', { fatal: true }).decode(content)
      } catch {
        this.add('encoding', path, undefined, '文件不是 UTF-8 编码')
        continue
      }
      if (text.startsWith('﻿')) {
        this.add('encoding', path, undefined, '文件开头有 BOM；请保存为不带 BOM 的 UTF-8')
        continue
      }
      if (path !== BLOCK_FILE && path !== WORKFLOW_FILE && bytes.length > MAX_FILE_BYTES) {
        this.add(
          'file-too-large',
          path,
          undefined,
          `附件和示例不能超过 ${MAX_FILE_BYTES / 1024} KB`,
        )
      }
      texts.set(path, text.replace(/\r\n?/g, '\n'))
    }
    if (total > MAX_BLOCK_BYTES) {
      this.issues.push({
        code: 'file-too-large',
        file: this.prefix,
        message: `整块积木不能超过 ${MAX_BLOCK_BYTES / 1024} KB`,
      })
    }
    return texts
  }

  private main(
    mainFile: string,
    text: string,
    references: readonly (readonly [string, string])[],
    examples: readonly (readonly [string, string])[],
  ): Block | undefined {
    const allLines = text.split('\n')
    if (allLines.length > MAX_MAIN_LINES) {
      this.add(
        'file-too-large',
        mainFile,
        { line: MAX_MAIN_LINES + 1 },
        `主文件不能超过 ${MAX_MAIN_LINES} 行；把资料移到 references/`,
      )
    }
    const split = splitFrontmatter(text)
    if (split === undefined) {
      this.add(
        'frontmatter-missing',
        mainFile,
        { line: 1 },
        '文件必须以 --- 开头的 frontmatter 开始，并以 --- 结束',
      )
      return undefined
    }
    const parsed = parseYaml(split.frontmatter, split.frontmatterLine)
    if (!parsed.ok) {
      this.add('frontmatter-syntax', mainFile, parsed.error, parsed.error.message)
      return undefined
    }
    const fields = new FieldReader(this, mainFile, parsed.value)

    // The format decides how to read everything else, so it comes first.
    const format = fields.integer('format')
    const { formats } = this.context
    if (format !== undefined) {
      if (format.value > formats.latest) {
        this.add(
          'format-too-new',
          mainFile,
          format,
          `格式 ${format.value} 比本版本支持的 ${formats.latest} 新；请升级 MindLink`,
        )
        return undefined
      }
      if (!formats.supported.includes(format.value)) {
        this.add(
          'format-unsupported',
          mainFile,
          format,
          `不支持格式 ${format.value}；本版本支持 ${formats.supported.join('、')}`,
        )
        return undefined
      }
      if (this.input.source === 'builtin' && format.value < formats.latest) {
        this.add(
          'format-outdated',
          mainFile,
          format,
          `内置积木必须是最新格式 ${formats.latest}；请把文件升级到新格式`,
        )
      }
    }

    const levelValue = fields.oneOf('level', BLOCK_LEVELS)
    const level = levelValue?.value
    const expectedFile = level === 'primitive' || level === 'activity' ? BLOCK_FILE : WORKFLOW_FILE
    const mismatch = level !== undefined && expectedFile !== mainFile
    if (mismatch) {
      this.add(
        'level-file-mismatch',
        mainFile,
        levelValue,
        `${LEVEL_NAMES[level]}应该写在 ${expectedFile} 里`,
      )
    }
    fields.checkKeys(level === undefined || mismatch ? undefined : level)

    const id = fields.string('id')
    if (id !== undefined) {
      if (!ID.test(id.value)) {
        this.add(
          'field-format',
          mainFile,
          id,
          'id 只能有小写字母、数字和 -，以字母开头，最多 64 个字符',
        )
      } else if (id.value !== this.input.id) {
        this.add(
          'dir-name-mismatch',
          mainFile,
          id,
          `id "${id.value}" 和所在目录（或记录）的名字 "${this.input.id}" 不同`,
        )
      }
    }
    const title = fields.text('title', 40)
    const summary = fields.text('summary', 200)
    const origin = fields.string('origin')
    if (
      origin !== undefined &&
      !/^(builtin|course|user):[a-z][a-z0-9-]{0,63}$/.test(origin.value)
    ) {
      this.add('field-format', mainFile, origin, 'origin 要写完整 id，例如 builtin:guide')
    }
    const digest = fields.string('origin_digest')
    if (digest !== undefined) {
      if (!/^sha256:[0-9a-f]{64}$/.test(digest.value)) {
        this.add(
          'field-format',
          mainFile,
          digest,
          'origin_digest 写成 sha256: 加 64 位小写十六进制',
        )
      } else if (origin === undefined) {
        this.add('field-format', mainFile, digest, '有 origin_digest 时必须同时写 origin')
      }
    }

    if (level === undefined || mismatch) return undefined

    const isBlockFile = mainFile === BLOCK_FILE
    const params = isBlockFile ? fields.params() : []
    const block: Block = {
      source: this.input.source,
      id: this.input.id,
      key: `${this.input.source}:${this.input.id}`,
      mainFile,
      format: format?.value ?? formats.latest,
      level,
      title: title ?? '',
      summary: summary ?? '',
      ...(origin === undefined ? {} : { origin: origin.value }),
      ...(digest === undefined ? {} : { originDigest: digest.value }),
      dimensions: isBlockFile ? fields.dimensions() : [],
      intensities: isBlockFile ? fields.intensities() : [],
      tools: isBlockFile ? fields.tools() : [],
      steps: fields.steps(level),
      params,
      result: level === 'activity' ? fields.result() : [],
      ...(level === 'activity'
        ? optional('cost', fields.oneOf<Cost>('cost', ['low', 'medium', 'high'])?.value)
        : {}),
      ...(level === 'workflow'
        ? optional(
            'orchestration',
            fields.oneOf<Orchestration>('orchestration', ['fixed', 'agent'])?.value,
          )
        : {}),
      sections: [],
      references: references.map(([path, text]) => ({ path, text })),
      examples: [],
    }
    const sections = this.body(block, split.body, allLines.length)
    const examplesRead = examples.map(([path, text]) => this.example(block, path, text))
    this.references(mainFile, split.body, references)
    if (this.input.source === 'builtin' && isBlockFile) {
      for (const intensity of block.intensities) {
        if (!examplesRead.some((example) => example.intensity === intensity)) {
          this.add(
            'example-missing',
            mainFile,
            fields.positionOf('intensities'),
            `内置积木的每一档都要有示例对话；缺少 ${intensity} 的示例`,
          )
        }
      }
    }
    return { ...block, sections, examples: examplesRead }
  }

  private body(block: Block, body: readonly MarkdownLine[], lastLine: number): Section[] {
    const mainFile = block.mainFile
    const isBlockFile = mainFile === BLOCK_FILE
    const allowed: readonly string[] = isBlockFile ? BLOCK_SECTIONS : WORKFLOW_SECTIONS
    const { preamble, parts } = partsAt(body, 2)
    let sawTitle = false
    for (const line of preamble) {
      if (line.text.trim() === '') continue
      const isTitle = !line.code && /^ {0,3}# /.test(line.text)
      if (isTitle && !sawTitle) {
        sawTitle = true
        continue
      }
      this.add(
        'content-before-section',
        mainFile,
        { line: line.line },
        '第一个 ## 小节之前只能有一个 # 标题',
      )
      break
    }
    const sections: Section[] = []
    for (const part of parts) {
      const { title, line } = part.heading
      if (!allowed.includes(title)) {
        this.add(
          'unknown-section',
          mainFile,
          { line },
          `不认识的小节 "## ${title}"；只能是 ${allowed.map((name) => `## ${name}`).join('、')}`,
        )
        continue
      }
      if (sections.some((section) => section.title === title)) {
        this.add('duplicate-section', mainFile, { line }, `小节 "## ${title}" 出现了两次`)
        continue
      }
      const text = textOf(part.lines)
      if (text === '') this.add('section-empty', mainFile, { line }, `小节 "## ${title}" 没有内容`)
      sections.push({ title, line, text })
    }
    const has = (title: string): Section | undefined =>
      sections.find((section) => section.title === title)
    const end = { line: lastLine }

    if (isBlockFile) {
      for (const intensity of INTENSITIES) {
        const section = has(intensity)
        if (block.intensities.includes(intensity) && section === undefined) {
          this.add(
            'intensity-section-missing',
            mainFile,
            end,
            `支持 ${intensity}，但缺少 "## ${intensity}" 小节`,
          )
        } else if (!block.intensities.includes(intensity) && section !== undefined) {
          this.add(
            'intensity-section-extra',
            mainFile,
            section,
            `intensities 里没有 ${intensity}，不能有 "## ${intensity}" 小节`,
          )
        }
      }
      if (has('结束条件') === undefined)
        this.add('section-missing', mainFile, end, '缺少 "## 结束条件" 小节')
      const result = has('结果')
      if (block.level === 'primitive' && result !== undefined) {
        this.add(
          'section-not-allowed',
          mainFile,
          result,
          '基础积木没有结果字段，不能有 "## 结果" 小节',
        )
      } else if (block.level === 'activity' && block.result.length > 0 && result === undefined) {
        this.add('section-missing', mainFile, end, '声明了结果字段，缺少 "## 结果" 小节')
      }
    } else {
      const orchestration = has('编排说明')
      if (
        block.level === 'workflow' &&
        block.orchestration === 'agent' &&
        orchestration === undefined
      ) {
        this.add('section-missing', mainFile, end, 'agent 编排的工作流缺少 "## 编排说明" 小节')
      } else if (
        orchestration !== undefined &&
        !(block.level === 'workflow' && block.orchestration === 'agent')
      ) {
        this.add(
          'section-not-allowed',
          mainFile,
          orchestration,
          '只有 orchestration: agent 的工作流才有 "## 编排说明"',
        )
      }
    }

    const names = new Set(block.params.map((param) => param.name))
    for (const ref of paramRefsOf(body)) {
      if (!names.has(ref.name)) {
        this.add(
          'unknown-param-ref',
          mainFile,
          ref,
          `{{${ref.name}}} 没有在 params 里声明；要写字面的 {{ 请写 \\{{`,
        )
      }
    }
    return sections
  }

  private references(
    mainFile: string,
    body: readonly MarkdownLine[],
    references: readonly (readonly [string, string])[],
  ): void {
    const present = new Set(references.map(([path]) => path))
    const linked = new Set<string>()
    for (const link of linksOf(body)) {
      if (isExternal(link.target)) continue
      const target = link.target.replace(/#.*$/, '')
      if (/^references\/[^/]+\.md$/.test(target) && present.has(target)) {
        linked.add(target)
      } else {
        this.add(
          'broken-link',
          mainFile,
          link,
          `链接 "${link.target}" 指向的附件不存在；附件写成 references/名字.md`,
        )
      }
    }
    for (const [path, text] of references) {
      if (!linked.has(path))
        this.add(
          'unlinked-reference',
          path,
          undefined,
          `附件没有被 ${mainFile} 链接；请在正文里链接它，或删除它`,
        )
      for (const link of linksOf(scan(text.split('\n'), 1))) {
        if (!isExternal(link.target)) {
          this.add(
            'nested-reference-link',
            path,
            link,
            '附件之间不能互相链接；请从主文件直接链接每个附件',
          )
        }
      }
    }
  }

  private example(block: Block, path: string, text: string): Example {
    const split = splitFrontmatter(text)
    const empty: Example = { path, params: [], result: [], turns: [] }
    if (split === undefined) {
      this.add(
        'example-format',
        path,
        { line: 1 },
        '示例必须以 frontmatter 开始（写 intensity 和 result）',
      )
      return empty
    }
    const parsed = parseYaml(split.frontmatter, split.frontmatterLine)
    if (!parsed.ok) {
      this.add('frontmatter-syntax', path, parsed.error, parsed.error.message)
      return empty
    }
    const fields = new FieldReader(this, path, parsed.value)
    fields.checkExampleKeys(block.level === 'activity')
    const written = fields.oneOf<Intensity>('intensity', INTENSITIES, 'unknown-intensity')
    if (written !== undefined && !block.intensities.includes(written.value)) {
      this.add(
        'example-intensity',
        path,
        written,
        `积木不支持 ${written.value}；只支持 ${block.intensities.join('、')}`,
      )
    }
    const params = fields.assignments(fields.entry('params'))
    for (const assignment of params) {
      const spec = block.params.find((param) => param.name === assignment.name)
      if (spec === undefined) {
        this.add('unknown-param', path, assignment, `积木没有参数 "${assignment.name}"`)
        continue
      }
      const problem =
        assignment.forward === undefined
          ? valueProblem(spec, assignment.value)
          : '示例里要写具体的值'
      if (problem !== undefined)
        this.add('param-value', path, assignment, `参数 ${assignment.name} ${problem}`)
    }
    const result = this.exampleResult(block, path, fields)
    const turns = this.turns(path, split.body)
    return {
      path,
      ...(written === undefined ? {} : { intensity: written.value }),
      params,
      result,
      turns,
    }
  }

  private exampleResult(block: Block, path: string, fields: FieldReader): Example['result'] {
    const entry = fields.entry('result')
    if (entry === undefined || block.level !== 'activity') return []
    if (entry.value.kind !== 'mapping') {
      this.add('field-type', path, entry.value, `result 应该是映射，而不是${describe(entry.value)}`)
      return []
    }
    const values: (Position & { name: string; value: ScalarValue })[] = []
    for (const field of entry.value.entries) {
      const spec = block.result.find((candidate) => candidate.name === field.key)
      if (spec === undefined) {
        this.add('example-result', path, field, `积木没有结果字段 "${field.key}"`)
        continue
      }
      if (field.value.kind !== 'scalar') {
        this.add('example-result', path, field.value, `结果字段 ${field.key} 应该是单个值`)
        continue
      }
      const problem = valueProblem(spec, field.value.value)
      if (problem !== undefined)
        this.add('example-result', path, field.value, `结果字段 ${field.key} ${problem}`)
      values.push({
        name: field.key,
        value: field.value.value,
        line: field.line,
        column: field.column,
      })
    }
    const given = new Map(values.map((value) => [value.name, value]))
    for (const spec of block.result) {
      const required =
        spec.requirement.kind === 'always' ||
        (spec.requirement.kind === 'when' &&
          spec.requirement.values.includes(String(given.get(spec.requirement.field)?.value)))
      const forbidden =
        spec.requirement.kind === 'when' &&
        !spec.requirement.values.includes(String(given.get(spec.requirement.field)?.value))
      if (required && !given.has(spec.name)) {
        this.add('example-result', path, entry, `缺少结果字段 ${spec.name}`)
      } else if (forbidden && given.has(spec.name)) {
        const requirement = spec.requirement
        this.add(
          'example-result',
          path,
          given.get(spec.name),
          `${requirement.field} 不是 ${requirement.values.join(' / ')} 时不能报 ${spec.name}`,
        )
      }
    }
    return values
  }

  private turns(path: string, body: readonly MarkdownLine[]): ExampleTurn[] {
    const { preamble, parts } = partsAt(body, 3)
    const stray = preamble.find((line) => line.text.trim() !== '')
    if (stray !== undefined) {
      this.add('example-format', path, { line: stray.line }, '第一个 ### 标题之前不能有内容')
    }
    const turns: ExampleTurn[] = []
    for (const part of parts) {
      const { title, line } = part.heading
      const tool = /^tool[ \t]+([^ \t]+)$/.exec(title)
      for (const inner of part.lines) {
        if (inner.code) continue
        const heading = /^ {0,3}(#{1,6})[ \t]/.exec(inner.text)
        if (heading !== null && heading[1]!.length < 3) {
          this.add(
            'example-format',
            path,
            { line: inner.line },
            '示例里只能用 ### learner、### agent、### tool 名字 这三种标题',
          )
        }
      }
      const text = textOf(part.lines)
      if (title === 'learner' || title === 'agent') {
        turns.push({ role: title, line, text })
      } else if (tool !== null) {
        if (!part.lines.some((inner) => inner.code)) {
          this.add('example-format', path, { line }, '### tool 下面要用一个代码块写工具返回的内容')
        }
        turns.push({ role: 'tool', tool: tool[1]!, line, text })
      } else {
        this.add(
          'example-format',
          path,
          { line },
          `不认识的标题 "### ${title}"；只能是 learner、agent 或 tool 名字`,
        )
      }
    }
    if (parts.length === 0 && stray === undefined) {
      this.add('example-format', path, { line: body[0]?.line ?? 1 }, '示例里没有对话')
    }
    return turns
  }
}

function optional<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V }
}

/** Reads typed fields out of one frontmatter mapping, reporting what is missing or of the wrong type. */
class FieldReader {
  private readonly entries: Map<string, YamlEntry>

  constructor(
    private readonly reader: BlockReader,
    private readonly path: string,
    private readonly map: YamlMap,
  ) {
    this.entries = new Map(map.entries.map((entry) => [entry.key, entry]))
  }

  entry(key: string): YamlEntry | undefined {
    return this.entries.get(key)
  }

  positionOf(key: string): Position {
    const entry = this.entries.get(key)
    return entry === undefined ? { line: 1, column: 1 } : entry
  }

  private add(code: BlockIssueCode, at: Partial<Position> | undefined, message: string): void {
    this.reader.add(code, this.path, at, message)
  }

  /** Reports unknown and misplaced fields, and missing required ones. Without a level, only the common fields. */
  checkKeys(level: BlockLevel | undefined): void {
    const spec = level === undefined ? undefined : FIELDS[level]
    const allowed =
      spec === undefined ? new Set(ALL_FIELDS) : new Set([...spec.required, ...spec.optional])
    for (const entry of this.map.entries) {
      if (!ALL_FIELDS.has(entry.key)) {
        this.add('unknown-field', entry, `不认识的字段 "${entry.key}"`)
      } else if (!allowed.has(entry.key)) {
        this.add('field-not-allowed', entry, `${LEVEL_NAMES[level!]}不能有字段 "${entry.key}"`)
      }
    }
    const required =
      spec?.required ?? COMMON_FIELDS.filter((key) => key !== 'origin' && key !== 'origin_digest')
    for (const key of required) {
      if (!this.entries.has(key))
        this.add('missing-field', { line: 1, column: 1 }, `缺少必填字段 "${key}"`)
    }
  }

  checkExampleKeys(isActivity: boolean): void {
    for (const entry of this.map.entries) {
      if (!['intensity', 'params', 'result'].includes(entry.key)) {
        this.add('unknown-field', entry, `示例里不认识的字段 "${entry.key}"`)
      } else if (entry.key === 'result' && !isActivity) {
        this.add('field-not-allowed', entry, '基础积木没有结果字段，示例里不能写 result')
      }
    }
    if (!this.entries.has('intensity')) {
      this.add('missing-field', { line: 1, column: 1 }, '示例必须写 intensity')
    }
    if (isActivity && !this.entries.has('result')) {
      this.add('missing-field', { line: 1, column: 1 }, '活动积木的示例必须写 result')
    }
  }

  private scalar(key: string): YamlScalar | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.value.kind !== 'scalar') {
      this.add('field-type', entry.value, `${key} 应该是单个值，而不是${describe(entry.value)}`)
      return undefined
    }
    return entry.value
  }

  integer(key: string): Located<number> | undefined {
    const node = this.scalar(key)
    if (node === undefined) return undefined
    if (typeof node.value !== 'number') {
      this.add('field-type', node, `${key} 应该是整数，而不是${describe(node)}`)
      return undefined
    }
    return { value: node.value, line: node.line, column: node.column }
  }

  string(key: string): Located<string> | undefined {
    const node = this.scalar(key)
    if (node === undefined) return undefined
    if (typeof node.value !== 'string') {
      this.add(
        'field-type',
        node,
        `${key} 应该是字符串，而不是${describe(node)}；数字或 true / false 作为文字时请加引号`,
      )
      return undefined
    }
    return { value: node.value, line: node.line, column: node.column }
  }

  text(key: string, max: number): string | undefined {
    const value = this.string(key)
    if (value === undefined) return undefined
    const length = [...value.value].length
    if (length === 0 || length > max || value.value.includes('\n')) {
      this.add(
        'field-format',
        value,
        `${key} 应该是 1 到 ${max} 个字符的一行文字，现在是 ${length} 个`,
      )
    }
    return value.value
  }

  oneOf<T extends string>(
    key: string,
    values: readonly T[],
    code: BlockIssueCode = 'field-format',
  ): Located<T> | undefined {
    const value = this.string(key)
    if (value === undefined) return undefined
    if (!(values as readonly string[]).includes(value.value)) {
      this.add(code, value, `${key} 应该是 ${values.join(' / ')} 之一，不是 "${value.value}"`)
      return undefined
    }
    return value as Located<T>
  }

  /** A list of strings, with duplicates reported. */
  private list(key: string): Located<string>[] {
    const entry = this.entries.get(key)
    if (entry === undefined) return []
    if (entry.value.kind !== 'sequence') {
      this.add('field-type', entry.value, `${key} 应该是列表，而不是${describe(entry.value)}`)
      return []
    }
    const out: Located<string>[] = []
    for (const item of entry.value.items) {
      if (item.kind !== 'scalar' || typeof item.value !== 'string') {
        this.add('field-type', item, `${key} 里的每一项都应该是字符串`)
        continue
      }
      if (out.some((seen) => seen.value === item.value)) {
        this.add('field-format', item, `${key} 里 "${item.value}" 重复了`)
        continue
      }
      out.push({ value: item.value, line: item.line, column: item.column })
    }
    return out
  }

  dimensions(): Located<string>[] {
    const dimensions = this.list('dimensions')
    for (const dimension of dimensions) {
      if (!this.reader.context.dimensions.has(dimension.value)) {
        this.add('unknown-dimension', dimension, `词汇表里没有维度 "${dimension.value}"`)
      }
    }
    return dimensions
  }

  intensities(): Intensity[] {
    const entry = this.entries.get('intensities')
    const list = this.list('intensities')
    if (entry !== undefined && entry.value.kind === 'sequence' && entry.value.items.length === 0) {
      this.add('field-format', entry.value, 'intensities 不能是空列表')
    }
    const out: Intensity[] = []
    for (const item of list) {
      if ((INTENSITIES as readonly string[]).includes(item.value)) out.push(item.value as Intensity)
      else this.add('unknown-intensity', item, `强度只有 tell / hint / ask，不是 "${item.value}"`)
    }
    return out
  }

  tools(): Located<string>[] {
    const tools = this.list('tools')
    for (const tool of tools) {
      if (!TOOL_NAME.test(tool.value)) {
        this.add('field-format', tool, `工具名 "${tool.value}" 只能有小写字母、数字和 _`)
      } else if (!this.reader.context.tools.has(tool.value)) {
        this.add('unknown-tool', tool, `没有注册工具 "${tool.value}"`)
      }
    }
    return tools
  }

  private mapOf(key: string): YamlMap | undefined {
    const entry = this.entries.get(key)
    if (entry === undefined) return undefined
    if (entry.value.kind !== 'mapping') {
      this.add('field-type', entry.value, `${key} 应该是映射，而不是${describe(entry.value)}`)
      return undefined
    }
    return entry.value
  }

  params(): ParamSpec[] {
    const map = this.mapOf('params')
    if (map === undefined) return []
    const out: ParamSpec[] = []
    for (const entry of map.entries) {
      if (!FIELD_NAME.test(entry.key)) {
        this.add(
          'field-format',
          entry,
          `参数名 "${entry.key}" 只能有小写字母、数字和 _，以字母开头，最多 32 个字符`,
        )
        continue
      }
      const spec = this.valueSpec(entry, 'param')
      if (spec === undefined) continue
      const fields = spec.fields
      const defaultEntry = fields.get('default')
      if (defaultEntry === undefined) {
        this.add('missing-field', entry, `参数 ${entry.key} 缺少 default`)
        continue
      }
      if (defaultEntry.value.kind !== 'scalar') {
        this.add('param-default', defaultEntry.value, `参数 ${entry.key} 的 default 应该是单个值`)
        continue
      }
      const problem = valueProblem(spec.spec, defaultEntry.value.value)
      if (problem !== undefined) {
        this.add('param-default', defaultEntry.value, `参数 ${entry.key} 的 default ${problem}`)
        continue
      }
      out.push({
        ...spec.spec,
        name: entry.key,
        default: defaultEntry.value.value,
        ...optional('label', spec.label),
        line: entry.line,
      })
    }
    return out
  }

  result(): ResultFieldSpec[] {
    const map = this.mapOf('result')
    if (map === undefined) return []
    const out: ResultFieldSpec[] = []
    const pending: {
      entry: YamlEntry
      field: string
      values: Located<string>[]
      spec: ResultFieldSpec
    }[] = []
    for (const entry of map.entries) {
      if (!FIELD_NAME.test(entry.key)) {
        this.add(
          'result-field',
          entry,
          `结果字段名 "${entry.key}" 只能有小写字母、数字和 _，以字母开头，最多 32 个字符`,
        )
        continue
      }
      const read = this.valueSpec(entry, 'result')
      if (read === undefined) continue
      const required = read.fields.get('required')
      const when = read.fields.get('required_when')
      let requirement: Requirement = { kind: 'optional' }
      let whenParts: { field: string; values: Located<string>[] } | undefined
      if (required !== undefined && when !== undefined) {
        this.add('required-when', when, 'required 和 required_when 只能写一个')
      } else if (required !== undefined) {
        if (required.value.kind !== 'scalar' || typeof required.value.value !== 'boolean') {
          this.add('field-type', required.value, 'required 应该是 true 或 false')
        } else if (required.value.value) {
          requirement = { kind: 'always' }
        }
      } else if (when !== undefined) {
        whenParts = this.requiredWhen(when)
        if (whenParts !== undefined) {
          requirement = {
            kind: 'when',
            field: whenParts.field,
            values: whenParts.values.map((value) => value.value),
          }
        }
      }
      const spec: ResultFieldSpec = {
        ...read.spec,
        name: entry.key,
        requirement,
        ...optional('label', read.label),
        line: entry.line,
      }
      out.push(spec)
      if (whenParts !== undefined && when !== undefined)
        pending.push({ entry: when, ...whenParts, spec })
    }
    for (const { entry, field, values } of pending) {
      const target = out.find((candidate) => candidate.name === field)
      if (target === undefined) {
        this.add('required-when', entry, `required_when 引用的结果字段 "${field}" 不存在`)
      } else if (target.type !== 'enum') {
        this.add('required-when', entry, `required_when 引用的结果字段 "${field}" 必须是 enum`)
      } else {
        for (const value of values) {
          if (!target.values.includes(value.value)) {
            this.add('required-when', value, `"${value.value}" 不是 ${field} 的取值`)
          }
        }
      }
    }
    return out
  }

  private requiredWhen(entry: YamlEntry): { field: string; values: Located<string>[] } | undefined {
    const node = entry.value
    if (node.kind !== 'mapping' || node.entries.length !== 1) {
      this.add('required-when', node, 'required_when 写成 { 字段名: [取值, …] }，只能有一个字段')
      return undefined
    }
    const only = node.entries[0]!
    if (only.value.kind !== 'sequence' || only.value.items.length === 0) {
      this.add('required-when', only.value, 'required_when 的取值应该是非空列表')
      return undefined
    }
    const values: Located<string>[] = []
    for (const item of only.value.items) {
      if (item.kind !== 'scalar' || typeof item.value !== 'string') {
        this.add('required-when', item, 'required_when 的取值应该是字符串')
        continue
      }
      values.push({ value: item.value, line: item.line, column: item.column })
    }
    return { field: only.key, values }
  }

  /** Reads the type part of a parameter or a result field. Semantic problems are `result-field` for results. */
  private valueSpec(
    entry: YamlEntry,
    kind: 'param' | 'result',
  ): { spec: ValueSpec; fields: Map<string, YamlEntry>; label?: string } | undefined {
    const node = entry.value
    const what = kind === 'param' ? `参数 ${entry.key}` : `结果字段 ${entry.key}`
    const semantic: BlockIssueCode = kind === 'param' ? 'field-format' : 'result-field'
    if (node.kind !== 'mapping') {
      this.add('field-type', node, `${what} 应该写成 { type: …, … } 的映射`)
      return undefined
    }
    const fields = new Map(node.entries.map((field) => [field.key, field]))
    const keys =
      kind === 'param'
        ? ['type', 'values', 'min', 'max', 'default', 'label']
        : ['type', 'values', 'min', 'max', 'required', 'required_when', 'label']
    for (const field of node.entries) {
      if (!keys.includes(field.key))
        this.add('unknown-field', field, `${what} 里不认识的键 "${field.key}"`)
    }
    const type = fields.get('type')
    if (type === undefined) {
      this.add('missing-field', entry, `${what} 缺少 type`)
      return undefined
    }
    if (
      type.value.kind !== 'scalar' ||
      !['enum', 'boolean', 'integer'].includes(String(type.value.value))
    ) {
      this.add('field-format', type.value, `${what} 的 type 只能是 enum、boolean 或 integer`)
      return undefined
    }
    const typeName = type.value.value as ValueSpec['type']
    for (const key of ['values', 'min', 'max'] as const) {
      const field = fields.get(key)
      const applies = key === 'values' ? typeName === 'enum' : typeName === 'integer'
      if (field !== undefined && !applies)
        this.add('field-not-allowed', field, `type 是 ${typeName} 时不能写 ${key}`)
    }
    let label: string | undefined
    const labelEntry = fields.get('label')
    if (labelEntry !== undefined) {
      if (labelEntry.value.kind !== 'scalar' || typeof labelEntry.value.value !== 'string') {
        this.add('field-type', labelEntry.value, 'label 应该是字符串')
      } else if (
        [...labelEntry.value.value].length < 1 ||
        [...labelEntry.value.value].length > 20
      ) {
        this.add('field-format', labelEntry.value, 'label 应该是 1 到 20 个字符')
      } else {
        label = labelEntry.value.value
      }
    }
    const withLabel = <S extends ValueSpec>(spec: S) => ({
      spec,
      fields,
      ...optional('label', label),
    })
    if (typeName === 'boolean') return withLabel({ type: 'boolean' })
    if (typeName === 'enum') {
      const values = fields.get('values')
      if (values === undefined) {
        this.add(
          kind === 'param' ? 'missing-field' : 'result-field',
          entry,
          `${what} 是 enum，缺少 values`,
        )
        return undefined
      }
      if (values.value.kind !== 'sequence' || values.value.items.length === 0) {
        this.add(semantic, values.value, `${what} 的 values 应该是非空列表`)
        return undefined
      }
      const list: string[] = []
      for (const item of values.value.items) {
        if (
          item.kind !== 'scalar' ||
          typeof item.value !== 'string' ||
          !ENUM_VALUE.test(item.value)
        ) {
          this.add(semantic, item, `${what} 的取值只能有小写字母、数字和 -，以字母开头`)
          return undefined
        }
        if (list.includes(item.value)) {
          this.add(semantic, item, `${what} 的取值 "${item.value}" 重复了`)
          return undefined
        }
        list.push(item.value)
      }
      return withLabel({ type: 'enum', values: list })
    }
    const bound = (key: 'min' | 'max'): number | undefined => {
      const field = fields.get(key)
      if (field === undefined) {
        this.add(
          kind === 'param' ? 'missing-field' : 'result-field',
          entry,
          `${what} 是 integer，缺少 ${key}`,
        )
        return undefined
      }
      if (field.value.kind !== 'scalar' || typeof field.value.value !== 'number') {
        this.add('field-type', field.value, `${what} 的 ${key} 应该是整数`)
        return undefined
      }
      return field.value.value
    }
    const min = bound('min')
    const max = bound('max')
    if (min === undefined || max === undefined) return undefined
    if (min > max || max - min > 100) {
      this.add(semantic, fields.get('max')!.value, `${what} 要求 min ≤ max，且范围不超过 100`)
      return undefined
    }
    return withLabel({ type: 'integer', min, max })
  }

  /** Values given to parameters, in a step, an override or an example. */
  assignments(entry: YamlEntry | undefined): ParamAssignment[] {
    if (entry === undefined) return []
    if (entry.value.kind !== 'mapping') {
      this.add('field-type', entry.value, `params 应该是映射，而不是${describe(entry.value)}`)
      return []
    }
    const out: ParamAssignment[] = []
    for (const field of entry.value.entries) {
      if (field.value.kind !== 'scalar') {
        this.add('field-type', field.value, `参数 ${field.key} 应该是单个值`)
        continue
      }
      const value = field.value.value
      const forward = typeof value === 'string' ? FORWARD.exec(value)?.[1] : undefined
      if (forward !== undefined && !FIELD_NAME.test(forward)) {
        this.add('field-format', field.value, `"{{${forward}}}" 不是合法的参数名`)
        continue
      }
      out.push({
        name: field.key,
        value,
        ...optional('forward', forward),
        line: field.value.line,
        column: field.value.column,
      })
    }
    return out
  }

  steps(level: BlockLevel): Step[] {
    const entry = this.entries.get('steps')
    if (entry === undefined || level === 'primitive') return []
    if (entry.value.kind !== 'sequence') {
      this.add('field-type', entry.value, `steps 应该是列表，而不是${describe(entry.value)}`)
      return []
    }
    if (entry.value.items.length === 0 && level !== 'activity') {
      this.add('field-format', entry.value, 'steps 不能是空列表')
    }
    const steps: Step[] = []
    for (const item of entry.value.items) {
      if (item.kind !== 'mapping') {
        this.add('field-type', item, '每一步都写成 "use: 积木" 的映射')
        continue
      }
      const step = this.step(item, level)
      if (step === undefined) continue
      const earlier = steps.find((seen) => seen.id === step.id)
      if (earlier !== undefined) {
        this.add(
          'duplicate-step-id',
          { line: step.line, column: 1 },
          `步骤 id "${step.id}" 重复了（第 ${earlier.line} 行）；同一块积木出现多次时请用 id 区分`,
        )
        continue
      }
      steps.push(step)
    }
    return steps
  }

  private step(item: YamlMap, level: BlockLevel): Step | undefined {
    const fields = new Map(item.entries.map((field) => [field.key, field]))
    for (const field of item.entries) {
      if (!['use', 'id', 'intensity', 'params', 'overrides', 'optional'].includes(field.key)) {
        this.add('unknown-field', field, `步骤里不认识的键 "${field.key}"`)
      } else if (level === 'activity' && (field.key === 'intensity' || field.key === 'overrides')) {
        this.add('field-not-allowed', field, `活动积木的子步骤跟随活动的强度，不能写 ${field.key}`)
      }
    }
    const use = fields.get('use')
    if (use === undefined) {
      this.add('missing-field', item, '步骤缺少 use')
      return undefined
    }
    if (use.value.kind !== 'scalar' || typeof use.value.value !== 'string') {
      this.add('field-type', use.value, 'use 应该是积木的名字')
      return undefined
    }
    const parsed = parseRef(use.value.value)
    if (!parsed.ok) {
      this.add(parsed.code, use.value, parsed.message)
      return undefined
    }
    const ref: BlockRef = {
      written: use.value.value,
      source: parsed.source,
      id: parsed.id,
      key: `${parsed.source}:${parsed.id}`,
      line: use.value.line,
      column: use.value.column,
    }
    let id = parsed.id
    const idEntry = fields.get('id')
    if (idEntry !== undefined) {
      if (
        idEntry.value.kind !== 'scalar' ||
        typeof idEntry.value.value !== 'string' ||
        !ID.test(idEntry.value.value)
      ) {
        this.add('field-format', idEntry.value, '步骤 id 只能有小写字母、数字和 -，以字母开头')
      } else {
        id = idEntry.value.value
      }
    }
    const intensity = level === 'activity' ? undefined : this.intensityOf(fields.get('intensity'))
    const optionalEntry = fields.get('optional')
    let isOptional = false
    if (optionalEntry !== undefined) {
      if (optionalEntry.value.kind !== 'scalar' || typeof optionalEntry.value.value !== 'boolean') {
        this.add('field-type', optionalEntry.value, 'optional 应该是 true 或 false')
      } else {
        isOptional = optionalEntry.value.value
      }
    }
    const overrides: StepOverride[] = []
    const overridesEntry = level === 'activity' ? undefined : fields.get('overrides')
    if (overridesEntry !== undefined) {
      if (overridesEntry.value.kind !== 'mapping') {
        this.add(
          'field-type',
          overridesEntry.value,
          'overrides 写成 { 片段里的步骤 id: { intensity, params } }',
        )
      } else {
        for (const override of overridesEntry.value.entries) {
          if (override.value.kind !== 'mapping') {
            this.add('field-type', override.value, `overrides.${override.key} 应该是映射`)
            continue
          }
          const inner = new Map(override.value.entries.map((field) => [field.key, field]))
          for (const field of override.value.entries) {
            if (field.key !== 'intensity' && field.key !== 'params') {
              this.add(
                'unknown-field',
                field,
                `overrides 里只能写 intensity 和 params，不能写 "${field.key}"`,
              )
            }
          }
          const overrideIntensity = this.intensityOf(inner.get('intensity'))
          overrides.push({
            stepId: override.key,
            line: override.line,
            column: override.column,
            ...optional('intensity', overrideIntensity),
            params: this.assignments(inner.get('params')),
          })
        }
      }
    }
    return {
      id,
      line: item.line,
      use: ref,
      ...optional('intensity', intensity),
      params: this.assignments(fields.get('params')),
      overrides,
      optional: isOptional,
    }
  }

  private intensityOf(entry: YamlEntry | undefined): Located<Intensity> | undefined {
    if (entry === undefined) return undefined
    if (entry.value.kind !== 'scalar' || typeof entry.value.value !== 'string') {
      this.add('field-type', entry.value, 'intensity 应该是 tell、hint 或 ask')
      return undefined
    }
    if (!(INTENSITIES as readonly string[]).includes(entry.value.value)) {
      this.add(
        'unknown-intensity',
        entry.value,
        `强度只有 tell / hint / ask，不是 "${entry.value.value}"`,
      )
      return undefined
    }
    return {
      value: entry.value.value as Intensity,
      line: entry.value.line,
      column: entry.value.column,
    }
  }
}

export function parseBlock(input: BlockInput, context: ParseContext): ParsedBlock {
  const reader = new BlockReader(input, context)
  const block = reader.read()
  return { ...(block === undefined ? {} : { block }), issues: reader.issues }
}

export { LEVEL_NAMES }
