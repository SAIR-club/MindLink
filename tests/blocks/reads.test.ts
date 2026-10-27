import {
  courseHotspots,
  itemsDue,
  RAW_LIMIT,
  recentTurns,
  stateGaps,
  blockToolNames,
} from '@mindlink/app/blocks'
import type { PublicationView, StateReader, ThreadView } from '@mindlink/platform'
import {
  fixedClock,
  memoryPorts,
  memoryPublications,
  memoryThreads,
  stubState,
} from '@mindlink/platform/testing'
import { describe, expect, it, vi } from 'vitest'
// The tools themselves, to check their names against the list blocks are validated with.
import { blockReadTools } from '../../apps/mindlink/src/blocks/reads/mcp.js'

/** The generic reads blocks use (MindLink#11), on in-memory ports. */

type Nodes = ReturnType<StateReader['nodes']>
type Progress = ReturnType<StateReader['progress']>
type Item = Progress['items'][number]
type History = NonNullable<ReturnType<StateReader['historyOf']>>

const FEATURE = 'block-tools'
const DAY = 24 * 60 * 60 * 1000
const SCOPE = 'scope:linalg'

function node(
  nodeId: string,
  label: string,
  options: { type?: string; tier?: string; tags?: string[] } = {},
): Nodes[number] {
  return {
    nodeId,
    label,
    type: options.type ?? 'claim',
    tier: options.tier ?? 'thought',
    tags: options.tags ?? [],
  }
}

function item(
  nodeId: string,
  attention: Item['attention'],
  options: { dimensions?: Item['dimensions']; openConflicts?: string[] } = {},
): Item {
  return {
    nodeId,
    label: `label ${nodeId}`,
    type: 'claim',
    dimensions: options.dimensions ?? [],
    settled: attention === 'settled',
    openConflicts: options.openConflicts ?? [],
    attention,
  }
}

function progress(items: readonly Item[]): Progress {
  return {
    touched: items.length,
    settled: items.filter((entry) => entry.settled).length,
    withOpenConflict: items.filter((entry) => entry.openConflicts.length > 0).length,
    totalNodes: items.length,
    items,
    summary: '',
  }
}

describe('the tool list blocks are checked against', () => {
  it('names exactly the tools the app wires', () => {
    expect(blockReadTools.map((tool) => tool.name)).toEqual([...blockToolNames])
    expect(blockReadTools.every((tool) => tool.readOnly)).toBe(true)
  })
})

describe('state_gaps', () => {
  const nodes: Nodes = [
    node('n1', 'label n1', { tags: [SCOPE] }),
    node('n2', 'label n2', { tags: [SCOPE] }),
    node('n3', 'label n3', { tags: [SCOPE] }),
    node('n4', 'label n4', { tags: [SCOPE] }),
    node('n5', 'label n5', { tags: ['scope:calculus'] }),
  ]
  const state = stubState({
    nodes: () => nodes,
    progress: () =>
      progress([
        item('n1', 'conflict', { openConflicts: ['open'] }),
        item('n2', 'shaky', { dimensions: [{ id: 'confidence', level: 'low' }] }),
        item('n3', 'unexplained'),
        item('n4', 'settled'),
        item('n5', 'shaky'),
      ]),
  })
  const ports = memoryPorts(FEATURE, { state })

  it('lists conflict, shaky and unexplained items of the scope, and leaves settled ones out', () => {
    const gaps = stateGaps(ports, SCOPE)
    expect(gaps.scope).toBe(SCOPE)
    expect(gaps.items.map((entry) => [entry.nodeId, entry.reason])).toEqual([
      ['n1', 'conflict'],
      ['n2', 'shaky'],
      ['n3', 'unexplained'],
    ])
    expect(gaps.counts).toEqual({ conflict: 1, shaky: 1, unexplained: 1 })
    expect(gaps.items[0]!.conflict).toEqual({ level: 'open' })
    expect(gaps.items[1]!.conflict).toBeUndefined()
    expect(gaps.items[1]!.dimensions).toEqual([{ id: 'confidence', level: 'low' }])
  })

  it('reports a conflict as its level, never as a node id', () => {
    const levels = stubState({
      nodes: () => nodes,
      progress: () =>
        progress([
          item('n1', 'conflict', { openConflicts: ['suspected'] }),
          item('n2', 'conflict', { openConflicts: ['open'] }),
        ]),
    })
    const gaps = stateGaps(memoryPorts(FEATURE, { state: levels }), undefined)
    expect(gaps.items.map((entry) => entry.conflict)).toEqual([
      { level: 'suspected' },
      { level: 'open' },
    ])
    const text = JSON.stringify(gaps)
    expect(text).not.toContain('openConflicts')
    expect(text).not.toContain('"nodeId":"open"')
    expect(text).not.toContain('"nodeId":"suspected"')
  })

  it('reads every item when the project has no course', () => {
    const gaps = stateGaps(ports, undefined)
    expect(gaps.scope).toBeUndefined()
    expect(gaps.items.map((entry) => entry.nodeId)).toEqual(['n1', 'n2', 'n3', 'n5'])
  })
})

