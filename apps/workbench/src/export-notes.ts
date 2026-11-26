import { EDGE } from '@episteme/domain-learn'
import type { HeldNode, Topic } from './understanding.js'

export type NotesExport = {
  readonly fileName: string
  readonly files: readonly { readonly path: string; readonly text: string }[]
}

interface ExportInput {
  readonly spaceName: string
  readonly exportedAt: number
  readonly actor: string
  readonly nodes: readonly HeldNode[]
  readonly confirmedAt: ReadonlyMap<string, number>
  readonly threadTitle: (thread: string) => string | undefined
  readonly authorName: (author: string) => string | undefined
}

const iso = (at: number): string => new Date(at).toISOString()
const day = (at: number): string => iso(at).slice(0, 10)
const topicTitle = (topic: Topic): string => topic.section ?? topic.title
const nameKey = (name: string): string => name.normalize('NFC').toLowerCase()

/** Truncate by Unicode code point, and keep filenames that Windows can extract. */
function fileStem(label: string, fallback: string, limit = 40): string {
  const clean = label.replace(/[<>:"/\\|?*\p{Cc}]/gu, '').trim()
  const short = [...clean]
    .slice(0, limit)
    .join('')
    .replace(/[ .]+$/u, '')
  if (short === '') return fallback
  return /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])\s*(?:\.|$)/iu.test(short)
    ? `_${short}`
    : short
}

