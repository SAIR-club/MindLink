import {
  DeterministicEmbeddingAdapter,
  HybridRetriever as CoreHybridRetriever,
  InMemoryEmbeddingCache,
  type NodeId,
} from '@episteme/core'
import { hybridRetriever as copiedHybridRetriever } from '@episteme/domain-learn'
import { describe, expect, it } from 'vitest'
import { createFixture } from './fixtures.js'
import {
  RETRIEVAL_EVALUATION,
  evaluateCase,
  seedEvaluationGraph,
} from './retrieval-evaluation-fixtures.js'

/**
 * Parity between the retriever copied into this repository and `@episteme/core`'s (ADR 0013, step M4).
 *
 * The copy is deleted once this passes. Parity is judged on outcomes, not on exact order: for every evaluation
 * question, and for the two Chinese questions, both retrievers must find the same expected understanding, keep the
 * same hard negatives below it, and return nothing for an unrelated question. Exact scores differ, because core
 * normalises the hybrid weights to sum to one and tokenises the lexical signal differently; what a learner gets
 * back does not.
 */

type Retrieve = (text: string) => Promise<readonly NodeId[]>

function retrievers(): { copied: Retrieve; core: Retrieve } {
  const context = createFixture()
  seedEvaluationGraph(context)
  const copied = copiedHybridRetriever(
    context.graph,
    context.log,
    new DeterministicEmbeddingAdapter(),
    new InMemoryEmbeddingCache(),
  )
  const core = new CoreHybridRetriever(
    context.graph,
    context.log,
    new DeterministicEmbeddingAdapter(),
    new InMemoryEmbeddingCache(),
  )
  const ranked =
    (retriever: typeof core): Retrieve =>
    async (text) =>
      (await retriever.retrieve({ text, actorId: context.humanId, depth: 1 })).matches.map(
        (entry) => entry.node.id,
      )
  return { copied: ranked(copied), core: ranked(core) }
}

/** Whether a sequence-order claim outranks the attention-heads claim, the Chinese hard negative. */
function ordersBeforeHeads(ranked: readonly NodeId[]): boolean {
  const ids = ranked.map(String)
  const orderAt = ids.findIndex((id) => id.includes('order') || id.includes('pe_index'))
  const headsAt = ids.indexOf('claim_heads')
  return orderAt >= 0 && (headsAt < 0 || orderAt < headsAt)
}

describe('the copied retriever and the core retriever reach the same verdicts', () => {
  for (const entry of RETRIEVAL_EVALUATION) {
    it(entry.name, async () => {
      const { copied, core } = retrievers()
      const verdict = async (retrieve: Retrieve) => {
        const outcome = evaluateCase(entry, await retrieve(entry.query))
        return { passed: outcome.passed, missed: outcome.missed, violations: outcome.violations }
      }
      expect(await verdict(core)).toEqual(await verdict(copied))
    })
  }

  it('a Chinese order question ranks an order claim above the heads claim in both', async () => {
    const { copied, core } = retrievers()
    const text = '为什么模型必须知道每个词的先后顺序'
    expect(ordersBeforeHeads(await copied(text))).toBe(true)
    expect(ordersBeforeHeads(await core(text))).toBe(true)
  })

  it('an unrelated Chinese question returns nothing in both', async () => {
    const { copied, core } = retrievers()
    const text = '葡萄牙的首都是哪里'
    expect(await copied(text)).toEqual([])
    expect(await core(text)).toEqual([])
  })
})