describe('recent_turns', () => {
  const long = '长'.repeat(RAW_LIMIT + 20)
  const view = {
    thread: { id: 't1', owner: 'lin', title: '特征值', scope: 'linalg', createdAt: 0 },
    turns: [1, 2, 3, 4].map((seq) => ({
      id: `u${seq}`,
      thread: 't1',
      seq,
      speaker: seq % 2 === 1 ? 'learner' : 'agent',
      text: seq === 4 ? long : `原话 ${seq}`,
      by: 'lin',
      at: seq * 1000,
      ...(seq === 3
        ? { summary: { turn: 'u3', text: '总结 3', quotes: ['原话'], by: 'claude', at: 3500 } }
        : {}),
    })),
  } as unknown as ThreadView
  const ports = memoryPorts(FEATURE, { threads: memoryThreads([view]) })

  it('gives the latest turns oldest first, the summary when there is one, else the raw words cut short', () => {
    const recent = recentTurns(ports, 't1', 3)!
    expect(recent.thread).toEqual({ id: 't1', title: '特征值', scope: 'linalg' })
    expect(recent.total).toBe(4)
    expect(recent.turns.map((turn) => [turn.seq, turn.summarized, turn.truncated])).toEqual([
      [2, false, false],
      [3, true, false],
      [4, false, true],
    ])
    expect(recent.turns[0]!.text).toBe('原话 2')
    expect(recent.turns[1]!.text).toBe('总结 3')
    expect(recent.turns[2]!.text).toBe(`${'长'.repeat(RAW_LIMIT)}…`)
  })

  it('reads only the caller’s own threads: any other is not found', () => {
    expect(recentTurns(ports, 'someone-elses-thread')).toBeUndefined()
  })
})