function uniqueTitle(label: string, used: Set<string>, fallback: string): string {
  // Obsidian treats these delimiters as link syntax and hides dotfiles.
  const base = fileStem(
    label
      .replace(/[#[\]]/gu, '')
      .trimStart()
      .replace(/^\.+/u, ''),
    fallback,
  )
  let title = base
  for (let n = 2; used.has(nameKey(title)); n += 1) title = `${base} (${n})`
  used.add(nameKey(title))
  return title
}

/** Keep user text literal in Markdown, including things that could otherwise create links or embeds in the vault. */
const literal = (text: string): string => text.replace(/[\\`*_~[\]<>]/gu, '\\$&')
const paragraph = (text: string): string =>
  literal(text.replace(/\s*[\r\n]+\s*/gu, ' ').trim())
    .replace(/^([#+-])/u, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=\s)/u, '$1\\$2')

function relationWord({ type, direction }: HeldNode['relations'][number]): string | undefined {
  if (type === EDGE.supports) return direction === 'out' ? '支持' : '得到支持'
  if (type === EDGE.contradicts) return '矛盾'
  if (type === EDGE.evolvesTo) return direction === 'in' ? '修正自' : '修正为'
  return undefined
}

/** An earlier wording stays addressable in the vault. Walk only revision edges whose ends are both exported. */
function earlierWordings(node: HeldNode, byId: ReadonlyMap<string, HeldNode>): HeldNode[] {
  const visited = new Set([node.nodeId])
  const earlier: HeldNode[] = []
  for (const id of visited) {
    for (const relation of byId.get(id)?.relations ?? []) {
      if (relation.type !== EDGE.evolvesTo || relation.direction !== 'in') continue
      const previous = byId.get(relation.nodeId)
      if (previous === undefined || visited.has(previous.nodeId)) continue
      visited.add(previous.nodeId)
      earlier.push(previous)
    }
  }
  return earlier
}

/**
 * The vault and its links come from the same list of confirmed items. Make all titles first so every wiki link uses
 * the final filename, including after truncation and deduplication. Section names can repeat in different materials,
 * so topic hubs are keyed by the material and section as on the understanding page.
 */
export function buildExportNotes(input: ExportInput): NotesExport {
  const { actor, spaceName, nodes, exportedAt, confirmedAt, threadTitle, authorName } = input
  const included = nodes.filter((node) => node.author === actor || node.adoptedFrom !== undefined)
  const byId = new Map(included.map((node) => [node.nodeId, node]))
  const noteTitles = new Set<string>()
  const notes = included.map((node) => ({
    node,
    title: uniqueTitle(node.label, noteTitles, '理解'),
  }))
  const titles = new Map(notes.map(({ node, title }) => [node.nodeId, title]))
  const topicTitles = new Set<string>()
  const topics = new Map<string, { topic: Topic; title: string; notes: Set<string> }>()
  for (const { node, title } of notes) {
    if (node.author !== actor) continue
    for (const topic of node.topics) {
      const key = JSON.stringify([topic.materialId, topic.section])
      let hub = topics.get(key)
      if (hub === undefined) {
        hub = {
          topic,
          title: uniqueTitle(topicTitle(topic), topicTitles, '主题'),
          notes: new Set(),
        }
        topics.set(key, hub)
      }
      hub.notes.add(title)
    }
  }

  const wikiLink = (title: string): string => {
    // Obsidian can use a bare title unless a topic or the root README has the same basename.
    const key = nameKey(title)
    return key === 'readme' || topicTitles.has(key) ? `[[理解/${title}]]` : `[[${title}]]`
  }
  const confirmation = (node: HeldNode): number | undefined =>
    node.author === actor ? confirmedAt.get(node.nodeId) : node.adoptedFrom?.at

  const files: { path: string; text: string }[] = [
    {
      path: 'README.md',
      text: [
        `# ${paragraph(spaceName)}`,
        `导出日期：${day(exportedAt)}`,
        `理解 ${included.length} 条，主题 ${topics.size} 个。`,
        '这些是你已确认的理解，由 Episteme 导出。',
        '',
      ].join('\n\n'),
    },
  ]
  for (const { node, title } of notes) {
    const at = confirmation(node)
    const own = node.author === actor
    const noteTopics = own ? node.topics : []
    const source = [...new Set(noteTopics.map((topic) => topic.title))]
    const frontmatter = [
      '---',
      `id: ${JSON.stringify(node.nodeId)}`,
      // A directly saved note can have no review in the scene view.
      `confirmed: ${at === undefined ? 'null' : iso(at)}`,
      `topics: ${JSON.stringify([...new Set(noteTopics.map(topicTitle))])}`,
      `source: ${JSON.stringify(source)}`,
      ...(node.conflict ? ['conflict: true'] : []),
      ...(own ? [] : [`from: ${JSON.stringify(authorName(node.author) ?? '另一位用户')}`]),
      '---',
    ].join('\n')
    const sections = [frontmatter, paragraph(node.label)]

    const conversation =
      own && node.origin?.thread !== undefined ? threadTitle(node.origin.thread) : undefined
    const origins = [
      ...(conversation === undefined ? [] : [`对话《${paragraph(conversation)}》`]),
      ...source.map((name) => `材料《${paragraph(name)}》`),
    ]
    // A citation carries the published wording. Its author's underlying quote and conversation stay with the author.
    const quote = own ? node.excerpt : undefined
    if (origins.length > 0 || quote !== undefined) {
      sections.push('## 来源')
      if (quote !== undefined)
        sections.push(
          quote
            .split(/\r?\n/u)
            .map((line) => `> ${literal(line)}`)
            .join('\n'),
        )
      if (origins.length > 0) sections.push(origins.join('、'))
    }

    const relations = node.relations.flatMap((relation) => {
      const other = titles.get(relation.nodeId)
      const word = relationWord(relation)
      return other === undefined || word === undefined ? [] : [`- ${word} ${wikiLink(other)}`]
    })
    if (relations.length > 0) sections.push('## 关系', relations.join('\n'))

    const earlier = earlierWordings(node, byId).sort(
      (left, right) => (confirmation(right) ?? 0) - (confirmation(left) ?? 0),
    )
    if (earlier.length > 0) {
      sections.push(
        '## 修改记录',
        earlier
          .map((previous) => {
            const date = confirmation(previous)
            return `- ${date === undefined ? '' : `${day(date)} `}${paragraph(previous.label)}`
          })
          .join('\n'),
      )
    }
    files.push({ path: `理解/${title}.md`, text: `${sections.join('\n\n')}\n` })
  }

  for (const { topic, title, notes } of topics.values()) {
    const links = [...notes].map((note) => `- ${wikiLink(note)}`)
    files.push({
      path: `主题/${title}.md`,
      text: `# ${paragraph(topicTitle(topic))}\n\n${links.join('\n')}\n`,
    })
  }
  return { fileName: `${fileStem(spaceName, '空间', 80)}-我的理解.zip`, files }
}
