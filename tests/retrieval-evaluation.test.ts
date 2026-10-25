import {
  DeterministicEmbeddingAdapter,
  HybridRetriever,
  InMemoryEmbeddingCache,
} from '@episteme/core'
import { describe, expect, it } from 'vitest'
import { createFixture } from './fixtures.js'
import {
  RETRIEVAL_EVALUATION,
  evaluateCase,
  seedEvaluationGraph,
} from './retrieval-evaluation-fixtures.js'

/**
 * The retrieval evaluation, run against `@episteme/core`'s hybrid retriever.
 *
 * MindLink kept a copy of the retriever until ADR 0013 step M4. Before the copy was dropped, a parity test showed
 * both reached the same verdict on every case below; this suite keeps those verdicts from drifting.
 */

/**
 * Cases neither retriever passed when the copy was dropped, kept visible rather than deleted.
 *
 * `it.fails` turns green while the case fails and red once it passes, so a fix is noticed and the case moves back.
 */
const KNOWN_GAPS = new Set(['positional encoding, asked about why it exists'])

describe('retrieval evaluation on core', () => {
  for (const entry of RETRIEVAL_EVALUATION) {
    const test = KNOWN_GAPS.has(entry.name) ? it.fails : it
    test(entry.name, async () => {
      const context = createFixture()
      seedEvaluationGraph(context)
      const retriever = new HybridRetriever(
        context.graph,
        context.log,
        new DeterministicEmbeddingAdapter(),
        new InMemoryEmbeddingCache(),
      )
      const result = await retriever.retrieve({
        text: entry.query,
        actorId: context.humanId,
        depth: 1,
      })
      const outcome = evaluateCase(
        entry,
        result.matches.map((match) => match.node.id),
      )
      expect({ missed: outcome.missed, violations: outcome.violations }).toEqual({
        missed: [],
        violations: [],
      })
    })
  }
})
