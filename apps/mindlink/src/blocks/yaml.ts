/**
 * The YAML subset a block's frontmatter is written in (block format, section 3.1).
 *
 * Block mappings and sequences indented with spaces, single-line flow sequences and mappings, plain and quoted
 * strings, decimal integers, `true` / `false` and `#` comments. Nothing else: no anchors, aliases, tags, multi-line
 * strings, floats or nulls. The subset is enough for blocks, every value keeps the line it was written on, and a
 * block shared by someone else cannot reach anything a full YAML loader would do.
 */

export interface YamlScalar {
  readonly kind: 'scalar'
  readonly value: string | number | boolean
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

class SyntaxProblem extends Error {
  constructor(
    readonly line: number,
    readonly column: number,
    message: string,
  ) {
    super(message)
  }
}

interface Line {
  readonly indent: number
  /** The content after the indent, comment and trailing spaces removed. */
  readonly text: string
  readonly line: number
}

const KEY = /^([A-Za-z0-9_][A-Za-z0-9_-]*)[ ]*:(?:[ ]+(.*))?$/
const MAP_START = /^[A-Za-z0-9_][A-Za-z0-9_-]*[ ]*:(?:[ ]|$)/

/** Where a `#` starts a comment: at the start, or after a space, and not inside a quoted scalar. */
function stripComment(text: string): string {
  let quote: '"' | "'" | undefined
  let previous = ''
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quote === undefined) {
      if (char === '#' && (index === 0 || previous === ' ')) return text.slice(0, index)
      if ((char === '"' || char === "'") && opensScalar(text, index)) quote = char
    } else if (quote === '"' && char === '\\') {
      index++
    } else if (char === quote) {
      if (quote === "'" && text[index + 1] === "'") index++
      else quote = undefined
    }
    previous = char
  }
  return text
}

