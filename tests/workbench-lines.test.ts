import { describe, expect, it } from 'vitest'
import type { HeldNode, Session, Turn } from '../apps/workbench/web/src/api.js'
import { branchLines, nodesInOrder, originTurn } from '../apps/workbench/web/src/lines.js'

/**
 * The understanding layer's two record-shaped decisions, kept out of the page so they can be read and tested
 * without a browser: which lines sit beside the one on show, and the order the understanding was made in.
 */

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

const turn = (id: string, index: number): Turn => ({
  id,
  speaker: index % 2 === 0 ? 'learner' : 'agent',
  text: id,
})

const node = (id: string, originTurn?: string): HeldNode =>
  ({
    nodeId: id,
    label: id,
    ...(originTurn === undefined ? {} : { origin: { turn: originTurn } }),
  }) as unknown as HeldNode

describe("the understanding layer's line strip", () => {
  it('shows the line on show beside the branches that left the same line, with the way back', () => {
    const root = session('root', 1)
    const first = session('first', 2, { thread: 'root', turn: 'turn-1' })
    const second = session('second', 3, { thread: 'root', turn: 'turn-1' })

    const chips = branchLines([root, first, second], 'first')

    expect(chips.map(({ id, active, parent }) => ({ id, active, parent }))).toEqual([
      { id: 'root', active: false, parent: true },
      { id: 'first', active: true, parent: undefined },
      { id: 'second', active: false, parent: undefined },
    ])
  })

  it('shows the branches that left a root conversation, so the switch works both ways', () => {
    const root = session('root', 1)
    const first = session('first', 2, { thread: 'root', turn: 'turn-1' })
    const second = session('second', 3, { thread: 'root', turn: 'turn-1' })

    const chips = branchLines([root, first, second], 'root')

    expect(chips.map(({ id, active }) => ({ id, active }))).toEqual([
      { id: 'root', active: true },
      { id: 'first', active: false },
      { id: 'second', active: false },
    ])
  })

  it('names branches by what sets them apart from the line they left', () => {
    const root = { ...session('root', 1), title: '端到端方案' }
    const first = {
      ...session('first', 2, { thread: 'root', turn: 'turn-1' }),
      title: '端到端方案 · 分支 1',
    }
    const second = {
      ...session('second', 3, { thread: 'root', turn: 'turn-1' }),
      title: '端到端方案 · 分支 2',
    }

    expect(branchLines([root, first, second], 'root').map(({ label }) => label)).toEqual([
      '端到端方案',
      '分支 1',
      '分支 2',
    ])
  })

  it('leaves unrelated root conversations out of the strip', () => {
    const root = session('root', 1)
    const other = session('other', 2)
    expect(branchLines([root, other], 'root').map(({ id }) => id)).toEqual(['root'])
  })

  it('has nothing to switch when there is no conversation', () => {
    expect(branchLines([session('root', 1)], undefined)).toEqual([])
  })
})

describe("the understanding layer's order", () => {
  it('follows the turns, and puts what was written or brought back after them', () => {
    const turns = [turn('turn-1', 0), turn('turn-2', 1)]
    const later = node('later', 'turn-2')
    const earlier = node('earlier', 'turn-1')
    const written = node('written')

    expect(nodesInOrder([later, written, earlier], turns).map(({ nodeId }) => nodeId)).toEqual([
      'earlier',
      'later',
      'written',
    ])
  })

  it("finds the turn an item's words were said in", () => {
    const turns = [turn('turn-1', 0), turn('turn-2', 1)]
    expect(originTurn(node('held', 'turn-2'), turns)?.id).toBe('turn-2')
    expect(originTurn(node('written'), turns)).toBeUndefined()
  })
})
