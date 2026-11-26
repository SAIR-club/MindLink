import { useMemo, useState } from 'react'
import type { Session, Turn, Understanding } from './api.js'
import { GitTree } from './GitTree.js'
import { KnowledgeGraph } from './KnowledgeGraph.js'
import { branchLines, type LineChip } from './lines.js'
import { kept, keep } from './storage.js'
import { pendingId, shownFor, stateOf, type Scope } from './UnderstandingView.js'

/**
 * The understanding layer, beside whatever page is open. It reads one record with the page: the lines of the
 * conversation, what waits for the person, and what they already hold. Every action here acts on that record —
 * switching a line opens that conversation, an item's words lead back to the turn they were said in, and asking
 * about an item seeds the next question. The graph is the same items seen from a distance.
 */

const RAIL_VIEW = 'workbench.rail-view'
/** The rail keeps a few waiting items at hand; the review page has them all. */
const RAIL_PENDING = 3

function railViewWas(): 'thread' | 'graph' {
  const saved = kept(RAIL_VIEW)
  return saved === 'graph' ? 'graph' : 'thread'
}

interface RailProps {
  readonly understanding: Understanding
  /** A model is reading what new candidates bear on; their links come when it is done. */
  readonly relating: boolean
  readonly thread: string | undefined
  readonly turns: readonly Turn[]
  readonly sessions: readonly Session[]
  readonly guard: (work: () => Promise<unknown>) => void
  readonly onDecided: () => Promise<void>
  readonly onOpenNode: (node: string) => void
  readonly onOpenPending: () => void
  readonly onOpenAll: () => void
  readonly onClose: () => void
  readonly onAskAbout: (label: string) => void
  readonly onJump: (thread: string, turn: string | undefined) => void
  readonly onOpenThread: (thread: string) => void
  readonly onTidy: () => Promise<void>
  readonly onAcceptAll: () => Promise<void>
}

