import { useMemo, useState } from 'react'
import type { Outline, Session, Turn, Understanding } from './api.js'
import { GitTree } from './GitTree.js'
import { KnowledgeGraph } from './KnowledgeGraph.js'
import { Outline as OutlineView } from './Outline.js'
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
  readonly outline: Outline
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
  const past = useMemo(() => inScope.filter((node) => stateOf(node) === 'past'), [inScope])
  const choose = (next: 'thread' | 'graph'): void => {
    setView(next)
    keep(RAIL_VIEW, next)
  }

  return (
    <aside className="rail" aria-label="理解层">
      <div className="rail-head">
        <span className="rail-mark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="4" cy="9" r="2" fill="currentColor" />
            <circle cx="14" cy="4" r="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="14" cy="14" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path
              d="M5.8 8.2 12.2 4.8M5.8 9.8l6.4 3.4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <div className="segmented ui-segmented" role="group" aria-label="怎么看">
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
            className="tool icon ui-icon-button"
            aria-label="整理对话"
            title="整理对话"
            disabled={tidying}
            data-busy={tidying ? 'true' : undefined}
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
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M8 1.5 9.4 5l3.6 1.4L9.4 7.8 8 11.3 6.6 7.8 3 6.4 6.6 5 8 1.5ZM12.5 10l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="tool icon ui-icon-button"
          aria-label="收起理解层"
          title="收起理解层"
          onClick={props.onClose}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="m10 4-4 4 4 4"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
        <section className="rail-summary" data-waiting={understanding.pending.length > 0}>
          <span className="rail-count" aria-label={`${understanding.pending.length} 条实时纪要`}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M3 4h2M3 8h2M3 12h2M7 4h6M7 8h6M7 12h6"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeDasharray="1.5 1.5"
              />
            </svg>
            <span>{understanding.pending.length}</span>
          </span>
          {understanding.pending.length > 0 && (
            <button
              type="button"
              className="icon ui-icon-button"
              aria-label={`全部接受 ${understanding.pending.length} 条`}
              title="全部接受"
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="m3 8.5 3.2 3L13 4.8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {props.relating && (
            <span className="rail-relating" role="status">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
                <path
                  d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          )}
        </section>

        <section className="rail-section rail-structure">
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
              <span className="rail-empty-mark" role="img" aria-label="还没有理解" />
            )
          ) : props.outline.topics.length > 0 ? (
            <OutlineView
              outline={props.outline}
              thread={thread ?? ''}
              onJump={props.onJump}
              onOpenThread={props.onOpenThread}
            />
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
              <summary aria-label={`${past.length} 条已修正或撤回`}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3 2.3v3h3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{past.length}</span>
              </summary>
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
          <button
            type="button"
            className="link icon ui-icon-button"
            aria-label="整页查看理解"
            title="整页查看理解"
            onClick={props.onOpenAll}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M9.5 3H13v3.5M13 3 8.8 7.2M6.5 13H3V9.5M3 13l4.2-4.2"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
