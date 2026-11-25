import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  type BlockInfo,
  type HeldNode,
  type Session,
  type Turn,
  type Understanding,
  type WorkflowInfo,
} from './api.js'
import { KnowledgeGraph, type GraphItem } from './KnowledgeGraph.js'
import { branchLines, nodesInOrder, originTurn } from './live.js'
import { PendingList } from './Pending.js'
import { wordsOf } from './Understanding.js'
import { pendingId, shownFor, stateOf, type Scope } from './UnderstandingView.js'

/**
 * The live companion: the conversation on one side, what is being understood on the other. It reads the same
 * record as the page beside it — the lines, the turns, the candidates waiting on the person, and the library the
 * agent calls — and every action goes through the interfaces that already own it.
 */

const STATE_WORD: Readonly<Record<string, string>> = {
  held: '已确认',
  pending: '等你确认',
  conflict: '有矛盾',
  challenged: '有质疑',
  past: '已放下',
}

const RELATION_WORD: Readonly<Record<string, string>> = {
  supports: '支持',
  contradicts: '矛盾',
  evolves_to: '修正为',
  forks_from: '分叉自',
}

const INTERACTION_WORD: Readonly<Record<string, string>> = {
  tell: '讲解',
  dialog: '对话',
  practice: '练习',
  report: '回顾',
}

const SHORT = 88

function shortened(text: string): string {
  const one = text.replace(/\s+/gu, ' ').trim()
  return one.length > SHORT ? `${one.slice(0, SHORT)}…` : one
}

interface LiveRailProps {
  readonly space: string
  readonly spaceName: string
  readonly thread: string | undefined
  readonly turns: readonly Turn[]
  readonly sessions: readonly Session[]
  readonly understanding: Understanding
  readonly blocks: readonly BlockInfo[]
  readonly workflows: readonly WorkflowInfo[]
  readonly archived: boolean
  readonly guard: (work: () => Promise<unknown>) => void
  readonly onDecided: () => Promise<void>
  readonly onClose: () => void
  readonly onOpenThread: (thread: string) => void
  readonly onOpenNode: (node: string) => void
  readonly onOpenPending: () => void
  readonly onOpenAll: () => void
  readonly onOpenCommons?: () => void
  readonly onAskAbout: (label: string) => void
  readonly onJump: (thread: string, turn: string | undefined) => void
  readonly onFork: (turn: string) => Promise<void>
  readonly onExtract: () => Promise<string | undefined>
  readonly onSave: (label: string) => Promise<void>
}