/** Whether a quote at `index` begins a scalar rather than sitting inside a plain one, like the `'` in `it's`. */
function opensScalar(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd()
  return before === '' || /[:\-[{,]$/.test(before)
}

function linesOf(source: readonly string[], firstLine: number): Line[] {
  const lines: Line[] = []
  source.forEach((raw, offset) => {
    const line = firstLine + offset
    const leading = /^[ \t]*/.exec(raw)![0]
    if (leading.includes('\t')) {
      throw new SyntaxProblem(line, leading.indexOf('\t') + 1, '缩进里有制表符；请只用空格缩进')
    }
    const text = stripComment(raw.slice(leading.length)).trimEnd()
    if (text === '') return
    lines.push({ indent: leading.length, text, line })
  })
  return lines
}

/** Reads a frontmatter whose first line is `firstLine` in its file. The top level must be a mapping. */
export function parseYaml(source: readonly string[], firstLine: number): YamlResult {
  try {
    const lines = linesOf(source, firstLine)
    if (lines.length === 0) {
      return { ok: true, value: { kind: 'mapping', entries: [], line: firstLine, column: 1 } }
    }
    const parser = new BlockParser(lines)
    const first = lines[0]!
    if (first.indent !== 0) throw new SyntaxProblem(first.line, 1, '第一行不能缩进')
    if (isSeqItem(first.text)) throw new SyntaxProblem(first.line, 1, '最外层必须是"键: 值"的映射')
    const value = parser.map(0)
    parser.expectEnd()
    return { ok: true, value }
  } catch (error) {
    if (error instanceof SyntaxProblem) {
      return {
        ok: false,
        error: { line: error.line, column: error.column, message: error.message },
      }
    }
    throw error
  }
}

function isSeqItem(text: string): boolean {
  return text === '-' || text.startsWith('- ')
}

class BlockParser {
  private index = 0

  constructor(private readonly lines: Line[]) {}

  expectEnd(): void {
    const rest = this.lines[this.index]
    if (rest !== undefined) throw new SyntaxProblem(rest.line, rest.indent + 1, '缩进不对')
  }

  private node(indent: number): YamlNode {
    const line = this.lines[this.index]!
    return isSeqItem(line.text) ? this.seq(indent) : this.map(indent)
  }

  map(indent: number): YamlMap {
    const start = this.lines[this.index]!
    const entries: YamlEntry[] = []
    const seen = new Set<string>()
    while (this.index < this.lines.length) {
      const line = this.lines[this.index]!
      if (line.indent < indent) break
      if (line.indent > indent) throw new SyntaxProblem(line.line, line.indent + 1, '缩进不对')
      if (isSeqItem(line.text)) {
        throw new SyntaxProblem(line.line, line.indent + 1, '这里应该是"键: 值"，不是列表项')
      }
      const match = KEY.exec(line.text)
      if (match === null) {
        throw new SyntaxProblem(line.line, line.indent + 1, '无法识别这一行；应该写成"键: 值"')
      }
      const key = match[1]!
      const column = line.indent + 1
      if (seen.has(key)) throw new SyntaxProblem(line.line, column, `键 "${key}" 重复了`)
      seen.add(key)
      const rest = match[2]
      let value: YamlNode
      if (rest === undefined || rest === '') {
        this.index++
        const next = this.lines[this.index]
        if (next !== undefined && next.indent > indent) {
          value = this.node(next.indent)
        } else if (next !== undefined && next.indent === indent && isSeqItem(next.text)) {
          value = this.seq(indent)
        } else {
          throw new SyntaxProblem(line.line, column, `键 "${key}" 没有值；不支持空值`)
        }
      } else {
        const offset = line.indent + line.text.length - rest.length
        value = parseInline(rest, line.line, offset + 1)
        this.index++
      }
      entries.push({ key, line: line.line, column, value })
    }
    return { kind: 'mapping', entries, line: start.line, column: start.indent + 1 }
  }

  private seq(indent: number): YamlSeq {
    const start = this.lines[this.index]!
    const items: YamlNode[] = []
    while (this.index < this.lines.length) {
      const line = this.lines[this.index]!
      if (line.indent < indent) break
      if (line.indent > indent) throw new SyntaxProblem(line.line, line.indent + 1, '缩进不对')
      if (!isSeqItem(line.text)) break
      const after = line.text.slice(1)
      const content = after.trimStart()
      const contentIndent = line.indent + 1 + (after.length - content.length)
      if (content === '') {
        this.index++
        const next = this.lines[this.index]
        if (next === undefined || next.indent <= indent) {
          throw new SyntaxProblem(line.line, line.indent + 1, '列表项没有内容；不支持空值')
        }
        items.push(this.node(next.indent))
      } else if (MAP_START.test(content) && !/^["'[{]/.test(content)) {
        // `- key: value` starts a mapping whose keys line up after the dash.
        this.lines[this.index] = { indent: contentIndent, text: content, line: line.line }
        items.push(this.map(contentIndent))
      } else {
        items.push(parseInline(content, line.line, contentIndent + 1))
        this.index++
      }
    }
    return { kind: 'sequence', items, line: start.line, column: start.indent + 1 }
  }
}

/** Reads one value written on a single line: a scalar, or a flow sequence or mapping. */
function parseInline(text: string, line: number, column: number): YamlNode {
  const reader = new FlowReader(text, line, column)
  const value = reader.value(false)
  reader.expectEnd()
  return value
}

class FlowReader {
  private at = 0

  constructor(
    private readonly text: string,
    private readonly line: number,
    private readonly column: number,
  ) {}

  private fail(message: string, at = this.at): never {
    throw new SyntaxProblem(this.line, this.column + at, message)
  }

  private skipSpaces(): void {
    while (this.text[this.at] === ' ') this.at++
  }

  expectEnd(): void {
    this.skipSpaces()
    if (this.at < this.text.length) this.fail('值后面多了内容；含有特殊字符的值请加引号')
  }

  value(inFlow: boolean): YamlNode {
    this.skipSpaces()
    const char = this.text[this.at]
    const column = this.column + this.at
    if (char === undefined) this.fail('缺少值；不支持空值')
    if (char === '[') return this.sequence()
    if (char === '{') return this.mapping()
    if (char === '"' || char === "'") {
      return { kind: 'scalar', value: this.quoted(char), quoted: true, line: this.line, column }
    }
    if (char === '|' || char === '>') this.fail('不支持多行字符串')
    if (char === '&' || char === '*') this.fail('不支持锚点和别名')
    if (char === '!') this.fail('不支持标签')
    if (char === '%' || char === '@' || char === '`') this.fail(`"${char}" 开头的值请加引号`)
    return { kind: 'scalar', value: this.plain(inFlow), quoted: false, line: this.line, column }
  }

  private sequence(): YamlSeq {
    const column = this.column + this.at
    this.at++
    const items: YamlNode[] = []
    this.skipSpaces()
    if (this.text[this.at] === ']') {
      this.at++
      return { kind: 'sequence', items, line: this.line, column }
    }
    for (;;) {
      items.push(this.value(true))
      this.skipSpaces()
      const char = this.text[this.at]
      if (char === ',') {
        this.at++
        continue
      }
      if (char === ']') {
        this.at++
        return { kind: 'sequence', items, line: this.line, column }
      }
      this.fail('列表缺少 "," 或 "]"；流式列表必须写在一行里')
    }
  }

  private mapping(): YamlMap {
    const column = this.column + this.at
    this.at++
    const entries: YamlEntry[] = []
    const seen = new Set<string>()
    this.skipSpaces()
    if (this.text[this.at] === '}') {
      this.at++
      return { kind: 'mapping', entries, line: this.line, column }
    }
    for (;;) {
      this.skipSpaces()
      const keyAt = this.at
      const match = /^[A-Za-z0-9_][A-Za-z0-9_-]*/.exec(this.text.slice(this.at))
      if (match === null) this.fail('这里应该是键')
      const key = match[0]
      this.at += key.length
      this.skipSpaces()
      if (this.text[this.at] !== ':') this.fail(`键 "${key}" 后面缺少 ":"`)
      this.at++
      if (seen.has(key)) this.fail(`键 "${key}" 重复了`, keyAt)
      seen.add(key)
      const value = this.value(true)
      entries.push({ key, line: this.line, column: this.column + keyAt, value })
      this.skipSpaces()
      const char = this.text[this.at]
      if (char === ',') {
        this.at++
        continue
      }
      if (char === '}') {
        this.at++
        return { kind: 'mapping', entries, line: this.line, column }
      }
      this.fail('映射缺少 "," 或 "}"；流式映射必须写在一行里')
    }
  }

  private quoted(quote: '"' | "'"): string {
    const start = this.at
    this.at++
    let value = ''
    for (;;) {
      const char = this.text[this.at]
      if (char === undefined) this.fail('引号没有闭合；字符串必须写在一行里', start)
      if (char === quote) {
        if (quote === "'" && this.text[this.at + 1] === "'") {
          value += "'"
          this.at += 2
          continue
        }
        this.at++
        return value
      }
      if (quote === '"' && char === '\\') {
        const next = this.text[this.at + 1]
        const escapes: Record<string, string> = { '"': '"', '\\': '\\', n: '\n', t: '\t' }
        const escaped = next === undefined ? undefined : escapes[next]
        if (escaped === undefined) this.fail('只支持 \\" \\\\ \\n \\t 这几种转义')
        value += escaped
        this.at += 2
        continue
      }
      value += char
      this.at++
    }
  }

  private plain(inFlow: boolean): string | number | boolean {
    const start = this.at
    let end = this.at
    while (end < this.text.length) {
      const char = this.text[end]!
      if (inFlow && (char === ',' || char === ']' || char === '}')) break
      if (char === ':' && (end + 1 === this.text.length || this.text[end + 1] === ' ')) {
        this.fail('值里的 ": " 会被当成映射；请给这个值加引号', end)
      }
      if (inFlow && (char === '[' || char === '{')) this.fail('请给这个值加引号', end)
      end++
    }
    const raw = this.text.slice(start, end).trimEnd()
    if (raw === '') this.fail('缺少值；不支持空值')
    if (raw.startsWith('- ') || raw === '-') this.fail('这里不能写列表项')
    this.at = start + raw.length
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (/^(true|false|yes|no|on|off)$/i.test(raw)) {
      this.fail('布尔值只写 true 或 false；要写文字请加引号', start)
    }
    if (/^(null|~)$/i.test(raw)) this.fail('不支持空值', start)
    if (/^-?(0|[1-9][0-9]*)$/.test(raw)) {
      const value = Number(raw)
      if (!Number.isSafeInteger(value)) this.fail('整数太大', start)
      return value
    }
    if (/^[-+]?[0-9]+$/.test(raw)) this.fail('整数不能有前导零或加号；要写文字请加引号', start)
    if (/^[-+]?(\.[0-9]|[0-9][0-9_]*\.|[0-9]+[eE])|^[-+]?\.(inf|nan)$|^0[xob]/i.test(raw)) {
      this.fail('只支持十进制整数；要写文字请加引号', start)
    }
    return raw
  }
}
