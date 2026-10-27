import type { Ports, PublicationView } from '@mindlink/platform'

/**
 * The generic reads blocks use (MindLink#11): state gaps, recent turns, course hotspots and items due for review.
 *
 * Each one is a plain function of the caller's ports, so it is tested on in-memory ports; the MCP tools in `mcp.ts`
 * only parse arguments and word the answer. None of them is shaped for one block: any block may name them.
 */

// ── State gaps ───────────────────────────────────────────────────────────────

/** The reasons an item needs attention; `settled` items are left out. */
export type GapReason = 'conflict' | 'shaky' | 'unexplained'

export interface GapItem {
  readonly nodeId: string
  readonly label: string
  readonly type: string
  readonly reason: GapReason
  readonly dimensions: readonly { readonly id: string; readonly level: string }[]
  /**
   * The level of the item's conflict dimension as Episteme records it (`open`, `suspected`, ...); absent when the item
   * has none. Episteme's progress does not say which other item it clashes with.
   */
  readonly conflict?: { readonly level: string }
}

export interface StateGaps {
  /** The `scope:` tag the items were taken from; absent when the project has no course and every item counts. */
  readonly scope?: string
  readonly items: readonly GapItem[]
  readonly counts: Readonly<Record<GapReason, number>>
}

const GAP_REASONS: readonly GapReason[] = ['conflict', 'shaky', 'unexplained']

/** The ids of the caller's visible nodes carrying `scope`, or `undefined` for no scope at all. */
function scopedIds(ports: Ports, scope: string | undefined): ReadonlySet<string> | undefined {
  if (scope === undefined) return undefined
  return new Set(
    ports.state
      .nodes()
      .filter((node) => node.tags.includes(scope))
      .map((node) => node.nodeId),
  )
}

/** The caller's items needing attention in a scope, most in need first, as `progress()` orders them. */
export function stateGaps(ports: Ports, scope: string | undefined): StateGaps {
  const inScope = scopedIds(ports, scope)
  const items: GapItem[] = []
  for (const item of ports.state.progress().items) {
    if (item.attention === 'settled') continue
    if (inScope !== undefined && !inScope.has(item.nodeId)) continue
    // `openConflicts` lists the levels of the conflict dimension that are not `none`: at most one.
    const level = item.openConflicts[0]
    items.push({
      nodeId: item.nodeId,
      label: item.label,
      type: item.type,
      reason: item.attention,
      dimensions: item.dimensions,
      ...(level === undefined ? {} : { conflict: { level } }),
    })
  }
  const counts = Object.fromEntries(
    GAP_REASONS.map((reason) => [reason, items.filter((item) => item.reason === reason).length]),
  ) as Record<GapReason, number>
  return { ...(scope === undefined ? {} : { scope }), items, counts }
}

// ── Recent turns ─────────────────────────────────────────────────────────────

export const DEFAULT_TURNS = 6
export const MAX_TURNS = 50
/** How much of a turn's raw words is kept when it has no summary. */
export const RAW_LIMIT = 280

export interface RecentTurn {
  readonly turn: string
  readonly seq: number
  readonly speaker: 'learner' | 'agent'
  readonly at: number
  /** The summary when there is one, else the raw words, cut at `RAW_LIMIT` characters. */
  readonly text: string
  readonly summarized: boolean
  readonly truncated: boolean
}

export interface RecentTurns {
  readonly thread: { readonly id: string; readonly title: string; readonly scope?: string }
  /** Oldest first. */
  readonly turns: readonly RecentTurn[]
  /** How many turns the thread has in all. */
  readonly total: number
}

