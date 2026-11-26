import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Answer, Citation, Evidence, HeldNode, Turn } from './api.js'

/** What the agent said, shared by a conversation and a plan. */

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : '出了点问题。请重试。'

export function WaitingText({ text, afterFive = text }: { text: string; afterFive?: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = performance.now()
    const ticking = setInterval(() => {
      setSeconds(Math.floor((performance.now() - started) / 1000))
    }, 1000)
    return () => clearInterval(ticking)
  }, [])
  return seconds < 5 ? text : `${afterFive}（已 ${seconds} 秒）`
}

/** What a turn needs to reach the understanding drawn from it, and to go the other way. */
interface TurnLinks {
  readonly nodes: readonly HeldNode[]
  /** The turn a node's page sent the person back to. */
  readonly focused: string | undefined
  readonly openNode: (node: string) => void
  /** Opens an item the person holds in another of their spaces. */
  readonly openElsewhere: (space: string, node: string) => void
  /** What to call whoever wrote something. */
  readonly nameOf: (actor: string) => string
  readonly refreshNames: () => Promise<void>
  readonly openPublication: (publication: string) => void
  /** Whether this service allows publishing at all. */
  readonly sharing: boolean
  readonly offer: (thread: string, turn: string) => Promise<string | undefined>
  /**
   * Opens a new line of the conversation on show from one of its turns. Absent where no branch can start: a plan,
   * an archived space, or while a question is still being answered.
   */
  readonly fork?: ((turn: string) => Promise<void>) | undefined
}

export const Links = createContext<TurnLinks>({
  nodes: [],
  focused: undefined,
  openNode: () => undefined,
  openElsewhere: () => undefined,
  nameOf: () => '另一位用户',
  refreshNames: () => Promise.resolve(),
  openPublication: () => undefined,
  sharing: false,
  offer: () => Promise.resolve(undefined),
})

/** Set beside words that may not have come from the person directly. Their own turns need no note. */
function sourceNote(turn: Turn): string | undefined {
  if (turn.by === undefined || turn.writtenWith === 'person') return undefined
  return turn.writtenWith === 'agent' || turn.by.startsWith('actor_agent_')
    ? 'Agent 转述'
    : '来源未记录'
}

/**
 * Starts a new line of the conversation from this turn. The original keeps everything said after it; the branch
 * carries the conversation up to here and goes on from it.
 */
function ForkHere({ turn }: { turn: Turn }) {
  const links = useContext(Links)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<string>()
  const { fork } = links
  // A turn still being sent has no id to branch from yet.
  if (fork === undefined || turn.id === 'asking') return null
  return (
    <>
      <button
        type="button"
        className="link fork-here"
        // Every turn has one; the words it starts from tell them apart when read aloud.
        aria-label={`从这里分叉：${turn.text.slice(0, 24)}`}
        disabled={working}
        onClick={() => {
          setWorking(true)
          setNote(undefined)
          fork(turn.id)
            .catch((error: unknown) => setNote(messageOf(error)))
            .finally(() => setWorking(false))
        }}
      >
        {working ? '正在分叉…' : '从这里分叉'}
      </button>
      {note !== undefined && <span className="hint"> {note}</span>}
    </>
  )
}

/** What the person said, which they can make their own, or see what it became. */
export function LearnerTurn({ turn, thread }: { turn: Turn; thread: string | undefined }) {
  const links = useContext(Links)
  const [note, setNote] = useState<string>()
  const [working, setWorking] = useState(false)
  const made = links.nodes.find((node) => node.origin?.turn === turn.id)
  // A turn still being sent has no id to go back to yet.
  const canOffer = thread !== undefined && turn.id !== 'asking'
  const source = sourceNote(turn)
  return (
    <div id={`turn-${turn.id}`} className="learner-turn" data-focused={links.focused === turn.id}>
      <p className="question" data-held={made !== undefined}>
        {turn.text}
      </p>
      {source !== undefined && <p className="hint turn-source">{source}</p>}
      <p className="turn-actions">
        {made !== undefined ? (
          <button type="button" className="link" onClick={() => links.openNode(made.nodeId)}>
            已记成理解，去看看
          </button>
        ) : (
          canOffer && (
            <button
              type="button"
              className="link own-words"
              disabled={working}
              onClick={() => {
                setWorking(true)
                setNote(undefined)
                links
                  .offer(thread, turn.id)
                  .then(setNote)
                  .catch((error: unknown) => setNote(messageOf(error)))
                  .finally(() => setWorking(false))
              }}
            >
              {working ? '正在记下…' : '这是我的理解'}
            </button>
          )
        )}
        <ForkHere turn={turn} />
      </p>
      {note !== undefined && made === undefined && <p className="hint">{note}</p>}
    </div>
  )
}

