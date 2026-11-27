import type { HeldNode, Session, Turn } from './api.js'

/**
 * The understanding layer reads the same record as the page beside it. These helpers are the parts that depend only
 * on that record: which lines sit beside the one on show, and the order the understanding was made in.
 */

/** A conversation to switch to, as the strip above the understanding shows it. */
export interface LineChip {
  readonly id: string
  readonly label: string
  /** The line on show. */
  readonly active: boolean
  /** The line this branch left, shown first as the way back. */
  readonly parent?: true
  /** Which mark the strip puts in front: a root line, a branch beside it, or the way back. */
  readonly kind: 'root' | 'branch' | 'parent'
}

/** A branch named after the line it left reads as its own suffix, so the strip stays legible in a narrow rail. */
function lineLabel(title: string, parent?: string): string {
  if (parent !== undefined && title.startsWith(parent) && title.length > parent.length) {
    const rest = title
      .slice(parent.length)
      .replace(/^\s*·\s*/u, '')
      .trim()
    if (rest !== '' && rest.length <= 12) return rest
  }
  return title
}

/**
 * The line on show, the line it left, and the branches beside it. On a root conversation the branches are the ones
 * that left it, so the switch works the same way in both directions; on a branch they are its siblings. Deep trees
 * stay in the shelf. Unrelated root conversations stay there too.
 */
export function branchLines(
  sessions: readonly Session[],
  thread: string | undefined,
): readonly LineChip[] {
  if (thread === undefined) return []
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const current = byId.get(thread)
  if (current === undefined) return []
  const parent = current.parent?.thread
  const children = sessions
    .filter((session) => session.parent?.thread === current.id)
    .sort((a, b) => a.createdAt - b.createdAt)
  const chips: LineChip[] = []
  if (parent === undefined || !byId.has(parent)) {
    chips.push({ id: current.id, label: current.title, active: true, kind: 'root' })
    for (const child of children) {
      chips.push({
        id: child.id,
        label: lineLabel(child.title, current.title),
        active: false,
        kind: 'branch',
      })
    }
    return chips
  }
  const above = byId.get(parent)
  if (above !== undefined) {
    chips.push({ id: above.id, label: '原对话', active: false, parent: true, kind: 'parent' })
  }
  const siblings = sessions
    .filter((session) => session.parent?.thread === parent)
    .sort((a, b) => a.createdAt - b.createdAt)
  for (const session of siblings) {
    chips.push({
      id: session.id,
      label: lineLabel(session.title, above?.title),
      active: session.id === thread,
      kind: 'branch',
    })
  }
  return chips
}

/**
 * The understanding in the order it was made: by the turn it came from, and the ones the person wrote or brought
 * back from before after those, in the order the record gives them.
 */
export function nodesInOrder(
  nodes: readonly HeldNode[],
  turns: readonly Turn[],
): readonly HeldNode[] {
  const at = new Map(turns.map((turn, index) => [turn.id, index]))
  return [...nodes].sort((left, right) => {
    const a = left.origin?.turn === undefined ? undefined : at.get(left.origin.turn)
    const b = right.origin?.turn === undefined ? undefined : at.get(right.origin.turn)
    if (a === undefined && b === undefined) return 0
    if (a === undefined) return 1
    if (b === undefined) return -1
    return a - b
  })
}

/** Where a held item's words were said, when the record still says. */
export function originTurn(node: HeldNode, turns: readonly Turn[]): Turn | undefined {
  const id = node.origin?.turn
  return id === undefined ? undefined : turns.find((turn) => turn.id === id)
}
