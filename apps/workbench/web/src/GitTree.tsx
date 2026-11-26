import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import type { HeldNode, PendingCandidate, Session, Turn } from './api.js'
import { wordsOf } from './Understanding.js'
import { stateOf } from './UnderstandingView.js'
import { rowsOf } from './gitRows.js'

/**
 * The conversation as a branch tree. Each confirmed understanding sits on the line it was made on; a branch
 * starts at the turn it left and carries its own items. The rails are drawn from the rows' real positions so the
 * tree stays aligned when rows wrap or a pane is resized.
 */

const STATE_WORD: Readonly<Record<string, string>> = {
  held: '已确认',
  conflict: '有未解决的矛盾',
  challenged: '有质疑待回应',
  past: '已修正或撤回',
}

function shortened(text: string): string {
  const one = text.replace(/\s+/gu, ' ').trim()
  return one.length > 88 ? `${one.slice(0, 88)}…` : one
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
  const rows = useMemo(
    () => rowsOf(props.sessions, props.nodes, props.pending, props.current),
    [props.sessions, props.nodes, props.pending, props.current],
  )
  const labels = useMemo(
    () => new Map(props.nodes.map((node) => [node.nodeId, node.label])),
    [props.nodes],
  )

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
      const center = (element: HTMLElement | undefined): { x: number; y: number } | undefined => {
        const dot = element?.querySelector<HTMLElement>('.git-dot')
        if (element === undefined || dot == null) return undefined
        return {
          x: dot.offsetLeft + dot.offsetWidth / 2,
          y: element.offsetTop + dot.offsetTop + dot.offsetHeight / 2,
        }
      }
      const paths: string[] = []
      const main = rows
        .filter((row) => row.kind === 'node' && row.lane === 0)
        .map((row) => center(elements.get(row.key)))
        .filter((point): point is { x: number; y: number } => point !== undefined)
      const first = main[0]
      const last = main[main.length - 1]
      if (first !== undefined && last !== undefined && first !== last) {
        paths.push(`M${first.x} ${first.y} L${last.x} ${last.y}`)
      }
      for (const row of rows) {
        if (row.kind !== 'branch') continue
        const head = center(elements.get(row.key))
        const from = center(elements.get(row.from))
        if (head === undefined || from === undefined) continue
        paths.push(
          `M${from.x} ${from.y} C${from.x} ${from.y + 18} ${head.x} ${head.y - 16} ${head.x} ${head.y}`,
        )
        const line = rows.filter((each) => each.kind === 'node' && each.thread === row.session.id)
        const last = center(elements.get(line[line.length - 1]?.key ?? ''))
        if (last !== undefined && last.y > head.y) {
          paths.push(`M${head.x} ${head.y} L${last.x} ${last.y}`)
        }
      }
      svg.replaceChildren(
        ...paths.map((d) => {
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          path.setAttribute('d', d)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', 'var(--rule-strong)')
          path.setAttribute('stroke-width', '1.4')
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
    return <p className="rail-empty">对话里还没有整理出理解。点「整理」，确认后会出现在这里。</p>
  }

  return (
    <div className="git-tree" ref={wrap}>
      <svg className="git-rails" ref={rails} aria-hidden="true" />
      <ol className="git-rows">
        {rows.map((row) =>
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
              <p className="git-meta">
                <span className="state-mark" data-state="pending" aria-hidden="true" />
                <span>实时纪要</span>
              </p>
              <p className="git-title">
                {row.candidate.proposal.label ??
                  row.candidate.link?.toLabel ??
                  row.candidate.state?.label ??
                  '一条关系'}
              </p>
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
          ),
        )}
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
  const quote = node.excerpt ?? props.turns.find((turn) => turn.id === origin?.turn)?.text
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
      <p className="git-meta">
        <span className="state-mark" data-state={state} aria-hidden="true" />
        <span>{STATE_WORD[state]}</span>
        <span>{wordsOf(origin?.basis, node.wordsBy)}</span>
      </p>
      <button type="button" className="git-title" onClick={() => props.onOpen(node.nodeId)}>
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
            className="link"
            onClick={() => props.onJump(anchor.thread ?? '', anchor.turn)}
          >
            原话
          </button>
        )}
        <button type="button" className="link" onClick={() => props.onAskAbout(node.label)}>
          追问
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
