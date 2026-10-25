import type { EffectivePlan, EffectiveStep } from './plan.js'

/**
 * Which step comes next (MindLink#9). Pure: the gaps are measured by the caller and passed in.
 *
 * A fixed workflow runs its steps in order. An agent-orchestrated one offers every step not yet done as a candidate,
 * ranked by how much the dimensions its activity declares are still missing in the project, with the reason written
 * out in Chinese. Neither knows any block: everything comes from what the blocks declare.
 */

/** How much of one dimension the project still lacks: the nodes in scope with nothing recorded on it. */
export interface DimensionGap {
  readonly dimension: string
  readonly missing: number
  readonly total: number
}

export type Gaps = ReadonlyMap<string, DimensionGap>

/**
 * The gap of each dimension over some nodes, each given by the dimensions recorded on it. A dimension counts as
 * missing on a node until anything at all is recorded on it, whatever the level: levels mean different things in
 * different dimensions, and the engine reads none of them.
 */
export function measureGaps(
  nodes: readonly { readonly dimensions: readonly string[] }[],
  dimensions: Iterable<string>,
): Gaps {
  const gaps = new Map<string, DimensionGap>()
  for (const dimension of dimensions) {
    gaps.set(dimension, {
      dimension,
      missing: nodes.filter((node) => !node.dimensions.includes(dimension)).length,
      total: nodes.length,
    })
  }
  return gaps
}

export interface Candidate {
  readonly step: EffectiveStep
  /** The mean share missing over the activity's dimensions, from 0 to 1; -1 for an activity that declares none. */
  readonly score: number
  readonly reason: string
}

const percent = (share: number): string => `${Math.round(share * 100)}%`

/** Ranks steps by their dimensions' gaps, largest first; ties keep plan order. */
export function rankCandidates(steps: readonly EffectiveStep[], gaps: Gaps): Candidate[] {
  const scored = steps.map((step, index) => {
    if (step.dimensions.length === 0) {
      return {
        index,
        candidate: { step, score: -1, reason: '不针对具体的维度；排在有缺口的候选之后' },
      }
    }
    const measured = step.dimensions.map(
      (dimension) => gaps.get(dimension) ?? { dimension, missing: 0, total: 0 },
    )
    const share = (gap: DimensionGap): number => (gap.total === 0 ? 1 : gap.missing / gap.total)
    const score = measured.reduce((sum, gap) => sum + share(gap), 0) / measured.length
    const names = step.dimensions.join('、')
    const reason = measured.every((gap) => gap.total === 0)
      ? `推动 ${names}；项目里还没有任何节点，按工作流里的顺序`
      : `推动 ${measured
          .map((gap) =>
            gap.total === 0
              ? `${gap.dimension}（还没有节点）`
              : `${gap.dimension}（${gap.total} 个节点里 ${gap.missing} 个还没有记录）`,
          )
          .join('、')}；平均缺口 ${percent(score)}`
    return { index, candidate: { step, score, reason } }
  })
  return scored
    .sort((left, right) => right.candidate.score - left.candidate.score || left.index - right.index)
    .map((entry) => entry.candidate)
}

export interface Position {
  /** The step to do now; absent once every step is done or skipped. */
  readonly current?: EffectiveStep
  /** Agent orchestration only: every step left, ranked. Empty for a fixed workflow. */
  readonly candidates: readonly Candidate[]
  /** Steps neither done nor skipped, in plan order, the current one included. */
  readonly remaining: readonly EffectiveStep[]
  readonly finished: boolean
}

export interface AdvanceOptions {
  /** Agent orchestration: the gaps candidates are ranked by. Without them every dimension counts as unknown. */
  readonly gaps?: Gaps
  /** Agent orchestration: the candidate the agent picked, by path, instead of the top-ranked one. */
  readonly chosen?: string
}

/** Where a run stands, given the steps already done (or skipped by the agent), by path. */
export function advance(
  plan: EffectivePlan,
  done: ReadonlySet<string>,
  options: AdvanceOptions = {},
): Position {
  const remaining = plan.steps.filter((step) => step.skipped === undefined && !done.has(step.path))
  if (plan.orchestration === 'fixed') {
    return {
      ...(remaining[0] === undefined ? {} : { current: remaining[0] }),
      candidates: [],
      remaining,
      finished: remaining.length === 0,
    }
  }
  const candidates = rankCandidates(remaining, options.gaps ?? new Map())
  const current =
    remaining.find((step) => step.path === options.chosen) ?? candidates[0]?.step ?? undefined
  return {
    ...(current === undefined ? {} : { current }),
    candidates,
    remaining,
    finished: remaining.length === 0,
  }
}
