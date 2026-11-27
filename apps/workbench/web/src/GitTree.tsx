import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { HeldNode, PendingCandidate, Session, Turn } from './api.js'
import { stateOf } from './UnderstandingView.js'
import { rowsOf } from './gitRows.js'

/**
 * The conversation as a branch tree. Each item sits on the line it was made on; the wire, the point and the
 * item's position carry the state, so the tree needs no captions to explain itself.
 */

function shortened(text: string): string {
  const one = text.replace(/\s+/gu, ' ').trim()
  return one.length > 88 ? `${one.slice(0, 88)}…` : one
}

/** A short label that says nearly the same thing as its quote should appear once. */
function repeatsLabel(label: string, quote: string): boolean {
  const grams = (text: string): ReadonlySet<string> => {
    const clean = text.replace(/[^\p{L}\p{N}]/gu, '')
    const found = new Set<string>()
    for (let index = 0; index + 1 < clean.length; index += 1)
      found.add(clean.slice(index, index + 2))
    return found
  }
  const a = grams(label)
  const b = grams(quote)
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return shared / Math.min(a.size, b.size) >= 0.72
}

function noteText(candidate: PendingCandidate): string {
  return candidate.proposal.label ?? candidate.link?.toLabel ?? candidate.state?.label ?? '一条关系'
}

/** The question that led into a turn, so a conclusion reads as an answer rather than a floating claim. */
function questionBefore(turn: string | undefined, turns: readonly Turn[]): string | undefined {
  if (turn === undefined) return undefined
  const at = turns.findIndex((candidate) => candidate.id === turn)
  if (at < 0) return undefined
  for (let index = at - 1; index >= 0; index -= 1) {
    const turn = turns[index]
    if (turn?.speaker === 'learner') return turn.text
  }
  return undefined
}

interface GitTreeProps {
  readonly sessions: readonly Session[]
  readonly nodes: readonly HeldNode[]
  readonly pending: readonly PendingCandidate[]
  readonly turns: readonly Turn[]
  readonly current: string | undefined
  readonly onOpenNode: (node: string) => void
  readonly onOpenThread: (thread: string) => void
  readonly onAskAbout: (label: string) => void
  readonly onJump: (thread: string, turn: string | undefined) => void
}