/** The latest `limit` turns of one of the caller's own threads, or `undefined` for any other thread. */
export function recentTurns(
  ports: Ports,
  threadId: string,
  limit = DEFAULT_TURNS,
): RecentTurns | undefined {
  const view = ports.threads.threadView(threadId)
  if (view === undefined) return undefined
  const { thread } = view
  const turns = view.turns.slice(-limit).map((turn): RecentTurn => {
    const summary = turn.summary?.text
    const raw = turn.text
    const truncated = summary === undefined && [...raw].length > RAW_LIMIT
    return {
      turn: turn.id,
      seq: turn.seq,
      speaker: turn.speaker,
      at: turn.at,
      text: summary ?? (truncated ? `${[...raw].slice(0, RAW_LIMIT).join('')}…` : raw),
      summarized: summary !== undefined,
      truncated,
    }
  })
  return {
    thread: {
      id: thread.id,
      title: thread.title,
      ...(thread.scope === undefined ? {} : { scope: thread.scope }),
    },
    turns,
    total: view.turns.length,
  }
}

// ── Course hotspots ──────────────────────────────────────────────────────────

export const DEFAULT_HOTSPOTS = 5
export const MAX_HOTSPOTS = 50

/** A shared concept or question that several people published an understanding of. */
export interface Hotspot {
  readonly nodeId: string
  readonly label: string
  readonly type: string
  /** How many different people published about it: the score. */
  readonly authors: number
  /** The live publications about it, newest first. */
  readonly publications: readonly {
    readonly id: string
    readonly rootLabel: string
    readonly version: number
  }[]
}

export interface PublicEnd {
  readonly nodeId: string
  readonly label: string
  readonly publication: string
}

/** A public `contradicts` relation between two live publications of the course. */
export interface Contradiction {
  readonly edgeId: string
  readonly from: PublicEnd
  readonly to: PublicEnd
}

export interface CourseHotspots {
  readonly course?: string
  readonly hotspots: readonly Hotspot[]
  readonly contradictions: readonly Contradiction[]
  /** How many live publications of the course were read. */
  readonly publications: number
  /** Why the lists are empty, when they are by construction. */
  readonly reason?: 'no_course'
}

const CONTRADICTS = 'contradicts'

/**
 * Where a course is stuck, from public data only (ADR 0014, decision 2): the live publications of the course,
 * grouped by the shared (`reference`) concept or question their relations point at and scored by distinct authors,
 * and the public `contradicts` relations between them whose ends are both still live.
 *
 * It reads only `publications.browse`, `publications.view` and, for the labels of shared nodes, `state.nodes()`.
 * No one's state, adoption or recorded conflict is read, so none can change the answer.
 */
export function courseHotspots(
  ports: Ports,
  course: string | undefined,
  limit = DEFAULT_HOTSPOTS,
): CourseHotspots {
  if (course === undefined) {
    return { hotspots: [], contradictions: [], publications: 0, reason: 'no_course' }
  }
  const summaries = ports.publications.browse({ scope: course })
  const views: { readonly view: PublicationView; readonly version: number; rootLabel: string }[] =
    []
  for (const summary of summaries) {
    const view = ports.publications.view(summary.id)
    // Browsing lists only live ones; a view read later is checked again.
    if (view === undefined || !view.live) continue
    views.push({ view, version: summary.version, rootLabel: summary.rootLabel })
  }

  // Shared nodes: what everyone can see. Only these can group several people's publications.
  const shared = new Map(
    ports.state
      .nodes()
      .filter((node) => node.tier === 'reference')
      .map((node) => [node.nodeId, node]),
  )

  // Which live publication of the course holds each member, so a relation's ends can be checked.
  const holder = new Map<string, { readonly publication: string; readonly label: string }>()
  for (const { view } of [...views].reverse()) {
    for (const node of view.nodes) {
      holder.set(node.nodeId, { publication: view.publication.id, label: node.label })
    }
  }

  const groups = new Map<
    string,
    { authors: Set<string>; publications: Map<string, Hotspot['publications'][number]> }
  >()
  const contradictions = new Map<string, Contradiction>()
  for (const { view, version, rootLabel } of views) {
    const members = new Set<string>(view.publication.members)
    for (const edge of view.edges) {
      for (const end of [edge.to, edge.from]) {
        if (members.has(end) || !shared.has(end)) continue
        const group = groups.get(end) ?? { authors: new Set(), publications: new Map() }
        group.authors.add(view.publication.actorId)
        group.publications.set(view.publication.id, {
          id: view.publication.id,
          rootLabel,
          version,
        })
        groups.set(end, group)
      }
      if (edge.type !== CONTRADICTS || contradictions.has(edge.id)) continue
      const from = holder.get(edge.from)
      const to = holder.get(edge.to)
      // An end whose publication was withdrawn is no longer public: the relation is dropped.
      if (from === undefined || to === undefined || from.publication === to.publication) continue
      contradictions.set(edge.id, {
        edgeId: edge.id,
        from: { nodeId: edge.from, ...from },
        to: { nodeId: edge.to, ...to },
      })
    }
  }

  const hotspots = [...groups.entries()]
    .map(([nodeId, group]): Hotspot => {
      const node = shared.get(nodeId)!
      return {
        nodeId,
        label: node.label,
        type: node.type,
        authors: group.authors.size,
        publications: [...group.publications.values()],
      }
    })
    .sort(
      (left, right) =>
        right.authors - left.authors ||
        right.publications.length - left.publications.length ||
        left.label.localeCompare(right.label),
    )
    .slice(0, limit)

  return {
    course,
    hotspots,
    contradictions: [...contradictions.values()].slice(0, limit),
    publications: views.length,
  }
}

