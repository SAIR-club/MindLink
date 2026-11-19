import type { HeldNode, PendingCandidate, Session, Turn, Understanding } from './api.js'
import type { GraphEdge, GraphItem, ItemState } from './KnowledgeGraph.js'

/**
 * The structure of what a person understands, read out of the understanding layer for drawing: as a tree (where
 * each item came from, and how it bears on others) and as a graph. Both read the same items, so they always agree.
 */

export type Scope = 'thread' | 'space'

export function stateOf(node: HeldNode): ItemState {
  if (node.revisedTo !== undefined || node.withdrawn) return 'past'
  if (node.conflict) return 'conflict'
  if (node.openChallenges > 0) return 'challenged'
  return 'held'
}

export const STATE_WORDS: Readonly<Record<ItemState, string>> = {
  held: '已确认',
  pending: '等你确认',
  conflict: '有未解决的矛盾',
  challenged: '有质疑待回应',
  past: '已修正或撤回',
}

const RELATION_WORDS: Readonly<Record<string, string>> = {
  supports: '支持',
  contradicts: '矛盾',
  evolves_to: '修正为',
  forks_from: '分叉自',
}

export function relationWords(type: string, direction: 'in' | 'out'): string {
  if (type === 'supports') return direction === 'out' ? '支持' : '得到支持'
  if (type === 'evolves_to') return direction === 'out' ? '修正为' : '修正自'
  return RELATION_WORDS[type] ?? type
}

const PENDING = 'pending:'

/** A candidate that would become an item of its own once confirmed, rather than a relation or a change of state. */
function pendingItem(candidate: PendingCandidate): boolean {
  return (
    candidate.link === undefined &&
    candidate.state === undefined &&
    typeof candidate.proposal.label === 'string' &&
    candidate.proposal.label !== ''
  )
}

export function pendingId(item: GraphItem): string | undefined {
  return item.id.startsWith(PENDING) ? item.id.slice(PENDING.length) : undefined
}

export interface Shown {
  /** Items that belong to what is open, in the order the tree lists them. */
  readonly focus: ReadonlySet<string>
  /** The understanding brought back into this conversation from before. */
  readonly recalled: ReadonlySet<string>
  readonly nodes: readonly HeldNode[]
  readonly pending: readonly PendingCandidate[]
  readonly items: readonly GraphItem[]
  readonly edges: readonly GraphEdge[]
}

/**
 * What to show for a scope. For a conversation: what was proposed or confirmed in it and what it brought back from
 * before, with what those are tied to beside them. For the space: everything, given up items included.
 */
export function shownFor(
  understanding: Understanding,
  scope: Scope,
  thread: string | undefined,
  turns: readonly Turn[],
): Shown {
  const all = understanding.nodes
  const byLabel = new Map(all.map((node) => [node.label, node.nodeId]))
  const turnIds = new Set(turns.map((turn) => turn.id))
  const recalled = new Set(
    turns.flatMap((turn) => (turn.answer?.recalled ?? []).map((item) => item.nodeId)),
  )
  const inThread = scope === 'thread' && thread !== undefined
  const focus = new Set<string>()
  if (inThread) {
    for (const node of all) {
      const origin = node.origin
      if (origin?.thread === thread || origin?.madeIn === thread) focus.add(node.nodeId)
      else if (origin?.turn !== undefined && turnIds.has(origin.turn)) focus.add(node.nodeId)
    }
    for (const id of recalled) focus.add(id)
  }
  const pending = understanding.pending.filter(
    (candidate) =>
      !inThread || (candidate.origin?.turn !== undefined && turnIds.has(candidate.origin.turn)),
  )
  // Beside what is in focus: what it is directly tied to, so a relation never points at nothing.
  const shownIds = new Set(inThread ? focus : all.map((node) => node.nodeId))
  if (inThread) {
    for (const node of all) {
      if (!focus.has(node.nodeId)) continue
      for (const relation of node.relations) shownIds.add(relation.nodeId)
    }
  }
  const nodes = all.filter((node) => shownIds.has(node.nodeId))
  const items: GraphItem[] = [
    ...nodes.map((node) => ({
      id: node.nodeId,
      label: node.label,
      state: stateOf(node),
      focus: inThread ? focus.has(node.nodeId) : stateOf(node) !== 'past',
    })),
    ...pending.filter(pendingItem).map((candidate) => ({
      id: `${PENDING}${candidate.id}`,
      label: candidate.proposal.label ?? '',
      state: 'pending' as const,
      focus: true,
      pending: true,
    })),
  ]
  const pendingByLabel = new Map(
    pending
      .filter(pendingItem)
      .map((candidate) => [candidate.proposal.label ?? '', `${PENDING}${candidate.id}`]),
  )
  const edges: GraphEdge[] = [
    ...nodes.flatMap((node) =>
      node.relations
        .filter((relation) => relation.direction === 'out' && shownIds.has(relation.nodeId))
        .map((relation) => ({ from: node.nodeId, to: relation.nodeId, type: relation.type })),
    ),
    // A relation still waiting on the person, between the items its words name.
    ...pending.flatMap((candidate) => {
      if (candidate.link === undefined) return []
      const from =
        byLabel.get(candidate.link.fromLabel) ?? pendingByLabel.get(candidate.link.fromLabel)
      const to = byLabel.get(candidate.link.toLabel) ?? pendingByLabel.get(candidate.link.toLabel)
      return from === undefined || to === undefined ? [] : [{ from, to, type: 'pending' }]
    }),
  ]
  return { focus, recalled, nodes, pending, items, edges }
}

