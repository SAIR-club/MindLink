/**
 * The YAML a block's frontmatter is written in (block format, section 3.1).
 *
 * Standard YAML 1.2 (core schema), read by the `yaml` library, so whatever layout an editor or Prettier produces is
 * accepted. Four features are refused, because a block can be shared and these are the ones that let a document
 * mean something other than what it shows: anchors (`&a`), aliases (`*a`), explicit tags (`!x`, `!!python/...`) and
 * merge keys (`<<`). Duplicate keys and a top level that is not a mapping are refused as well. Every node keeps the
 * line and column it was written at, so a problem in a block can be reported where it is.
 */

import {
  type Document,
  isAlias,
  isMap,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  parseDocument,
  Scalar,
  visit,
  type YAMLError,
} from 'yaml'

/** A floating-point number (`1.5`, `1e3`, `.inf`). Blocks have no use for one: it fails every typed field check. */
export interface YamlFloat {
  readonly float: number
}

export interface YamlScalar {
  readonly kind: 'scalar'
  /**
   * `null` is an empty value (`key:`, `~`, `null`) and a {@link YamlFloat} is a float. Neither is a string, an
   * integer or a boolean, so every `typeof` check on a field rejects them without a special case.
   */
  readonly value: string | number | boolean | null | YamlFloat
  readonly quoted: boolean
  readonly line: number
  readonly column: number
}

export interface YamlEntry {
  readonly key: string
  readonly line: number
  readonly column: number
  readonly value: YamlNode
}

export interface YamlMap {
  readonly kind: 'mapping'
  readonly entries: readonly YamlEntry[]
  readonly line: number
  readonly column: number
}

export interface YamlSeq {
  readonly kind: 'sequence'
  readonly items: readonly YamlNode[]
  readonly line: number
  readonly column: number
}

export type YamlNode = YamlScalar | YamlMap | YamlSeq

export interface YamlError {
  readonly line: number
  readonly column: number
  readonly message: string
}

export type YamlResult =
  | { readonly ok: true; readonly value: YamlMap }
  | { readonly ok: false; readonly error: YamlError }

/** Something wrong, at an offset into the source. */
interface Problem {
  readonly offset: number
  readonly message: string
}

const INTEGER = /^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$/
/** Anchors and tags written before a node, with the spaces between them and the node. */
const PROPERTIES = /(?:[&!][^\s,[\]{}]*\s+)+$/

/** Reads a frontmatter whose first line is `firstLine` in its file. The top level must be a mapping. */
export function parseYaml(source: readonly string[], firstLine: number): YamlResult {
  const text = source.join('\n')
  const counter = new LineCounter()
  const doc = parseDocument(text, {
    lineCounter: counter,
    version: '1.2',
    schema: 'core',
    uniqueKeys: true,
  })
  const locate: Located = (offset) => {
    const { line, col } = counter.linePos(offset)
    return { line: firstLine - 1 + line, column: col }
  }
  const fail = (problem: Problem): YamlResult => ({
    ok: false,
    error: { ...locate(problem.offset), message: problem.message },
  })

  // The earliest problem wins; on a tie the refusal does, since an alias to an unknown anchor is an alias first.
  const problems = [
    ...refusals(doc, text),
    ...doc.errors.map((error) => syntaxProblem(error, doc, text)),
  ]
  const first = problems.reduce<Problem | undefined>(
    (best, next) => (best === undefined || next.offset < best.offset ? next : best),
    undefined,
  )
  if (first !== undefined) return fail(first)

  const contents = doc.contents
  if (contents === null) {
    return { ok: true, value: { kind: 'mapping', entries: [], line: firstLine, column: 1 } }
  }
  if (!isMap(contents)) {
    return fail({ offset: contents.range?.[0] ?? 0, message: '最外层必须是"键: 值"的映射' })
  }
  const converted = convert(contents, locate, text)
  return converted.ok ? { ok: true, value: converted.node as YamlMap } : fail(converted.problem)
}

/** The library's own complaint, without the excerpt of the source it appends. */
function syntaxProblem(error: YAMLError, doc: Document, text: string): Problem {
  const offset = error.pos[0]
  if (error.code === 'TAB_AS_INDENT') return { offset, message: '缩进里有制表符；请只用空格缩进' }
  if (error.code === 'DUPLICATE_KEY') {
    return { offset, message: `键 "${text.slice(error.pos[0], error.pos[1])}" 重复了` }
  }
  if (error.code === 'MULTIPLE_DOCS') {
    return { offset, message: '只能有一个 YAML 文档；frontmatter 里不要再写 "---" 或 "..."' }
  }
  if (error.message.startsWith('Missing closing')) {
    // The library notices at the end of the file; the problem is where the quote opened.
    let opened = offset
    visit(doc, {
      Scalar(_, node) {
        if (node.range?.[1] === offset && node.range[0] < opened) opened = node.range[0]
      },
    })
    return { offset: opened, message: '引号没有闭合' }
  }
  const message = error.message.replace(/ at line \d+, column \d+:[\s\S]*$/, '')
  return { offset, message: `YAML 语法错误：${message}` }
}