describe('course_hotspots', () => {
  /** A publication view as Episteme returns it: members, the relations it made public, no one's state. */
  function publication(
    id: string,
    author: string,
    members: readonly [string, string][],
    edges: readonly [string, string, string, string][],
    live = true,
  ): PublicationView {
    return {
      publication: {
        id,
        actorId: author,
        createdAt: 0,
        root: members[0]![0],
        members: members.map(([nodeId]) => nodeId),
        edges: edges.map(([edgeId]) => edgeId),
      },
      live,
      ...(live ? {} : { withdrawnAt: 1 }),
      nodes: members.map(([nodeId, label]) => ({
        nodeId,
        label,
        type: 'claim',
        author,
        confirmation: 'person',
      })),
      edges: edges.map(([edgeId, type, from, to]) => ({ id: edgeId, type, from, to })),
      threads: [],
      versions: [id],
    } as unknown as PublicationView
  }

  const shared: Nodes = [
    node('c1', '特征值', { type: 'concept', tier: 'reference', tags: [SCOPE] }),
    node('q1', '为什么能对角化', { type: 'question', tier: 'reference', tags: [SCOPE] }),
    // The caller's own private node: not shared, so never a group.
    node('mine', '我自己的问题', { type: 'question', tier: 'thought', tags: [SCOPE] }),
  ]

  const entries = [
    {
      scope: 'linalg',
      view: publication(
        'pA',
        'lin',
        [['a1', '特征值是伸缩倍数']],
        [
          ['eA1', 'refers_to', 'a1', 'c1'],
          ['eA2', 'refers_to', 'a1', 'q1'],
        ],
      ),
    },
    {
      scope: 'linalg',
      view: publication(
        'pA2',
        'lin',
        [['a2', '特征向量方向不变']],
        [['eA3', 'refers_to', 'a2', 'c1']],
      ),
    },
    {
      scope: 'linalg',
      view: publication(
        'pB',
        'mei',
        [['b1', '特征值只能是实数']],
        [
          ['eB1', 'refers_to', 'b1', 'c1'],
          ['eB2', 'contradicts', 'b1', 'a1'],
          ['eB3', 'refers_to', 'b1', 'mine'],
        ],
      ),
    },
    {
      scope: 'linalg',
      view: publication(
        'pC',
        'kai',
        [['k1', '特征值可以是复数']],
        [
          ['eC1', 'refers_to', 'k1', 'c1'],
          // Its other end was withdrawn since: the relation is dropped.
          ['eC2', 'contradicts', 'k1', 'w1'],
        ],
      ),
    },
    {
      scope: 'linalg',
      view: publication(
        'pW',
        'zoe',
        [['w1', '已撤回的理解']],
        [['eW1', 'refers_to', 'w1', 'q1']],
        false,
      ),
    },
    {
      scope: 'calculus',
      view: publication('pX', 'ann', [['x1', '另一门课']], [['eX1', 'refers_to', 'x1', 'c1']]),
    },
  ]

  function portsWith(state: StateReader) {
    return memoryPorts(FEATURE, { state, publications: memoryPublications(entries) })
  }

  it('groups live publications by the shared node they refer to, scored by distinct authors', () => {
    const result = courseHotspots(portsWith(stubState({ nodes: () => shared })), 'linalg')
    expect(result.course).toBe('linalg')
    expect(result.publications).toBe(4)
    expect(
      result.hotspots.map((spot) => [
        spot.nodeId,
        spot.label,
        spot.authors,
        spot.publications.map((entry) => entry.id),
      ]),
    ).toEqual([
      // lin's two publications count once; ann's publication is in another course.
      ['c1', '特征值', 3, ['pA', 'pA2', 'pB', 'pC']],
      // zoe withdrew hers.
      ['q1', '为什么能对角化', 1, ['pA']],
    ])
    expect(JSON.stringify(result)).not.toContain('我自己的问题')
  })

  it('reports public contradicts relations between live publications, dropping withdrawn ends', () => {
    const result = courseHotspots(portsWith(stubState({ nodes: () => shared })), 'linalg')
    expect(result.contradictions).toEqual([
      {
        edgeId: 'eB2',
        from: { nodeId: 'b1', label: '特征值只能是实数', publication: 'pB' },
        to: { nodeId: 'a1', label: '特征值是伸缩倍数', publication: 'pA' },
      },
    ])
  })

  it('never returns an author or adopter identity', () => {
    const text = JSON.stringify(
      courseHotspots(portsWith(stubState({ nodes: () => shared })), 'linalg'),
    )
    for (const person of ['lin', 'mei', 'kai', 'zoe', 'ann']) {
      expect(text).not.toContain(`"${person}"`)
    }
  })

  it('reads no private state: adoptions and privately recorded conflicts change nothing', () => {
    const baseline = courseHotspots(portsWith(stubState({ nodes: () => shared })), 'linalg')
    // The caller adopted a1 from pA and recorded an open conflict on it, privately.
    const privateReads = {
      progress: vi.fn(() =>
        progress([
          item('a1', 'conflict', {
            dimensions: [{ id: 'conflict', level: 'open' }],
            openConflicts: ['open'],
          }),
        ]),
      ),
      historyOf: vi.fn(
        (): History => [
          {
            id: 'ev1',
            branchId: 'main',
            target: 'a1',
            actorId: 'caller',
            dimensions: [],
            createdAt: 0,
            source: 'publication:pA',
          },
        ],
      ),
      understandingOf: vi.fn(() => [{ id: 'conflict', level: 'open' }]),
    }
    const state = stubState({ nodes: () => shared, ...privateReads })
    expect(courseHotspots(portsWith(state), 'linalg')).toEqual(baseline)
    for (const read of Object.values(privateReads)) expect(read).not.toHaveBeenCalled()
  })

  it('keeps the strongest hotspots within the limit', () => {
    const result = courseHotspots(portsWith(stubState({ nodes: () => shared })), 'linalg', 1)
    expect(result.hotspots.map((spot) => spot.nodeId)).toEqual(['c1'])
  })

  it('is empty, with a reason, when the project has no course, and reads nothing', () => {
    expect(courseHotspots(memoryPorts(FEATURE), undefined)).toEqual({
      hotspots: [],
      contradictions: [],
      publications: 0,
      reason: 'no_course',
    })
  })
})