export function GitTree(props: GitTreeProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const rails = useRef<SVGSVGElement>(null)
  const rows = useMemo(() => {
    const built = rowsOf(props.sessions, props.nodes, props.pending, props.current)
    const held = props.nodes.map((node) => node.label)
    return built.filter(
      (row) =>
        row.kind !== 'note' || !held.some((label) => repeatsLabel(label, noteText(row.candidate))),
    )
  }, [props.sessions, props.nodes, props.pending, props.current])
  const labels = useMemo(
    () => new Map(props.nodes.map((node) => [node.nodeId, node.label])),
    [props.nodes],
  )
  // A topic label appears where the discussion changes topic. The wire keeps the chronology; the label gives it shape.
  const marked = useMemo(() => {
    let previousTopic: string | undefined
    let previousQuestion: string | undefined
    return rows.map((row) => {
      const nodeTopic = row.kind === 'node' ? row.node.topics[0] : undefined
      const noteTopic = row.kind === 'note' ? row.candidate.topics?.[0] : undefined
      const topic = nodeTopic?.section ?? nodeTopic?.title ?? noteTopic?.section ?? noteTopic?.title
      const question =
        row.kind === 'node'
          ? questionBefore(row.node.origin?.turn, props.turns)
          : row.kind === 'note'
            ? questionBefore(row.candidate.origin?.turn, props.turns)
            : undefined
      const freshTopic = topic !== undefined && topic !== previousTopic
      const freshQuestion = question !== undefined && question !== previousQuestion
      if (topic !== undefined) previousTopic = topic
      if (question !== undefined) previousQuestion = question
      return { row, topic, freshTopic, question, freshQuestion }
    })
  }, [rows, props.turns])

  useEffect(() => {
    const box = wrap.current
    const svg = rails.current
    if (box === null || svg === null) return
    const draw = (): void => {
      const elements = new Map(
        [...box.querySelectorAll<HTMLElement>('.git-row')].map((element) => [
          element.dataset.key ?? '',
          element,
        ]),
      )
      const svgBox = svg.getBoundingClientRect()
      const center = (element: HTMLElement | undefined): { x: number; y: number } | undefined => {
        const dot = element?.querySelector<HTMLElement>('.git-dot')
        if (element === undefined || dot == null) return undefined
        const dotBox = dot.getBoundingClientRect()
        return {
          x: dotBox.left + dotBox.width / 2 - svgBox.left,
          y: dotBox.top + dotBox.height / 2 - svgBox.top,
        }
      }
      const paths: { d: string; kind: 'main' | 'branch' | 'live' }[] = []
      const centreOf = (row: (typeof rows)[number] | undefined) =>
        row === undefined ? undefined : center(elements.get(row.key))
      const main = rows
        .filter((row) => row.kind === 'node' && row.lane === 0)
        .map(centreOf)
        .filter((point): point is { x: number; y: number } => point !== undefined)
      const first = main[0]
      const last = main[main.length - 1]
      if (first !== undefined && last !== undefined && first !== last) {
        paths.push({ d: `M${first.x} ${first.y} L${last.x} ${last.y}`, kind: 'main' })
      }
      for (const row of rows) {
        if (row.kind !== 'branch') continue
        const head = centreOf(row)
        const from = center(elements.get(row.from))
        if (head === undefined || from === undefined) continue
        paths.push({
          d: `M${from.x} ${from.y} C${from.x} ${from.y + 20} ${head.x} ${head.y - 18} ${head.x} ${head.y}`,
          kind: 'branch',
        })
        const line = rows.filter((each) => each.kind === 'node' && each.thread === row.session.id)
        const end = centreOf(line[line.length - 1] ?? row)
        if (end !== undefined && end.y > head.y) {
          paths.push({ d: `M${head.x} ${head.y} L${end.x} ${end.y}`, kind: 'branch' })
        }
      }
      // Notes are the working end of the line: a dashed wire runs from the last held node through them.
      const notes = rows.filter((row) => row.kind === 'note')
      const anchor = rows
        .filter((row) => row.lane === 0 && (row.kind === 'node' || row.kind === 'branch'))
        .at(-1)
      const start = centreOf(anchor ?? notes[0] ?? rows[0])
      const wire = notes
        .map(centreOf)
        .filter((point): point is { x: number; y: number } => point !== undefined)
      if (start !== undefined && wire.length > 0) {
        paths.push({
          d: [`M${start.x} ${start.y}`, ...wire.map((point) => `L${point.x} ${point.y}`)].join(' '),
          kind: 'live',
        })
        const tail = wire[wire.length - 1]
        if (tail !== undefined) {
          paths.push({
            d: `M${tail.x} ${tail.y} L${tail.x} ${tail.y + 22}`,
            kind: 'live',
          })
        }
      }
      svg.replaceChildren(
        ...paths.map(({ d, kind }) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', d)
          path.setAttribute('class', `git-rail git-rail-${kind}`)
          return path
        }),
      )
      svg.setAttribute('width', '80')
      svg.setAttribute('height', String(box.offsetHeight))
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(box)
    return () => observer.disconnect()
  }, [rows])

  if (rows.length === 0) {
    return <span className="git-empty" role="img" aria-label="还没有理解" />
  }

  return (
    <div className="git-tree" ref={wrap}>
      <svg className="git-rails" ref={rails} aria-hidden="true" />
      <ol className="git-rows">
        {marked.flatMap(({ row, topic, freshTopic, question, freshQuestion }) => {
          const lead: ReactNode[] = []
          if (freshTopic && topic !== undefined) {
            lead.push(
              <li key={`topic-${row.key}`} className="git-topic" aria-hidden="true">
                {topic}
              </li>,
            )
          }
          if (freshQuestion && question !== undefined) {
            lead.push(
              <li key={`question-${row.key}`} className="git-question">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 3.5h10v7H7.5L4.5 13v-2.5H3v-7Z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{shortened(question)}</span>
              </li>,
            )
          }
          const body =
            row.kind === 'note' ? (
              <li
                key={row.key}
                className="git-row git-note"
                data-key={row.key}
                data-lane={row.lane}
                data-live="true"
                style={{ '--lane': row.lane } as CSSProperties}
              >
                <span className="git-dot" data-state="pending" aria-hidden="true" />
                <button
                  type="button"
                  className="git-title"
                  aria-label="定位到这条纪要的原对话"
                  onClick={() => props.onJump(props.current ?? '', row.candidate.origin?.turn)}
                >
                  {noteText(row.candidate)}
                </button>
              </li>
            ) : row.kind === 'branch' ? (
              <li
                key={row.key}
                className="git-row git-branch"
                data-key={row.key}
                data-lane={row.lane}
                style={{ '--lane': row.lane } as CSSProperties}
              >
                <span className="git-dot" aria-hidden="true" />
                <button
                  type="button"
                  className="git-branch-title"
                  onClick={() => props.onOpenThread(row.session.id)}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none">
                    <path
                      d="M4 13V8.5A2.5 2.5 0 0 1 6.5 6H13m-2.6-2.5L13 6l-2.6 2.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {row.label}
                </button>
              </li>
            ) : (
              <GitNodeRow
                key={row.key}
                node={row.node}
                lane={row.lane}
                rowKey={row.key}
                current={props.current}
                turns={props.turns}
                labels={labels}
                onOpen={props.onOpenNode}
                onAskAbout={props.onAskAbout}
                onJump={props.onJump}
              />
            )
          return [...lead, body]
        })}
      </ol>
    </div>
  )
}

