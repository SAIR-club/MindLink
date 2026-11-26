import type { HeldNode, PendingCandidate, Session } from './api.js'

/** The rows of the branch tree, read from the same record the page uses. */

const MAX_LANE = 3

/** An item the person revised away or withdrew no longer sits on the tree. */
function isPast(node: HeldNode): boolean {
  return node.revisedTo !== undefined || node.withdrawn
}

export type GitRow =
  | {
      readonly key: string
      readonly kind: 'node'
      readonly node: HeldNode
      readonly lane: number
      readonly at: number
      readonly thread: string
    }
  | {
      readonly key: string
      readonly kind: 'note'
      readonly candidate: PendingCandidate
      readonly lane: number
      readonly at: number
      readonly thread: string
    }
  | {
      readonly key: string
      readonly kind: 'branch'
      readonly session: Session
      readonly label: string
      readonly lane: number
      readonly at: number
      readonly from: string
    }

/** A branch named after the line it left reads as its own suffix. */
export function lineLabel(title: string, parent?: string): string {
  if (parent !== undefined && title.startsWith(parent) && title.length > parent.length) {
    const rest = title
      .slice(parent.length)
      .replace(/^\s*·\s*/u, '')
      .trim()
    if (rest !== '' && rest.length <= 12) return rest
  }
  return title
}

export function rowsOf(
  sessions: readonly Session[],
  nodes: readonly HeldNode[],
  pending: readonly PendingCandidate[] = [],
  current?: string,
): readonly GitRow[] {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const lanes = new Map<string, number>()
  const roots = sessions.filter(
    (session) =>
      session.parent?.thread === undefined ||
      session.parent.thread === session.id ||
      !byId.has(session.parent.thread),
  )
  const walk = (session: Session, lane: number): void => {
    lanes.set(session.id, Math.min(lane, MAX_LANE))
    const children = sessions
      .filter((child) => child.parent?.thread === session.id)
      .sort((a, b) => a.createdAt - b.createdAt)
    for (const child of children) walk(child, lane + 1)
  }
  for (const root of roots) walk(root, 0)

  const held = nodes.filter(
    (node) => !isPast(node) && node.origin?.thread !== undefined && lanes.has(node.origin.thread),
  )
  const rows: GitRow[] = held.map((node) => ({
    key: node.nodeId,
    kind: 'node',
    node,
    lane: lanes.get(node.origin?.thread ?? '') ?? 0,
    at: node.origin?.at ?? 0,
    thread: node.origin?.thread ?? '',
  }))
  // Live notes sit on the line being read. They become ordinary nodes when the person accepts the summary.
  const noteThread = current !== undefined && lanes.has(current) ? current : roots[0]?.id
  if (noteThread !== undefined) {
    pending.forEach((candidate, index) => {
      rows.push({
        key: `note-${candidate.id}`,
        kind: 'note',
        candidate,
        lane: lanes.get(noteThread) ?? 0,
        at: typeof candidate.proposedAt === 'number' ? candidate.proposedAt : Date.now() + index,
        thread: noteThread,
      })
    })
  }
  // Several lines can name their branch "分支 1". Keep the full title then, so the rows can be told apart.
  const counts = new Map<string, number>()
  for (const session of sessions) {
    const parent = session.parent?.thread
    if (parent === undefined || !lanes.has(parent)) continue
    const short = lineLabel(session.title, byId.get(parent)?.title)
    counts.set(short, (counts.get(short) ?? 0) + 1)
  }
  for (const session of sessions) {
    const parent = session.parent?.thread
    if (parent === undefined || !lanes.has(parent)) continue
    const short = lineLabel(session.title, byId.get(parent)?.title)
    const onParent = rows.filter((row) => row.kind === 'node' && row.thread === parent)
    const source =
      onParent.find(
        (row) => row.kind === 'node' && row.node.origin?.turn === session.parent?.turn,
      ) ?? onParent[onParent.length - 1]
    rows.push({
      key: `branch-${session.id}`,
      kind: 'branch',
      session,
      label: (counts.get(short) ?? 0) > 1 ? session.title : short,
      lane: lanes.get(session.id) ?? 0,
      at: (source?.at ?? session.createdAt) + 1,
      from: source?.key ?? '',
    })
  }
  return [...rows].sort((a, b) => a.at - b.at)
}
