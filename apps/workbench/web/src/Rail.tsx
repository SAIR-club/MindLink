import { useMemo, useState } from 'react'
import type { HeldNode, Session, Turn, Understanding } from './api.js'
import { KnowledgeGraph } from './KnowledgeGraph.js'
import { PendingList } from './Pending.js'
import { branchLines, nodesInOrder, originTurn, type LineChip } from './lines.js'
import { kept, keep } from './storage.js'
import { wordsOf } from './Understanding.js'
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

const STATE_WORD: Readonly<Record<string, string>> = {
  held: '已确认',
  conflict: '有未解决的矛盾',
  challenged: '有质疑待回应',
  past: '已修正或撤回',
}

const RELATION_WORD: Readonly<Record<string, string>> = {
  supports: '支持',
  contradicts: '矛盾',
  evolves_to: '修正为',
  forks_from: '分叉自',
}

function relationWord(type: string, direction: 'in' | 'out'): string {
  if (type === 'supports') return direction === 'out' ? '支持' : '得到支持'
  if (type === 'evolves_to') return direction === 'out' ? '修正为' : '修正自'
  return RELATION_WORD[type] ?? type
}

function shortened(text: string): string {
  const one = text.replace(/\s+/gu, ' ').trim()
  return one.length > 88 ? `${one.slice(0, 88)}…` : one
}

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
}

export function Rail(props: RailProps) {
  const { understanding, thread, turns } = props
  const [view, setView] = useState<'thread' | 'graph'>(railViewWas)
  const [wanted, setWanted] = useState<Scope>('thread')
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
  const held = useMemo(
    () =>
      nodesInOrder(
        inScope.filter((node) => stateOf(node) !== 'past'),
        turns,
      ),
    [inScope, turns],
  )
  const past = useMemo(() => inScope.filter((node) => stateOf(node) === 'past'), [inScope])
  const labels = new Map(understanding.nodes.map((node) => [node.nodeId, node.label]))
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
            data-waiting={shown.pending.length > 0}
            title="Agent 只能提议。只有你确认过的，才算你的理解。"
          >
            等你确认
            <span className="count">{shown.pending.length}</span>
          </h3>
          {shown.pending.length === 0 ? (
            <p className="rail-empty">
              {scope === 'thread'
                ? '这段对话没有待确认的内容。'
                : 'AI 提出的理解会先停在这里，等你确认。'}
            </p>
          ) : (
            <>
              <PendingList
                pending={shown.pending}
                limit={RAIL_PENDING}
                guard={props.guard}
                onDecided={props.onDecided}
              />
              {shown.pending.length > RAIL_PENDING && (
                <button type="button" className="link rail-more" onClick={props.onOpenPending}>
                  查看全部 {understanding.pending.length} 条
                </button>
              )}
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
          ) : held.length > 0 ? (
            <ol className="rail-nodes">
              {held.map((node) => (
                <RailNode
                  key={node.nodeId}
                  node={node}
                  labels={labels}
                  turns={turns}
                  used={shown.recalled.has(node.nodeId)}
                  onOpen={props.onOpenNode}
                  onAskAbout={props.onAskAbout}
                  onJump={props.onJump}
                />
              ))}
            </ol>
          ) : (
            <p className="rail-empty">
              {scope === 'thread'
                ? '这段对话还没有你确认的理解。'
                : '还没有。确认一条提议，它就会出现在这里。'}
            </p>
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

/** What was confirmed in this conversation, with the words it came from and the two ways back into the work. */
function RailNode(props: {
  node: HeldNode
  labels: ReadonlyMap<string, string>
  turns: readonly Turn[]
  used: boolean
  onOpen: (node: string) => void
  onAskAbout: (label: string) => void
  onJump: (thread: string, turn: string | undefined) => void
}) {
  const { node } = props
  const state = stateOf(node)
  const origin = originTurn(node, props.turns)
  const anchor =
    node.origin?.thread !== undefined && node.origin.turn !== undefined
      ? { thread: node.origin.thread, turn: node.origin.turn }
      : undefined
  const quote = node.excerpt ?? origin?.text
  const topic = node.topics[0]
  return (
    <li className="rail-node" data-state={state}>
      <p className="rail-node-meta">
        <span className="state-mark" data-state={state} aria-hidden="true" />
        <span>{STATE_WORD[state]}</span>
        <span>{wordsOf(node.origin?.basis, node.wordsBy)}</span>
        {topic !== undefined && (
          <span className="rail-node-where" title={`${topic.title}：${topic.section ?? ''}`}>
            {topic.section ?? topic.title}
          </span>
        )}
        {props.used && <span className="rail-node-tag">本次用到</span>}
      </p>
      <button type="button" className="rail-node-title" onClick={() => props.onOpen(node.nodeId)}>
        {node.label}
      </button>
      {quote !== undefined && quote !== '' && (
        <p className="rail-node-quote" title={quote}>
          {shortened(quote)}
        </p>
      )}
      <p className="rail-node-actions">
        {anchor !== undefined && (
          <button
            type="button"
            className="link"
            onClick={() => props.onJump(anchor.thread, anchor.turn)}
          >
            原话
          </button>
        )}
        <button type="button" className="link" onClick={() => props.onAskAbout(node.label)}>
          追问
        </button>
      </p>
      {node.relations.length > 0 && (
        <ul className="rail-node-relations">
          {node.relations.map((relation) => (
            <li
              key={`${relation.type}-${relation.direction}-${relation.nodeId}`}
              data-type={relation.type}
            >
              <span>{relationWord(relation.type, relation.direction)}</span>
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
