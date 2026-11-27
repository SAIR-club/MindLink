import { useState } from 'react'
import { api, type PendingCandidate } from './api.js'
import { wordsOf } from './Understanding.js'

/** A candidate to decide, with the links that wait on it. */
interface Waiting {
  readonly candidate: PendingCandidate
  readonly links: readonly PendingCandidate[]
}

/**
 * What waits, with each link that can be confirmed only after a waiting candidate shown under that candidate rather
 * than as an item of its own: deciding the candidate is what comes first, and the link says what it would connect to.
 */
function withWaitingLinks(pending: readonly PendingCandidate[]): readonly Waiting[] {
  const candidates = new Set(
    pending.flatMap((each) => (each.proposal.kind === 'node' ? [`cand:${each.id}`] : [])),
  )
  const beside = new Map<string, PendingCandidate[]>()
  const own = pending.filter((each) => {
    if (each.link?.ready !== false) return true
    const end = [each.proposal.from, each.proposal.to].find(
      (it) => it !== undefined && candidates.has(it),
    )
    if (end === undefined) return true
    beside.set(end, [...(beside.get(end) ?? []), each])
    return false
  })
  return own.map((candidate) => ({
    candidate,
    links: beside.get(`cand:${candidate.id}`) ?? [],
  }))
}

/** How a link reads from the end it is shown under. */
function linkFrom(link: PendingCandidate, candidate: string): { words: string; other: string } {
  const outgoing = link.proposal.from === `cand:${candidate}`
  const other = (outgoing ? link.link?.toLabel : link.link?.fromLabel) ?? ''
  if (link.proposal.relation === 'contradicts') return { words: '可能和这条矛盾', other }
  return { words: outgoing ? '可能支持' : '可能被这条支持', other }
}

export function PendingList(props: {
  pending: readonly PendingCandidate[]
  /** Shows only the first few. */
  limit?: number
  guard: (work: () => Promise<unknown>) => void
  onDecided: () => Promise<void>
}) {
  const waiting = withWaitingLinks(props.pending)
  if (waiting.length === 0) {
    return (
      <p className="hint">
        没有待确认的内容。可以点你说过的话旁边的“这是我的理解”，或回答下面的“提炼成待确认的理解”。
      </p>
    )
  }
  return (
    <ul className="pending">
      {waiting.slice(0, props.limit ?? waiting.length).map(({ candidate, links }) => (
        <PendingItem
          key={candidate.id}
          candidate={candidate}
          links={links}
          guard={props.guard}
          onDecided={props.onDecided}
        />
      ))}
    </ul>
  )
}

function PendingItem(props: {
  candidate: PendingCandidate
  links: readonly PendingCandidate[]
  guard: (work: () => Promise<unknown>) => void
  onDecided: () => Promise<void>
}) {
  const { candidate, links: waitingLinks, guard, onDecided } = props
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(candidate.proposal.label ?? '')
  const { link, state } = candidate
  const decide = (work: () => Promise<unknown>): void => {
    guard(async () => {
      await work()
      await onDecided()
    })
  }
  if (state !== undefined) {
    return (
      <li>
        <p className="candidate">{state.label}</p>
        <p className="candidate">
          <span className="hint">把{state.dimension}记为：</span>
          {state.level}
        </p>
        <p className="hint">{candidate.rationale}</p>
        <p className="decisions">
          <button type="button" onClick={() => decide(() => api.accept(candidate.id))}>
            同意，记下来
          </button>
          <button
            type="button"
            className="link"
            onClick={() => decide(() => api.dismiss(candidate.id))}
          >
            不同意
          </button>
        </p>
      </li>
    )
  }
  if (link !== undefined) {
    const relation =
      candidate.proposal.relation === 'evolves_to'
        ? '修正为'
        : candidate.proposal.relation === 'contradicts'
          ? '和这一条矛盾：'
          : '支持这一条：'
    return (
      <li>
        <p className="candidate">{link.fromLabel}</p>
        <p className="candidate link-to" data-relation={candidate.proposal.relation}>
          <span className="relation-words">{relation}</span>
          {link.toLabel}
        </p>
        <p className="hint">{candidate.rationale}</p>
        {!link.ready && <p className="hint">先确认它连着的两条，才能确认这个关系。</p>}
        <p className="decisions">
          <button
            type="button"
            disabled={!link.ready}
            onClick={() => decide(() => api.accept(candidate.id))}
          >
            确认这个关系
          </button>
          <button
            type="button"
            className="link"
            onClick={() => decide(() => api.dismiss(candidate.id))}
          >
            不要
          </button>
        </p>
      </li>
    )
  }
  return (
    <li>
      {editing ? (
        <textarea
          aria-label="修改这条理解"
          rows={3}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      ) : (
        <p className="candidate">{candidate.proposal.label}</p>
      )}
      <p className="hint">
        {wordsOf(candidate.basis, candidate.wordsBy)}。{candidate.rationale}
      </p>
      {candidate.similar !== undefined && <p className="hint">和这一条相近：{candidate.similar}</p>}
      {waitingLinks.length > 0 && (
        <ul className="waiting-links" aria-label="和你已有理解的关系">
          {waitingLinks.map((each) => {
            const { words, other } = linkFrom(each, candidate.id)
            return (
              <li key={each.id} data-relation={each.proposal.relation} title={each.rationale}>
                <span className="relation-words">{words}</span>
                <span className="relation-other">{other}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="decisions">
        {editing ? (
          <button
            type="button"
            disabled={label.trim() === ''}
            onClick={() => decide(() => api.acceptEdited(candidate, label.trim()))}
          >
            保存为我的理解
          </button>
        ) : (
          <>
            <button type="button" onClick={() => decide(() => api.accept(candidate.id))}>
              确认为我的理解
            </button>
            <button type="button" className="link" onClick={() => setEditing(true)}>
              改一改
            </button>
          </>
        )}
        <button
          type="button"
          className="link"
          onClick={() => decide(() => api.dismiss(candidate.id))}
        >
          不要
        </button>
      </p>
    </li>
  )
}
