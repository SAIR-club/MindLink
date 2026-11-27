import { useState } from 'react'
import type { Citation, Evidence, Outline, Turn } from './api.js'
import { AgentTurn, LearnerTurn } from './Turns.js'

/**
 * The conversation itself as a tree. Each topic is a node on the line; its conversation stays inside the node and
 * opens only when the person wants the exact words. Branches and merge points use the same rail, so there is no
 * second summary tree beside the chat.
 */

interface ConversationTreeProps {
  readonly outline: Outline
  readonly thread: string | undefined
  readonly turns: readonly Turn[]
  readonly onOpenThread: (thread: string) => void
  readonly compact?: boolean
  readonly onJump?: (thread: string, turn: string | undefined) => void
  readonly onCite?: (citation: Citation, evidence?: Evidence) => void
  readonly onCandidates?: (reply: string) => Promise<string | undefined>
}

function rangeOf(
  topics: Outline['topics'],
  turns: readonly Turn[],
  index: number,
): [number, number] {
  const starts = topics.map((topic) => {
    const ids = topic.points.map((point) => point.turn)
    const at = turns.findIndex((turn) => ids.includes(turn.id))
    return at < 0 ? Number.MAX_SAFE_INTEGER : at
  })
  const start = starts[index] ?? 0
  const next = starts.slice(index + 1).find((at) => at >= start)
  return [start, next === undefined ? turns.length - 1 : Math.max(start, next - 1)]
}

export function ConversationTree(props: ConversationTreeProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const { outline, turns } = props
  const compact = props.compact === true

  const toggle = (id: string): void => {
    setOpen((held) => {
      const next = new Set(held)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const locate = (turn: string): void => {
    if (props.onJump !== undefined) {
      props.onJump(props.thread ?? '', turn)
      return
    }
    const topic = outline.topics.find((candidate) =>
      candidate.points.some((point) => point.turn === turn),
    )
    if (topic !== undefined) {
      setOpen((held) => new Set([...held, topic.id]))
    }
    window.setTimeout(() => {
      document
        .getElementById(`turn-${turn}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 40)
  }

  return (
    <ol className={compact ? 'conversation-tree compact' : 'conversation-tree'}>
      {outline.topics.map((topic, index) => {
        const [start, end] = rangeOf(outline.topics, turns, index)
        const expanded = open.has(topic.id)
        const branch = outline.branches?.find(
          (item) =>
            item.title === topic.title || topic.points.some((point) => point.turn === item.turn),
        )
        const merge = outline.merges?.find((item) =>
          topic.points.some((point) => point.turn === item.anchor),
        )
        return (
          <li className="conversation-node" key={topic.id}>
            <span className="conversation-dot" aria-hidden="true" />
            <button
              type="button"
              className="conversation-node-title"
              aria-expanded={compact ? undefined : expanded}
              onClick={() => {
                if (compact) {
                  const first = topic.points[0]
                  if (first !== undefined) locate(first.turn)
                } else {
                  toggle(topic.id)
                }
              }}
            >
              {topic.title}
            </button>
            <p className="conversation-node-gist">{topic.gist}</p>
            <ul className="conversation-points">
              {topic.points.map((point) => (
                <li key={`${topic.id}-${point.turn}`}>
                  <button
                    type="button"
                    aria-label={`定位到「${point.text}」的原对话`}
                    onClick={() => locate(point.turn)}
                  >
                    {point.text}
                  </button>
                </li>
              ))}
            </ul>
            {branch !== undefined && (
              <button
                type="button"
                className="conversation-branch ui-button"
                aria-label={`进入「${branch.title}」`}
                onClick={() => props.onOpenThread(branch.id)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4 13V8.5A2.5 2.5 0 0 1 6.5 6H13m-2.6-2.5L13 6l-2.6 2.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {branch.title}
              </button>
            )}
            {merge !== undefined && (
              <button
                type="button"
                className="conversation-merge"
                aria-label={`查看回流到主线的「${merge.summary}」`}
                onClick={() => locate(merge.turn)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M13 3V8.5A2.5 2.5 0 0 1 10.5 11H4m2.6-2.5L4 11l2.6 2.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {merge.summary}
              </button>
            )}
            {!compact && expanded && (
              <div className="conversation-original">
                {turns
                  .slice(start, end + 1)
                  .map((turn) =>
                    turn.speaker === 'learner' ? (
                      <LearnerTurn key={turn.id} turn={turn} thread={props.thread} />
                    ) : (
                      <AgentTurn
                        key={turn.id}
                        turn={turn}
                        onCite={props.onCite ?? (() => undefined)}
                        onCandidates={
                          props.onCandidates ??
                          (() => Promise.resolve<string | undefined>(undefined))
                        }
                      />
                    ),
                  )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
