import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RECORDABLE_DIMENSIONS, LearnSession } from '@episteme/app-learn/session'
import { seedTopic } from '@episteme/app-learn/seed'
import { learnStateDimensions } from '@episteme/domain-learn'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The levels the Learn surface offers are the levels Core accepts.
 *
 * The surface once kept its own list, and two of the evidence buttons it rendered (`weak`, `derived`) were
 * refused by Core because the pack registers different tokens. Every offered level is a button a learner
 * can press, so each one is recorded here against a real seeded session rather than compared as data.
 */

let directory: string
let filePath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'episteme-levels-'))
  filePath = join(directory, 'learn.jsonl')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('every offered level', () => {
  it('is accepted by record() on a seeded session', async () => {
    const session = await LearnSession.open({ filePath })
    try {
      await seedTopic(session)

      for (const dimension of RECORDABLE_DIMENSIONS) {
        for (const level of dimension.levels) {
          const result = await session.record('c_rope', { [dimension.id]: level })
          expect(result.recorded).toEqual([{ id: dimension.id, level }])
        }
      }
    } finally {
      await session.close()
    }
  })

  it('is exactly the registered list, each with a Chinese name', () => {
    for (const dimension of RECORDABLE_DIMENSIONS) {
      const registered = learnStateDimensions.find((candidate) => candidate.id === dimension.id)
      expect(dimension.levels).toEqual(registered?.levels)
      expect(dimension.levelLabelsZh.map((item) => item.level)).toEqual(dimension.levels)
      for (const item of dimension.levelLabelsZh) expect(item.label).not.toBe('')
    }
  })
})