function GitNodeRow(props: {
  node: HeldNode
  lane: number
  rowKey: string
  current: string | undefined
  turns: readonly Turn[]
  labels: ReadonlyMap<string, string>
  onOpen: (node: string) => void
  onAskAbout: (label: string) => void
  onJump: (thread: string, turn: string | undefined) => void
}) {
  const { node } = props
  const state = stateOf(node)
  const origin = node.origin
  const source = node.excerpt ?? props.turns.find((turn) => turn.id === origin?.turn)?.text
  const quote = source !== undefined && !repeatsLabel(node.label, source) ? source : undefined
  const anchor =
    origin !== undefined && origin.thread !== undefined && origin.turn !== undefined
      ? origin
      : undefined
  return (
    <li
      className="git-row git-node"
      data-key={props.rowKey}
      data-lane={props.lane}
      data-live={origin?.thread === props.current ? 'true' : undefined}
      style={{ '--lane': props.lane } as CSSProperties}
    >
      <span className="git-dot" data-state={state} aria-hidden="true" />
      <button
        type="button"
        className="git-title"
        aria-label={`定位到「${node.label}」的原对话`}
        onClick={() => {
          if (origin?.thread !== undefined) props.onJump(origin.thread, origin.turn)
          else props.onOpen(node.nodeId)
        }}
      >
        {node.label}
      </button>
      {quote !== undefined && quote !== '' && (
        <p className="git-quote" title={quote}>
          {shortened(quote)}
        </p>
      )}
      <p className="git-actions">
        {anchor !== undefined && (
          <button
            type="button"
            className="link icon ui-icon-button"
            aria-label="查看当时的对话"
            title="查看当时的对话"
            onClick={() => props.onJump(anchor.thread ?? '', anchor.turn)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 3.5h10v7H7.5L4.5 13v-2.5H3v-7Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 6.3h5M5.5 8.4h3"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="link icon ui-icon-button"
          aria-label="追问这条理解"
          title="追问这条理解"
          onClick={() => props.onAskAbout(node.label)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 3.5h10v7H7.5L4.5 13v-2.5H3v-7Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.6.3-.8.7-.8 1.2"
              stroke="currentColor"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            <circle cx="8" cy="10.4" r="0.6" fill="currentColor" />
          </svg>
        </button>
      </p>
      {node.relations.length > 0 && (
        <ul className="git-relations">
          {node.relations.map((relation) => (
            <li
              key={`${relation.type}-${relation.direction}-${relation.nodeId}`}
              data-type={relation.type}
            >
              <button type="button" className="link" onClick={() => props.onOpen(relation.nodeId)}>
                {props.labels.get(relation.nodeId) ?? relation.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