export function LiveRail(props: LiveRailProps) {
  const { thread, turns, sessions, understanding, blocks, workflows } = props
  const [lens, setLens] = useState<'thread' | 'graph'>('thread')
  const [scope, setScope] = useState<Scope>('thread')
  const [skills, setSkills] = useState(false)
  const [selected, setSelected] = useState<string>()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string>()
  const skillsButton = useRef<HTMLButtonElement>(null)

  const scopeNow: Scope = thread === undefined ? 'space' : scope
  const title =
    thread === undefined
      ? '整个空间'
      : (sessions.find((session) => session.id === thread)?.title ?? '这段对话')
  // The narrative is always this conversation; the graph can widen to the whole space without changing it.
  const threadShown = useMemo(
    () => shownFor(understanding, thread === undefined ? 'space' : 'thread', thread, turns),
    [understanding, thread, turns],
  )
  const graphShown = useMemo(
    () => shownFor(understanding, scopeNow, thread, turns),
    [understanding, scopeNow, thread, turns],
  )
  const nodes = useMemo(
    () =>
      nodesInOrder(
        threadShown.nodes.filter((node) => stateOf(node) !== 'past'),
        turns,
      ),
    [threadShown.nodes, turns],
  )
  const chips = useMemo(() => branchLines(sessions, thread), [sessions, thread])
  const selectedNode =
    selected === undefined
      ? undefined
      : understanding.nodes.find((node) => node.nodeId === selected)
  const relations = graphShown.edges.filter(
    (edge) => !['belongs', 'part', 'pending'].includes(edge.type),
  ).length

  useEffect(() => {
    setSelected(undefined)
  }, [scopeNow, thread, lens])

  const closeSkills = (): void => {
    setSkills(false)
    requestAnimationFrame(() => skillsButton.current?.focus())
  }

  const extract = (): void => {
    if (thread === undefined || props.archived || busy) return
    setBusy(true)
    setNote(undefined)
    props.guard(async () => {
      try {
        const message = await props.onExtract()
        if (message !== undefined && message !== '') setNote(message)
      } finally {
        setBusy(false)
      }
    })
  }

  const save = (event: FormEvent): void => {
    event.preventDefault()
    const label = draft.trim()
    if (label === '' || props.archived || busy) return
    setBusy(true)
    setNote(undefined)
    props.guard(async () => {
      try {
        await props.onSave(label)
        setDraft('')
        setScope('space')
        setNote('已记在整个空间')
      } finally {
        setBusy(false)
      }
    })
  }

  const fork = (turn: string): void => {
    if (busy) return
    setBusy(true)
    setNote(undefined)
    props.guard(async () => {
      try {
        await props.onFork(turn)
      } finally {
        setBusy(false)
      }
    })
  }

  const copy = (id: string): void => {
    const name = `/${id}`
    const writing = navigator.clipboard?.writeText(name)
    if (writing === undefined) {
      setNote(name)
      return
    }
    writing.then(() => setNote(`已复制 ${name}`)).catch(() => setNote(name))
  }

  const chooseGraph = (item: GraphItem): void => {
    if (pendingId(item) !== undefined) {
      props.onOpenPending()
      return
    }
    if (item.kind === undefined || item.kind === 'item') setSelected(item.id)
  }

  return (
    <aside className="rail live-rail" aria-label="旁注">
      <header className="live-head">
        <div className="live-brand">
          <span className="live-mark" aria-hidden="true">
            旁
          </span>
          <div className="live-brand-copy">
            <b>旁注</b>
            <span>
              {props.spaceName} · {title}
            </span>
          </div>
          <button
            type="button"
            className="tool live-close"
            onClick={props.onClose}
            aria-label="收起旁注，回到工作台"
            title="收起旁注，回到工作台"
          >
            收起
          </button>
        </div>
        <div className="live-lenses">
          <div className="segmented" role="group" aria-label="旁注视图">
            <button
              type="button"
              className="plain"
              aria-pressed={lens === 'thread'}
              onClick={() => setLens('thread')}
            >
              脉络
            </button>
            <button
              type="button"
              className="plain"
              aria-pressed={lens === 'graph'}
              onClick={() => setLens('graph')}
            >
              图谱
            </button>
          </div>
          <button
            ref={skillsButton}
            type="button"
            className="tool live-skills-open"
            aria-expanded={skills}
            onClick={() => setSkills((open) => !open)}
          >
            技能
            <span className="count" aria-hidden="true">
              {blocks.length}
            </span>
          </button>
        </div>
      </header>

      {chips.length > 1 && (
        <div className="live-branches" role="group" aria-label="切换对话分支">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="live-branch"
              aria-current={chip.active ? 'page' : undefined}
              data-parent={chip.parent === true ? 'true' : undefined}
              title={chip.label}
              onClick={() => {
                if (!chip.active) props.onOpenThread(chip.id)
              }}
            >
              <span aria-hidden="true">
                {chip.kind === 'parent' ? '↩ ' : chip.kind === 'branch' ? '⑂ ' : '● '}
              </span>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="rail-body live-body" data-lens={lens}>
        {lens === 'thread' ? (
          <>
            <section className="live-section live-waiting">
              <h3>
                等你确认
                <span className="count">{threadShown.pending.length}</span>
              </h3>
              {threadShown.pending.length === 0 ? (
                <p className="rail-empty">Agent 提出的理解会先停在这里，等你确认。</p>
              ) : (
                <PendingList
                  pending={threadShown.pending}
                  limit={2}
                  guard={props.guard}
                  onDecided={props.onDecided}
                />
              )}
              {threadShown.pending.length > 2 && (
                <button type="button" className="link live-more" onClick={props.onOpenPending}>
                  查看全部 {threadShown.pending.length} 条
                </button>
              )}
            </section>

            <section className="live-section">
              <h3>
                {thread === undefined ? '整个空间的脉络' : '这段的脉络'}
                <span className="count">{nodes.length}</span>
                {thread !== undefined && (
                  <button
                    type="button"
                    className="link live-extract"
                    disabled={busy || props.archived}
                    onClick={extract}
                  >
                    {busy ? '正在读…' : '提炼这段'}
                  </button>
                )}
              </h3>
              {nodes.length === 0 ? (
                <p className="rail-empty">
                  {thread === undefined ? '还没有你确认过的理解。' : '这段对话还没有你确认的理解。'}
                </p>
              ) : (
                <ol className="live-thread">
                  {nodes.map((node) => (
                    <LiveNode
                      key={node.nodeId}
                      node={node}
                      turns={turns}
                      thread={thread}
                      used={threadShown.recalled.has(node.nodeId)}
                      busy={busy}
                      archived={props.archived}
                      onOpenNode={props.onOpenNode}
                      onAskAbout={props.onAskAbout}
                      onJump={props.onJump}
                      onFork={fork}
                    />
                  ))}
                </ol>
              )}
            </section>

            <form className="live-write" onSubmit={save}>
              <label htmlFor="live-write">记下我的理解</label>
              <div>
                <input
                  id="live-write"
                  value={draft}
                  maxLength={160}
                  placeholder={props.archived ? '这个空间已归档' : '一句话写下你确认的理解'}
                  disabled={props.archived || busy}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit" disabled={props.archived || busy || draft.trim() === ''}>
                  记下
                </button>
              </div>
              <p className="hint">记在整个空间。</p>
            </form>

            {note !== undefined && (
              <p className="live-note" role="status">
                {note}
              </p>
            )}
          </>
        ) : (
          <section className="live-section live-graph">
            {thread !== undefined && (
              <div className="segmented scope live-scope" role="group" aria-label="图谱范围">
                <button
                  type="button"
                  className="plain"
                  aria-pressed={scopeNow === 'thread'}
                  onClick={() => setScope('thread')}
                >
                  这段对话
                </button>
                <button
                  type="button"
                  className="plain"
                  aria-pressed={scopeNow === 'space'}
                  onClick={() => setScope('space')}
                >
                  整个空间
                </button>
              </div>
            )}
            {graphShown.items.length === 0 ? (
              <p className="rail-empty">
                {scopeNow === 'thread'
                  ? '这段对话还没有产生或用到你确认过的理解。'
                  : '还没有你确认过的理解。'}
              </p>
            ) : (
              <KnowledgeGraph
                items={graphShown.items}
                edges={graphShown.edges}
                height={360}
                selected={selected}
                onSelect={chooseGraph}
              />
            )}
            <p className="hint live-graph-summary">
              {graphShown.nodes.length} 条理解 · {relations} 条关系
            </p>
          </section>
        )}
      </div>

      <footer className="live-foot">
        <button type="button" className="link" onClick={props.onOpenPending}>
          待确认 {understanding.pending.length}
        </button>
        <button type="button" className="link" onClick={props.onOpenAll}>
          整页查看
        </button>
        {props.onOpenCommons !== undefined && (
          <button type="button" className="link" onClick={props.onOpenCommons}>
            公开成果
          </button>
        )}
      </footer>

      {selectedNode !== undefined && lens === 'graph' && (
        <NodeSheet
          node={selectedNode}
          turns={turns}
          onClose={() => setSelected(undefined)}
          onOpenNode={props.onOpenNode}
          onAskAbout={props.onAskAbout}
          onJump={props.onJump}
        />
      )}

      {skills && (
        <div
          className="live-skills"
          role="dialog"
          aria-label="技能库"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              closeSkills()
            }
          }}
        >
          <header className="live-skills-head">
            <b>技能库</b>
            <span>
              {blocks.length} 个块 · {workflows.length} 个流程
            </span>
            <button
              type="button"
              className="tool"
              onClick={closeSkills}
              aria-label="关闭技能库"
              // biome-ignore lint/a11y/noAutofocus: opening the drawer is what moves the focus here
              autoFocus
            >
              关上
            </button>
          </header>
          <div className="live-skills-body">
            <p className="hint">Agent 通过 MCP 调用这些块；页面只列出当前库。</p>
            <section className="live-skill-section">
              <h3>工作流</h3>
              {workflows.map((workflow) => (
                <article key={workflow.id} className="live-workflow">
                  <h4>{workflow.title}</h4>
                  <p>{workflow.description}</p>
                  <p className="hint">
                    {[...workflow.opening, ...workflow.perFocus, ...workflow.closing]
                      .map((id) => blocks.find((block) => block.id === id)?.title ?? id)
                      .join(' → ')}
                  </p>
                </article>
              ))}
              {workflows.length === 0 && <p className="rail-empty">还没有工作流。</p>}
            </section>
            <section className="live-skill-section">
              <h3>块</h3>
              <ul className="live-blocks">
                {blocks.map((block) => (
                  <li key={block.id} className="live-block">
                    <div>
                      <code>/{block.id}</code>
                      <b>{block.title}</b>
                    </div>
                    <p className="hint">
                      {INTERACTION_WORD[block.interaction] ?? block.interaction}
                      {block.maxRounds === undefined ? '' : ` · 最多 ${block.maxRounds} 轮`}
                    </p>
                    <button type="button" className="link" onClick={() => copy(block.id)}>
                      复制调用名
                    </button>
                  </li>
                ))}
              </ul>
              {blocks.length === 0 && <p className="rail-empty">还没有块。</p>}
            </section>
            {note !== undefined && (
              <p className="live-note" role="status">
                {note}
              </p>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

function LiveNode(props: {
  node: HeldNode
  turns: readonly Turn[]
  thread: string | undefined
  used: boolean
  busy: boolean
  archived: boolean
  onOpenNode: (node: string) => void
  onAskAbout: (label: string) => void
  onJump: (thread: string, turn: string | undefined) => void
  onFork: (turn: string) => void
}) {
  const { node } = props
  const state = stateOf(node)
  const origin = originTurn(node, props.turns)
  const anchor =
    node.origin?.thread !== undefined && node.origin.turn !== undefined
      ? { thread: node.origin.thread, turn: node.origin.turn }
      : undefined
  const quote = node.excerpt ?? origin?.text
  return (
    <li className="live-node" data-state={state}>
      <p className="live-node-meta">
        <span className="state-mark" data-state={state} aria-hidden="true" />
        <span>{STATE_WORD[state]}</span>
        <span>{wordsOf(node.origin?.basis, node.wordsBy)}</span>
        {props.used && <span className="live-tag">本次用到</span>}
      </p>
      <button
        type="button"
        className="live-node-title"
        onClick={() => props.onOpenNode(node.nodeId)}
      >
        {node.label}
      </button>
      {quote !== undefined && quote !== '' && <p className="live-quote">{shortened(quote)}</p>}
      <p className="live-node-actions">
        {anchor !== undefined && (
          <button
            type="button"
            className="plain"
            onClick={() => props.onJump(anchor.thread, anchor.turn)}
          >
            原话
          </button>
        )}
        <button type="button" className="plain" onClick={() => props.onAskAbout(node.label)}>
          追问
        </button>
        {anchor !== undefined && anchor.thread === props.thread && (
          <button
            type="button"
            className="plain"
            disabled={props.busy || props.archived}
            onClick={() => props.onFork(anchor.turn)}
          >
            分叉
          </button>
        )}
        <button type="button" className="plain" onClick={() => props.onOpenNode(node.nodeId)}>
          详情
        </button>
      </p>
    </li>
  )
}

function NodeSheet(props: {
  node: HeldNode
  turns: readonly Turn[]
  onClose: () => void
  onOpenNode: (node: string) => void
  onAskAbout: (label: string) => void
  onJump: (thread: string, turn: string | undefined) => void
}) {
  const { node } = props
  const state = stateOf(node)
  const anchor =
    node.origin?.thread !== undefined && node.origin.turn !== undefined
      ? { thread: node.origin.thread, turn: node.origin.turn }
      : undefined
  const quote = node.excerpt ?? originTurn(node, props.turns)?.text
  return (
    <aside className="live-sheet" aria-label="理解详情">
      <header className="live-sheet-head">
        <span>
          {STATE_WORD[state]} · {wordsOf(node.origin?.basis, node.wordsBy)}
        </span>
        <button type="button" className="tool" onClick={props.onClose} aria-label="关闭详情">
          关上
        </button>
      </header>
      <h3>{node.label}</h3>
      {quote !== undefined && quote !== '' && <blockquote>{shortened(quote)}</blockquote>}
      {node.relations.length > 0 && (
        <ul className="live-relations">
          {node.relations.map((relation) => (
            <li key={`${relation.type}-${relation.direction}-${relation.nodeId}`}>
              <span className="hint">{RELATION_WORD[relation.type] ?? relation.type}</span>
              {relation.label}
            </li>
          ))}
        </ul>
      )}
      <p className="live-node-actions">
        {anchor !== undefined && (
          <button
            type="button"
            className="plain"
            onClick={() => props.onJump(anchor.thread, anchor.turn)}
          >
            原话
          </button>
        )}
        <button type="button" className="plain" onClick={() => props.onAskAbout(node.label)}>
          追问
        </button>
        <button type="button" className="plain" onClick={() => props.onOpenNode(node.nodeId)}>
          整页查看
        </button>
      </p>
    </aside>
  )
}