/** The small mark in front of an item, the same in the tree and the legend. */
export function StateMark({ state }: { state: ItemState }) {
  return (
    <span className="state-mark" data-state={state} title={STATE_WORDS[state]} aria-hidden="true" />
  )
}

interface Group {
  readonly key: string
  readonly title: string
  readonly nodes: readonly HeldNode[]
}

function groupsOf(
  shown: Shown,
  scope: Scope,
  thread: string | undefined,
  sessions: readonly Session[],
): readonly Group[] {
  const live = shown.nodes.filter((node) => stateOf(node) !== 'past')
  if (scope === 'thread' && thread !== undefined) {
    const made = live.filter(
      (node) => shown.focus.has(node.nodeId) && !shown.recalled.has(node.nodeId),
    )
    const used = live.filter((node) => shown.recalled.has(node.nodeId))
    const near = live.filter((node) => !shown.focus.has(node.nodeId))
    return [
      { key: 'made', title: '这段对话里确认的', nodes: made },
      { key: 'used', title: '这段对话用到的（之前确认过）', nodes: used },
      { key: 'near', title: '和它们相关的', nodes: near },
    ].filter((group) => group.nodes.length > 0)
  }
  const titles = new Map(sessions.map((session) => [session.id, session.title]))
  const groups = new Map<string, HeldNode[]>()
  for (const node of live) {
    const where = node.origin?.madeIn ?? node.origin?.thread
    const key = where !== undefined && titles.has(where) ? where : ''
    groups.set(key, [...(groups.get(key) ?? []), node])
  }
  return [...groups.entries()]
    .map(([key, nodes]) => ({
      key: key === '' ? 'elsewhere' : key,
      title: key === '' ? '其他来源（Agent、手动添加或已不在的对话）' : (titles.get(key) ?? ''),
      nodes,
    }))
    .sort((a, b) => (a.key === 'elsewhere' ? 1 : b.key === 'elsewhere' ? -1 : 0))
}

/**
 * The same items as the graph, in words: grouped by the conversation they came from (or, for one conversation, by
 * how they came into it), each with the items it bears on beneath it.
 */
export function UnderstandingTree(props: {
  readonly shown: Shown
  readonly scope: Scope
  readonly thread: string | undefined
  readonly sessions: readonly Session[]
  readonly onOpen: (node: string) => void
}) {
  const { shown } = props
  const groups = groupsOf(shown, props.scope, props.thread, props.sessions)
  const labels = new Map(shown.nodes.map((node) => [node.nodeId, node.label]))
  const past = shown.nodes.filter((node) => stateOf(node) === 'past')
  if (groups.length === 0 && past.length === 0) {
    return (
      <p className="rail-empty">
        {props.scope === 'thread'
          ? '这段对话还没有产生或用到你确认过的理解。'
          : '还没有。确认一条提议，它就会出现在这里。'}
      </p>
    )
  }
  return (
    <div className="understanding-tree">
      {groups.map((group) => (
        <section key={group.key} className="tree-group">
          <h4>
            {group.title}
            <span className="count">{group.nodes.length}</span>
          </h4>
          <ul className="held tree-nodes">
            {group.nodes.map((node) => (
              <li key={node.nodeId}>
                <button type="button" className="plain" onClick={() => props.onOpen(node.nodeId)}>
                  <StateMark state={stateOf(node)} />
                  {node.label}
                </button>
                {node.relations.length > 0 && (
                  <ul className="tree-relations">
                    {node.relations.map((relation) => (
                      <li
                        key={`${relation.type}-${relation.direction}-${relation.nodeId}`}
                        data-type={relation.type}
                      >
                        <span className="relation-word">
                          {relationWords(relation.type, relation.direction)}
                        </span>
                        <button
                          type="button"
                          className="link"
                          onClick={() => props.onOpen(relation.nodeId)}
                        >
                          {labels.get(relation.nodeId) ?? relation.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {past.length > 0 && (
        <details className="tree-past">
          <summary>已修正或撤回（{past.length}）</summary>
          <ul className="held tree-nodes">
            {past.map((node) => (
              <li key={node.nodeId}>
                <button type="button" className="plain" onClick={() => props.onOpen(node.nodeId)}>
                  <StateMark state="past" />
                  {node.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