/** What the person holds on this in their other spaces. Pointed to only: the answer did not read it. */
function Elsewhere({ answer }: { answer: Answer }) {
  const links = useContext(Links)
  if (answer.elsewhere === undefined) return null
  return (
    <aside className="recalled elsewhere">
      <p className="hint">你在别的空间也确认过相关的理解（这次回答没有用到）：</p>
      <ul>
        {answer.elsewhere.map((item) => (
          <li key={`${item.space}-${item.nodeId}`}>
            <button
              type="button"
              className="link"
              onClick={() => links.openElsewhere(item.space, item.nodeId)}
            >
              {item.label}
            </button>
            <span className="hint">（在“{item.spaceName}”）</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

/** What the person had confirmed on this, set apart from the answer, because it is not evidence. */
function Recalled({ answer }: { answer: Answer }) {
  const links = useContext(Links)
  if (answer.recalled === undefined) return null
  return (
    <aside className="recalled" aria-label="你之前确认过的理解">
      <p className="recalled-head">
        你之前确认过 <span>不是材料，只是提醒</span>
      </p>
      <ul>
        {answer.recalled.map((item) => (
          <li key={item.nodeId}>
            <button type="button" className="link" onClick={() => links.openNode(item.nodeId)}>
              {item.label}
            </button>
            {item.conflict && <span className="hint">（你还有未解决的矛盾）</span>}
            {item.from !== undefined && (
              <span className="hint">
                （你引用的成果，作者：
                <button
                  type="button"
                  className="link"
                  onClick={() => links.openPublication(item.from?.publication ?? '')}
                >
                  {links.nameOf(item.from.author)}
                </button>
                ）
              </span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function AgentTurn(props: {
  turn: Turn
  onCite: (citation: Citation, evidence?: Evidence) => void
  onCandidates: (reply: string) => Promise<string | undefined>
}) {
  const { turn } = props
  const links = useContext(Links)
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle')
  const [note, setNote] = useState<string>()
  if (turn.answer === undefined) {
    return (
      <>
        <p id={`turn-${turn.id}`} className="answer" data-focused={links.focused === turn.id}>
          {turn.text}
        </p>
        {links.fork !== undefined && (
          <p className="turn-actions">
            <ForkHere turn={turn} />
          </p>
        )}
      </>
    )
  }
  const usable =
    turn.answer.status === 'general' ||
    turn.answer.segments.some((segment) => segment.basis === 'material' && segment.weak !== true)
  return (
    <article
      id={`turn-${turn.id}`}
      className="answer-block"
      data-focused={links.focused === turn.id}
    >
      <Recalled answer={turn.answer} />
      <Elsewhere answer={turn.answer} />
      <AnswerBody answer={turn.answer} onCite={props.onCite} />
      {note !== undefined && <p className="hint">{note}</p>}
      <p className="turn-actions">
        {usable && (
          <button
            type="button"
            className="link"
            disabled={state !== 'idle'}
            onClick={() => {
              setState('working')
              props
                .onCandidates(turn.id)
                .then((message) => {
                  setNote(message)
                  setState('done')
                })
                .catch((error: unknown) => {
                  setNote(messageOf(error))
                  setState('idle')
                })
            }}
          >
            {state === 'working' ? (
              <WaitingText text="正在提炼…" />
            ) : state === 'done' ? (
              '已提炼'
            ) : (
              '提炼成待确认的理解'
            )}
          </button>
        )}
        <ForkHere turn={turn} />
      </p>
    </article>
  )
}

/**
 * Where the answer stands in the material: each passage it cites, by the section it sits in. Opening one shows the
 * passage beside the answer, the same as the number in the text.
 */
function Sources({
  answer,
  onCite,
}: {
  answer: Answer
  onCite: (citation: Citation, evidence?: Evidence) => void
}) {
  if (answer.citations.length === 0) return null
  return (
    <ul className="sources" aria-label="这条回答引用的原文">
      {answer.citations.map((citation) => (
        <li key={citation.n}>
          <button
            type="button"
            className="source-chip plain"
            aria-label={`打开原文 ${citation.n}：${citation.section ?? citation.title}`}
            title={citation.quote.slice(0, 160)}
            onClick={() => onCite(citation)}
          >
            <span className="source-n">{citation.n}</span>
            <span className="source-where">
              {citation.section ?? citation.title}
              {citation.section !== undefined && (
                <span className="source-title">{citation.title}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

type Segment = Answer['segments'][number]

function AnswerSentence({
  segment,
  structured,
  general,
  children,
}: {
  segment: Segment
  structured: boolean
  general: boolean
  children?: ReactNode
}) {
  const kind = general
    ? undefined
    : segment.basis === 'question'
      ? 'asked'
      : segment.basis === 'inference'
        ? 'inferred'
        : segment.weak === true
          ? 'weak'
          : 'sourced'
  return (
    <span className={kind} title={kind === 'inferred' ? '模型的推断，材料里没有' : undefined}>
      {kind === 'inferred' && <span className="visually-hidden">（模型推断）</span>}
      {kind === 'weak' && <span className="visually-hidden">（引用待核对）</span>}
      {structured
        ? segment.text.split('**').map((part, index) =>
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts are never reordered
            index % 2 === 1 ? <strong key={index}>{part}</strong> : part,
          )
        : segment.text}
      {children}
    </span>
  )
}

function AnswerBody({
  answer,
  onCite,
}: {
  answer: Answer
  onCite: (citation: Citation, evidence?: Evidence) => void
}) {
  if (answer.status === 'insufficient_evidence') {
    return (
      <p className="no-evidence">材料里没有足够的依据讲这一点。可以换个问法，或者上传相关材料。</p>
    )
  }
  const general = answer.status === 'general'
  const structured = answer.segments.some((segment) => segment.block !== undefined)
  const byNumber = new Map(answer.citations.map((citation) => [citation.n, citation]))
  const chip = (n: number, segment: Segment) => {
    const citation = byNumber.get(n)
    return citation === undefined ? null : (
      <button
        type="button"
        key={n}
        className="cite"
        aria-label={`查看引用 ${n}：${citation.title}`}
        onClick={() =>
          onCite(
            citation,
            segment.evidence?.find((found) => found.n === n),
          )
        }
      >
        {n}
      </button>
    )
  }
  const groups: { list: boolean; blocks: Segment[][] }[] = []
  if (structured) {
    for (const segment of answer.segments) {
      const group = groups.at(-1)
      const block = group?.blocks.at(-1)
      if (segment.block === undefined && block !== undefined) block.push(segment)
      else if (segment.block === 'item' && group?.list === true) group.blocks.push([segment])
      else groups.push({ list: segment.block === 'item', blocks: [[segment]] })
    }
  }
  const blockBody = (segments: readonly Segment[]): ReactNode => {
    const cited = new Map<number, Segment>()
    for (const segment of segments) {
      for (const n of segment.citations) {
        if (!cited.has(n)) cited.set(n, segment)
      }
    }
    return (
      <>
        {segments.map((segment, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stored answers never reorder segments
          <AnswerSentence key={index} segment={segment} structured general={general}>
            {index < segments.length - 1 && /[.!?]$/.test(segment.text.replaceAll('**', '')) && ' '}
          </AnswerSentence>
        ))}
        {[...cited].map(([n, segment]) => chip(n, segment))}
      </>
    )
  }
  return (
    <>
      {answer.status === 'inference_only' && (
        <p className="hint">这条回答没有一句能在材料里找到依据。下面全是模型的推断。</p>
      )}
      {general && (
        <p className="hint">材料里没有讲到这个，下面是模型自己的知识，不是来自你的材料。</p>
      )}
      {structured ? (
        groups.map(({ list, blocks }, index) =>
          list ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: stored answers never reorder blocks
            <ul key={index} className="answer">
              {blocks.map((segments, item) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stored answers never reorder items
                <li key={item}>{blockBody(segments)}</li>
              ))}
            </ul>
          ) : (
            // biome-ignore lint/suspicious/noArrayIndexKey: stored answers never reorder blocks
            <p key={index} className="answer">
              {blockBody(blocks.flat())}
            </p>
          ),
        )
      ) : (
        <p className="answer">
          {general
            ? answer.segments.map(({ text }) => text).join('\n')
            : answer.segments.map((segment, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stored answers never reorder segments
                <AnswerSentence key={index} segment={segment} structured={false} general={false}>
                  {segment.citations.map((n) => chip(n, segment))}
                </AnswerSentence>
              ))}
        </p>
      )}
      {answer.invalidCitations.length > 0 && (
        <p className="hint">
          模型引用了不存在的片段（{answer.invalidCitations.join('、')}），相应的句子已按推断处理。
        </p>
      )}
      {!general && (
        <>
          <Sources answer={answer} onCite={onCite} />
          <p className="legend">
            {answer.segments.some((segment) => segment.basis === 'inference') && (
              <span>
                <span className="inferred">点线</span>：模型的推断，材料里没有
              </span>
            )}
            {answer.segments.some((segment) => segment.weak === true) && (
              <span>
                <span className="weak">虚线</span>：引用可能不对，请核对原文
              </span>
            )}
          </p>
        </>
      )}
    </>
  )
}