export function Rail(props: RailProps) {
  const { understanding, thread, turns } = props
  const [view, setView] = useState<'thread' | 'graph'>(railViewWas)
  const [wanted, setWanted] = useState<Scope>('thread')
  const [tidying, setTidying] = useState(false)
  const [accepting, setAccepting] = useState(false)
  // A conversation is the default once there is one on show; elsewhere only the whole space makes sense.
  const scope: Scope = thread === undefined ? 'space' : wanted
  const shown = useMemo(
    () => shownFor(understanding, scope, thread, turns),
    [understanding, scope, thread, turns],
  )
  const chips = useMemo(() => branchLines(props.sessions, thread), [props.sessions, thread])
  const inScope = useMemo(
    () =>
      scope === 'thread' ? shown.nodes.filter((node) => shown.focus.has(node.nodeId)) : shown.nodes,
    [shown, scope],
  )
  const held = useMemo(() => inScope.filter((node) => stateOf(node) !== 'past'), [inScope])
  const past = useMemo(() => inScope.filter((node) => stateOf(node) === 'past'), [inScope])
  const choose = (next: 'thread' | 'graph'): void => {
    setView(next)
    keep(RAIL_VIEW, next)
  }

  return (
    <aside className="rail" aria-label="理解层">
      <div className="rail-head">
        <h2>理解层</h2>
        <div className="segmented" role="group" aria-label="怎么看">
          <button
            type="button"
            className="plain"
            aria-pressed={view === 'thread'}
            onClick={() => choose('thread')}
          >
            脉络
          </button>
          <button
            type="button"
            className="plain"
            aria-pressed={view === 'graph'}
            onClick={() => choose('graph')}
          >
            图谱
          </button>
        </div>
        {thread !== undefined && (
          <button
            type="button"
            className="tool"
            disabled={tidying}
            title="让模型整理这段对话，新的理解先进待确认"
            onClick={() => {
              setTidying(true)
              props.guard(async () => {
                try {
                  await props.onTidy()
                } finally {
                  setTidying(false)
                }
              })
            }}
          >
            {tidying ? '整理中' : '整理'}
          </button>
        )}
        <button type="button" className="tool" onClick={props.onClose}>
          收起
        </button>
      </div>

      {chips.length > 1 && (
        <div className="rail-lines" role="group" aria-label="切换对话分支">
          {chips.map((chip) => (
            <LineButton key={chip.id} chip={chip} onOpen={props.onOpenThread} />
          ))}
        </div>
      )}

      <div className="rail-body" data-view={view}>
        <section className="rail-section rail-waiting">
          <h3
            data-waiting={understanding.pending.length > 0}
            title="对话里实时整理出的概要。它们默认进入理解层，最后统一收下。"
          >
            实时纪要
            <span className="count">{understanding.pending.length}</span>
          </h3>
          {understanding.pending.length === 0 ? (
            <p className="rail-empty">对话进行时，这里会长出概要。</p>
          ) : (
            <>
              <ul className="live-notes">
                {understanding.pending.slice(0, RAIL_PENDING).map((candidate) => (
                  <li key={candidate.id}>
                    <span className="state-mark" data-state="pending" aria-hidden="true" />
                    <span>
                      {candidate.proposal.label ??
                        candidate.link?.toLabel ??
                        candidate.state?.label ??
                        '一条关系'}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="live-note-actions">
                <button
                  type="button"
                  className="plain"
                  disabled={accepting}
                  onClick={() => {
                    setAccepting(true)
                    props.guard(async () => {
                      try {
                        await props.onAcceptAll()
                      } finally {
                        setAccepting(false)
                      }
                    })
                  }}
                >
                  {accepting ? '收下中' : '全部接受'}
                </button>
                {understanding.pending.length > RAIL_PENDING && (
                  <button type="button" className="link" onClick={props.onOpenPending}>
                    查看全部 {understanding.pending.length} 条
                  </button>
                )}
              </div>
            </>
          )}
          {props.relating && (
            <p className="rail-relating" role="status">
              正在看它和你已确认的理解有什么关系…
            </p>
          )}
        </section>

        <section className="rail-section rail-structure">
          <h3>
            你已确认
            <span className="count">{held.length}</span>
          </h3>
          {thread !== undefined && (
            <div className="segmented scope" role="group" aria-label="范围">
              <button
                type="button"
                className="plain"
                aria-pressed={scope === 'thread'}
                onClick={() => setWanted('thread')}
              >
                这段对话
              </button>
              <button
                type="button"
                className="plain"
                aria-pressed={scope === 'space'}
                onClick={() => setWanted('space')}
              >
                整个空间
              </button>
            </div>
          )}
          {view === 'graph' ? (
            shown.items.length > 0 ? (
              <KnowledgeGraph
                items={shown.items}
                edges={shown.edges}
                onSelect={(item) => {
                  if (pendingId(item) !== undefined) props.onOpenPending()
                  else props.onOpenNode(item.id)
                }}
              />
            ) : (
              <p className="rail-empty">
                {scope === 'thread'
                  ? '这段对话还没有产生或用到你确认过的理解。'
                  : '还没有。确认一条提议，它就会出现在这里。'}
              </p>
            )
          ) : (
            <GitTree
              sessions={props.sessions}
              nodes={understanding.nodes}
              pending={understanding.pending}
              turns={turns}
              current={thread}
              onOpenNode={props.onOpenNode}
              onOpenThread={props.onOpenThread}
              onAskAbout={props.onAskAbout}
              onJump={props.onJump}
            />
          )}
          {past.length > 0 && view === 'thread' && (
            <details className="rail-past">
              <summary>已修正或撤回（{past.length}）</summary>
              <ul>
                {past.map((node) => (
                  <li key={node.nodeId}>
                    <button
                      type="button"
                      className="link"
                      onClick={() => props.onOpenNode(node.nodeId)}
                    >
                      {node.label}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <p className="rail-foot">
          <button type="button" className="link" onClick={props.onOpenAll}>
            整页查看我的理解
          </button>
        </p>
      </div>
    </aside>
  )
}

/** One conversation among the branches beside this one. Both directions use the same button. */
function LineButton({ chip, onOpen }: { chip: LineChip; onOpen: (thread: string) => void }) {
  return (
    <button
      type="button"
      className="rail-line"
      aria-current={chip.active ? 'page' : undefined}
      data-parent={chip.parent === true ? 'true' : undefined}
      title={chip.label}
      onClick={() => {
        if (!chip.active) onOpen(chip.id)
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" fill="none">
        {chip.kind === 'root' ? (
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
        ) : chip.kind === 'parent' ? (
          <path
            d="M13 8H3m3.2-3.5L3 8l3.2 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M4 13V8.5A2.5 2.5 0 0 1 6.5 6H13m-2.6-2.5L13 6l-2.6 2.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span>{chip.label}</span>
    </button>
  )
}
