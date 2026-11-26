import { describe, expect, it } from 'vitest'
import type { HeldNode, Session } from '../apps/workbench/web/src/api.js'
import { rowsOf } from '../apps/workbench/web/src/gitRows.js'

/** The branch tree is read from the same record as the page: lines, where they forked, and confirmed items. */

const session = (
  id: string,
  createdAt: number,
  parent?: { thread: string; turn: string },
): Session => ({
  id,
  title: id,
  createdAt,
  ...(parent === undefined ? {} : { parent }),
})

const node = (id: string, thread: string, at: number, turn?: string): HeldNode =>
  ({
    nodeId: id,
    label: id,
    relations: [],
    origin: { thread, at, ...(turn === undefined ? {} : { turn }) },
  }) as unknown as HeldNode

describe("the understanding layer's branch tree", () => {
  it('keeps each line in its own lane and opens a branch at the turn it left', () => {
    const root = session('主线', 1)
    const first = session('主线 · 分支 1', 4, { thread: '主线', turn: 't2' })
    const second = session('主线 · 分支 2', 6, { thread: '主线', turn: 't1' })
    const sessions = [root, first, second]
    const nodes = [
      node('a', '主线', 2, 't1'),
      node('b', '主线', 3, 't2'),
      node('c', '主线', 8, 't3'),
      node('d', '主线 · 分支 1', 5, 't4'),
    ]

    const rows = rowsOf(sessions, nodes)
    const byKey = new Map(rows.map((row) => [row.key, row]))

    expect(byKey.get('branch-主线 · 分支 1')).toMatchObject({ kind: 'branch', lane: 1, from: 'b' })
    expect(byKey.get('branch-主线 · 分支 2')).toMatchObject({ kind: 'branch', lane: 1, from: 'a' })
    expect(byKey.get('d')).toMatchObject({ kind: 'node', lane: 1 })
    expect(byKey.get('a')).toMatchObject({ lane: 0 })
    expect(rows.map((row) => row.key)).toEqual([
      'a',
      'b',
      'branch-主线 · 分支 2',
      'branch-主线 · 分支 1',
      'd',
      'c',
    ])
  })

  it('caps deep branches so the rail stays readable', () => {
    const sessions = [session('a', 1)]
    for (let depth = 1; depth <= 5; depth += 1) {
      sessions.push(
        session(`b${depth}`, depth + 1, { thread: depth === 1 ? 'a' : `b${depth - 1}`, turn: 't' }),
      )
    }
    const rows = rowsOf(
      sessions,
      sessions.map((s, index) => node(`n${index}`, s.id, index + 1)),
    )
    expect(Math.max(...rows.map((row) => row.lane))).toBe(3)
  })

  it('leaves a tree empty until a line holds an understanding', () => {
    expect(rowsOf([session('a', 1)], [])).toEqual([])
  })
})