/** Anchors, aliases, explicit tags and merge keys, wherever they are in the document. */
function refusals(doc: Document, text: string): Problem[] {
  const found: Problem[] = []
  const propertiesAt = (node: Node, message: string): void => {
    const start = node.range?.[0] ?? 0
    const before = PROPERTIES.exec(text.slice(Math.max(0, start - 256), start))
    found.push({ offset: before === null ? start : start - before[0].length, message })
  }
  visit(doc, {
    Alias(_, node) {
      found.push({ offset: node.range?.[0] ?? 0, message: '不支持别名（*）；请把内容直接写出来' })
    },
    Node(_, node) {
      if (isAlias(node)) return
      if (node.anchor !== undefined) propertiesAt(node, '不支持锚点（&）；请把内容直接写出来')
      if (node.tag !== undefined) propertiesAt(node, '不支持标签（!）；值的类型由写法决定')
    },
    Pair(_, pair) {
      const key = pair.key
      if (isScalar(key) && key.type === Scalar.PLAIN && key.value === '<<') {
        found.push({
          offset: key.range?.[0] ?? 0,
          message: '不支持合并键（<<）；请把内容直接写出来',
        })
      } else if (isMap(key) || isSeq(key)) {
        found.push({ offset: key.range?.[0] ?? 0, message: '键必须是文字，不能是列表或映射' })
      }
    },
  })
  return found
}

type Located = (offset: number) => { line: number; column: number }
type Converted =
  | { readonly ok: true; readonly node: YamlNode }
  | { readonly ok: false; readonly problem: Problem }

/** The tree of nodes, once the document has passed every refusal. `at` is where an empty value is reported. */
function convert(node: unknown, locate: Located, text: string, at?: number): Converted {
  if (isMap(node)) {
    const entries: YamlEntry[] = []
    for (const pair of node.items) {
      if (!isScalar(pair.key)) continue
      const keyAt = pair.key.range?.[0] ?? 0
      const value = convert(pair.value, locate, text, keyAt)
      if (!value.ok) return value
      entries.push({ key: keyText(pair.key, text), ...locate(keyAt), value: value.node })
    }
    return { ok: true, node: { kind: 'mapping', entries, ...locate(node.range?.[0] ?? 0) } }
  }
  if (isSeq(node)) {
    const items: YamlNode[] = []
    for (const item of node.items) {
      const value = convert(item, locate, text)
      if (!value.ok) return value
      items.push(value.node)
    }
    return { ok: true, node: { kind: 'sequence', items, ...locate(node.range?.[0] ?? 0) } }
  }
  if (!isScalar(node)) {
    // Nothing at all after a `key:` is a missing value, reported at the key.
    return { ok: true, node: { kind: 'scalar', value: null, quoted: false, ...locate(at ?? 0) } }
  }
  const start = node.range?.[0] ?? 0
  const empty = node.range?.[0] === node.range?.[1]
  const value = scalarValue(node, text)
  if (value === undefined) return { ok: false, problem: { offset: start, message: '整数太大' } }
  const quoted = node.type === Scalar.QUOTE_DOUBLE || node.type === Scalar.QUOTE_SINGLE
  return {
    ok: true,
    node: { kind: 'scalar', value, quoted, ...locate(empty && at !== undefined ? at : start) },
  }
}

/** The value of a scalar, or `undefined` for an integer too large to be exact. */
function scalarValue(node: Scalar, text: string): YamlScalar['value'] | undefined {
  const value: unknown = node.value
  if (typeof value !== 'number') return value as string | boolean | null
  const written = node.range ? text.slice(node.range[0], node.range[1]).trim() : ''
  if (!INTEGER.test(written)) return { float: value }
  return Number.isSafeInteger(value) ? value : undefined
}

/** A key is the text it was written as, so `1:` and `true:` are the keys "1" and "true". */
function keyText(key: Scalar, text: string): string {
  if (typeof key.value === 'string') return key.value
  return key.range ? text.slice(key.range[0], key.range[1]).trim() : String(key.value)
}
