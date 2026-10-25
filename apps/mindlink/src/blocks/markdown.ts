/**
 * The little of Markdown the block format reads: the frontmatter, headings, fenced code blocks, links and
 * `{{param}}` references.
 *
 * Fenced code is text. A heading inside a fence is not a heading and a link inside one is not a link; nothing in a
 * fence is ever run or interpreted.
 */

export interface MarkdownLine {
  readonly text: string
  /** 1-based line number in the file. */
  readonly line: number
  /** Whether the line is inside a fenced code block, its fences included. */
  readonly code: boolean
}

export interface Heading {
  readonly level: number
  readonly title: string
  readonly line: number
}

export interface Split {
  /** The frontmatter's lines, without the two `---` lines. */
  readonly frontmatter: readonly string[]
  /** The line number of the first frontmatter line. */
  readonly frontmatterLine: number
  readonly body: readonly MarkdownLine[]
}

/** Separates the frontmatter from the body, or returns `undefined` when the file does not start with one. */
export function splitFrontmatter(text: string): Split | undefined {
  const lines = text.split('\n')
  if (lines[0]?.trimEnd() !== '---') return undefined
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---')
  if (end === -1) return undefined
  return {
    frontmatter: lines.slice(1, end),
    frontmatterLine: 2,
    body: scan(lines.slice(end + 1), end + 2),
  }
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/

/** Marks which lines are fenced code. An unclosed fence runs to the end of the file, as in CommonMark. */
export function scan(lines: readonly string[], firstLine: number): MarkdownLine[] {
  const out: MarkdownLine[] = []
  let fence: { readonly char: string; readonly length: number } | undefined
  lines.forEach((text, offset) => {
    const line = firstLine + offset
    if (fence === undefined) {
      const open = FENCE_OPEN.exec(text)
      if (open !== null && !(open[1]!.startsWith('`') && open[2]!.includes('`'))) {
        fence = { char: open[1]![0]!, length: open[1]!.length }
        out.push({ text, line, code: true })
        return
      }
      out.push({ text, line, code: false })
      return
    }
    out.push({ text, line, code: true })
    const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)
    if (close !== null && close[1]![0] === fence.char && close[1]!.length >= fence.length) {
      fence = undefined
    }
  })
  return out
}

export function headingOf(line: MarkdownLine): Heading | undefined {
  if (line.code) return undefined
  const match = HEADING.exec(line.text)
  if (match === null) return undefined
  return {
    level: match[1]!.length,
    title: (match[2] ?? '').replace(/[ \t]+#+$/, ''),
    line: line.line,
  }
}

export interface Part {
  readonly heading: Heading
  readonly lines: readonly MarkdownLine[]
}

/** Splits lines at every heading of exactly `level`. What comes before the first one is the preamble. */
export function partsAt(
  lines: readonly MarkdownLine[],
  level: number,
): { readonly preamble: readonly MarkdownLine[]; readonly parts: readonly Part[] } {
  const preamble: MarkdownLine[] = []
  const parts: { heading: Heading; lines: MarkdownLine[] }[] = []
  for (const line of lines) {
    const heading = headingOf(line)
    if (heading !== undefined && heading.level === level) {
      parts.push({ heading, lines: [] })
    } else if (parts.length === 0) {
      preamble.push(line)
    } else {
      parts[parts.length - 1]!.lines.push(line)
    }
  }
  return { preamble, parts }
}

/** The text of some lines, without the blank lines around it. */
export function textOf(lines: readonly MarkdownLine[]): string {
  return lines
    .map((line) => line.text)
    .join('\n')
    .replace(/^\s*\n/, '')
    .trim()
}

export interface Link {
  readonly target: string
  readonly line: number
  readonly column: number
}

const LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g

/** The link targets outside fenced code and inline code spans. */
export function linksOf(lines: readonly MarkdownLine[]): Link[] {
  const links: Link[] = []
  for (const line of lines) {
    if (line.code) continue
    // Blank out inline code, keeping columns.
    const text = line.text.replace(/(`+)[^`]*?\1/g, (span) => ' '.repeat(span.length))
    for (const match of text.matchAll(LINK)) {
      const target = match[1]!
      links.push({ target, line: line.line, column: match.index + match[0].indexOf(target) + 1 })
    }
  }
  return links
}

/** Whether a link points outside the block: a URL, a mail address, or an anchor in the same file. */
export function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')
}

export interface ParamRef {
  readonly name: string
  readonly line: number
  readonly column: number
}

/** Every `{{name}}` in the text, code included (it is text too). `\{{` is a literal `{{`. */
export function paramRefsOf(lines: readonly MarkdownLine[]): ParamRef[] {
  const refs: ParamRef[] = []
  for (const line of lines) {
    for (const match of line.text.matchAll(/(\\?)\{\{([^}]*)\}\}/g)) {
      if (match[1] === '\\') continue
      refs.push({ name: match[2]!.trim(), line: line.line, column: match.index + 1 })
    }
  }
  return refs
}