// ── Items due for review ─────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000

/** Days between reviews, by confidence level; `unrecorded` is for items with no confidence recorded. */
export type ReviewIntervals = Readonly<Record<string, number>>

export const DEFAULT_INTERVALS: ReviewIntervals = Object.freeze({
  low: 1,
  medium: 3,
  high: 7,
  unrecorded: 1,
})

export interface DueItem {
  readonly nodeId: string
  readonly label: string
  /** The confidence level recorded, or `unrecorded`. */
  readonly confidence: string
  readonly lastTouched: number
  readonly daysSince: number
  readonly intervalDays: number
  /** How many days past due; 0 when due today. */
  readonly overdueDays: number
}

export interface ItemsDue {
  readonly scope?: string
  readonly intervals: ReviewIntervals
  /** Most overdue first. */
  readonly items: readonly DueItem[]
}

/**
 * The caller's items in a scope whose last recorded change is at least the interval for their confidence ago.
 * An item whose confidence has no interval is never due.
 */
export function itemsDue(
  ports: Ports,
  scope: string | undefined,
  intervals: ReviewIntervals = DEFAULT_INTERVALS,
): ItemsDue {
  const inScope = scopedIds(ports, scope)
  const now = ports.clock.now()
  const items: DueItem[] = []
  for (const item of ports.state.progress().items) {
    if (inScope !== undefined && !inScope.has(item.nodeId)) continue
    const confidence =
      item.dimensions.find((dimension) => dimension.id === 'confidence')?.level ?? 'unrecorded'
    const interval = intervals[confidence]
    if (interval === undefined) continue
    const history = ports.state.historyOf(item.nodeId) ?? []
    if (history.length === 0) continue
    const lastTouched = Math.max(...history.map((event) => event.updatedAt ?? event.createdAt))
    const elapsed = now - lastTouched
    if (elapsed < interval * DAY) continue
    const daysSince = Math.floor(elapsed / DAY)
    items.push({
      nodeId: item.nodeId,
      label: item.label,
      confidence,
      lastTouched,
      daysSince,
      intervalDays: interval,
      overdueDays: Math.max(0, Math.floor((elapsed - interval * DAY) / DAY)),
    })
  }
  items.sort(
    (left, right) => right.overdueDays - left.overdueDays || left.lastTouched - right.lastTouched,
  )
  return { ...(scope === undefined ? {} : { scope }), intervals, items }
}