describe('items_due', () => {
  const NOW = 10 * DAY
  const touched: Record<string, number> = { n1: 8 * DAY, n2: 5 * DAY, n3: 0, n4: 0 }
  const state = stubState({
    nodes: () => [
      node('n1', 'label n1', { tags: [SCOPE] }),
      node('n2', 'label n2', { tags: [SCOPE] }),
      node('n3', 'label n3', { tags: [SCOPE] }),
      node('n4', 'label n4', { tags: ['scope:calculus'] }),
    ],
    progress: () =>
      progress([
        item('n1', 'shaky', { dimensions: [{ id: 'confidence', level: 'low' }] }),
        item('n2', 'settled', { dimensions: [{ id: 'confidence', level: 'high' }] }),
        item('n3', 'unexplained'),
        item('n4', 'shaky', { dimensions: [{ id: 'confidence', level: 'low' }] }),
      ]),
    historyOf: (target) => [
      {
        id: `e-${String(target)}`,
        branchId: 'main',
        target: String(target),
        actorId: 'lin',
        dimensions: [],
        createdAt: 0,
        updatedAt: touched[String(target)]!,
      },
    ],
  })
  const ports = memoryPorts(FEATURE, { state, clock: fixedClock(NOW) })

  it('lists items whose last touch is at least the interval for their confidence ago, most overdue first', () => {
    const due = itemsDue(ports, SCOPE)
    expect(
      due.items.map((entry) => [
        entry.nodeId,
        entry.confidence,
        entry.daysSince,
        entry.intervalDays,
        entry.overdueDays,
      ]),
    ).toEqual([
      ['n3', 'unrecorded', 10, 1, 9],
      ['n1', 'low', 2, 1, 1],
    ])
  })

  it('takes the caller’s intervals, and a level left out is never due', () => {
    const due = itemsDue(ports, SCOPE, { high: 3 })
    expect(due.items.map((entry) => entry.nodeId)).toEqual(['n2'])
  })

  it('moves with the clock', () => {
    const clock = fixedClock(8 * DAY + DAY - 1)
    const moving = memoryPorts(FEATURE, { state, clock })
    expect(itemsDue(moving, SCOPE, { low: 1 }).items).toEqual([])
    clock.advance(1)
    expect(itemsDue(moving, SCOPE, { low: 1 }).items.map((entry) => entry.nodeId)).toEqual(['n1'])
  })
})
