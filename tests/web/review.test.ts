import { describe, expect, it } from 'vitest'
import {
  basisOf,
  delegatedDecisions,
  delegatedText,
  delegationFor,
  delegationNote,
  delegationsOf,
  describeProposal,
  editorFields,
  grantQuestion,
  modifiedProposal,
  normaliseScope,
  proposerText,
  referencedNodes,
  reviewsOf,
  scopeText,
  suggestionsOf,
  waitingFor,
  waitingText,
  type Context,
  type Suggestion,
} from '../../apps/mindlink/web/src/features/understanding/review.js'
import { vocabularyOf } from '../../apps/mindlink/web/src/vocabulary.js'

/** The review queue's logic (MindLink#25): what a suggestion shows, which levels are offered, what waits. */

const vocabulary = vocabularyOf({
  dimensions: [
    {
      id: 'confidence',
      label: '把握',
      kind: 'ordinal',
      recordable: true,
      levels: [
        { id: 'low', legacy: false },
        { id: 'medium', legacy: false },
        { id: 'high', legacy: false },
      ],
    },
    {
      id: 'evidence',
      label: '证据',
      kind: 'ordinal',
      recordable: true,
      levels: [
        { id: 'none', legacy: false },
        { id: 'weak', legacy: true },
        { id: 'proven', legacy: false },
      ],
    },
  ],
})

const question: Suggestion = {
  id: 'sug_q',
  proposal: { kind: 'node', nodeType: 'question', label: '为什么需要位置编码？' },
  rationale: '学习中被提出的问题',
  proposedBy: 'actor_agent_rule-based-distiller',
  proposedAt: 10,
  origin: { sourceId: 'src_1', excerpt: '为什么需要位置编码？', speaker: '学生' },
  basis: 'inferred',
}
const answer: Suggestion = {
  id: 'sug_a',
  proposal: { kind: 'node', nodeType: 'claim', label: '自注意力不区分顺序。' },
  rationale: '回答',
  proposedBy: 'actor_agent_rule-based-distiller',
  proposedAt: 10,
}
const link: Suggestion = {
  id: 'sug_l',
  proposal: { kind: 'link', from: 'cand:sug_a', to: 'cand:sug_q', relation: 'answers' },
  rationale: '它出现在回答里',
  proposedBy: 'actor_agent_claude-code',
  proposedAt: 10,
}
const state: Suggestion = {
  id: 'sug_s',
  proposal: { kind: 'state', target: 'n1', dimension: 'evidence', level: 'weak' },
  rationale: '你说读过论文',
  proposedBy: 'actor_agent_claude-code',
  proposedAt: 20,
  scope: 'p1',
  basis: 'stated',
}

function contextOf(pending: readonly Suggestion[]): Context {
  return {
    vocabulary,
    pending: new Map(pending.map((each) => [each.id, each])),
    nodes: [
      { nodeId: 'n1', label: '位置编码' },
      { nodeId: 'n2', label: '自注意力不区分顺序。', fromSuggestion: 'sug_a' },
    ],
  }
}

describe('reading the service', () => {
  it('keeps what a suggestion says and drops what has no documented shape', () => {
    const read = suggestionsOf({
      suggestions: [
        { ...question, origin: { ...question.origin, span: { start: 0, end: 3 } } },
        { id: 'sug_bad', proposal: { kind: 'teleport' } },
        'nonsense',
        { ...state, basis: 'guessed' },
      ],
    })
    expect(read.map((each) => each.id)).toEqual(['sug_q', 'sug_s'])
    expect(read[0]).toEqual(question)
    expect(read[1]?.basis).toBeUndefined()
    expect(suggestionsOf({})).toEqual([])
  })

  it('reads delegations and reviews', () => {
    expect(
      delegationsOf({
        delegations: [{ id: 'del_1', scope: '*', grantedAt: 5, revokedAt: 9 }, { id: 3 }],
      }),
    ).toEqual([{ id: 'del_1', scope: '*', grantedAt: 5, revokedAt: 9 }])
    expect(
      reviewsOf({
        reviews: [
          {
            suggestionId: 'sug_1',
            outcome: 'accepted',
            channel: 'delegation',
            decidedAt: 7,
            reviewer: { actorId: 'actor_human', credentialId: 'del_1', label: 'delegation' },
          },
          { suggestionId: 'sug_2', outcome: 'exploded' },
        ],
      }),
    ).toEqual([
      {
        suggestionId: 'sug_1',
        outcome: 'accepted',
        channel: 'delegation',
        decidedAt: 7,
        reviewer: { actorId: 'actor_human', credentialId: 'del_1' },
      },
    ])
  })
})

describe('what a suggestion proposes', () => {
  it('names nodes, pending suggestions and accepted ones', () => {
    const pending = contextOf([question, answer, link])
    expect(describeProposal(question.proposal, pending)).toEqual({
      kind: '新问题',
      summary: '「为什么需要位置编码？」',
    })
    expect(describeProposal(link.proposal, pending).summary).toBe(
      '「自注意力不区分顺序。」（待确认） → 回答（answers） → 「为什么需要位置编码？」（待确认）',
    )
    // Once the answer is accepted it is a node, named as kept; a dismissed one is said to be so.
    expect(describeProposal(link.proposal, contextOf([link])).summary).toBe(
      '「自注意力不区分顺序。」 → 回答（answers） → 一条没有被接受的提议',
    )
  })

  it('names a state change by the vocabulary, a legacy level marked', () => {
    expect(describeProposal(state.proposal, contextOf([state]))).toEqual({
      kind: '理解的变化',
      summary: '「位置编码」 的 证据 改为 weak（旧等级，不能再选）',
    })
  })

  it('lists the existing nodes a page must name', () => {
    expect(referencedNodes([question, answer, link, state])).toEqual(['n1'])
    expect(referencedNodes([link])).toEqual(['cand:sug_a', 'cand:sug_q'])
  })
})

describe('who proposed it and on what words', () => {
  it('never shows an inference as the learner’s own words', () => {
    expect(basisOf(state)).toMatchObject({ label: '原话', tone: 'stated' })
    expect(basisOf(question)).toMatchObject({ label: '推断', tone: 'inferred' })
    const { basis: _basis, ...unmarked } = question
    expect(basisOf(unmarked)).toMatchObject({ label: '推断', tone: 'inferred' })
    expect(basisOf(link)).toMatchObject({ label: '推断', tone: 'proposed' })
  })

  it('names the proposing agent', () => {
    expect(proposerText('actor_agent_claude-code')).toBe('agent：claude-code')
    expect(proposerText('actor_agent_rule-based-distiller')).toBe('agent：材料整理（规则）')
  })
})

describe('accept this first', () => {
  it('waits for the pending suggestions a proposal refers to', () => {
    const pending = contextOf([question, answer, link]).pending
    expect(waitingFor(link, pending)).toEqual([answer, question])
    expect(waitingText(waitingFor(link, pending))).toBe(
      '先接受另一条：「自注意力不区分顺序。」、「为什么需要位置编码？」。它接受之后，这一条才能接受。',
    )
    expect(waitingFor(link, contextOf([link]).pending)).toEqual([])
    expect(waitingText([])).toBeUndefined()
  })
})

describe('modifying', () => {
  it('offers only the levels the vocabulary offers for new input, never a legacy one', () => {
    const [field] = editorFields(state.proposal, vocabulary)
    expect(field?.kind).toBe('select')
    expect(field?.options?.map((option) => option.value)).toEqual(['none', 'proven'])
    expect(field?.label).toBe('证据 的等级')
  })

  it('edits a node’s text and a link’s type, of the same kind', () => {
    expect(editorFields(question.proposal, vocabulary)[0]).toMatchObject({
      name: 'label',
      value: '为什么需要位置编码？',
    })
    expect(modifiedProposal(question.proposal, { label: '  为什么要位置编码？ ' })).toEqual({
      ...question.proposal,
      label: '为什么要位置编码？',
    })
    expect(modifiedProposal(link.proposal, { relation: 'supports' })).toEqual({
      ...link.proposal,
      relation: 'supports',
    })
    expect(modifiedProposal(state.proposal, { level: 'proven' })).toEqual({
      ...state.proposal,
      level: 'proven',
    })
  })
})

describe('delegated confirmation', () => {
  const all = { id: 'del_all', scope: '*', grantedAt: 15 }
  const p1 = { id: 'del_p1', scope: 'p1', grantedAt: 5 }
  const revoked = { id: 'del_old', scope: 'p2', grantedAt: 1, revokedAt: 2 }

  it('finds the live delegation of a scope', () => {
    expect(delegationFor([all, p1, revoked], 'p1')).toBe(p1)
    expect(delegationFor([all, p1, revoked], 'p2')).toBeUndefined()
    expect(normaliseScope('  ')).toBe('*')
    expect(scopeText('*')).toBe('全部（所有学习项目）')
  })

  it('says why a suggestion in a delegated scope still waits', () => {
    expect(delegationNote([], state)).toBeUndefined()
    expect(delegationNote([revoked], { ...state, scope: 'p2' })).toBeUndefined()
    // Proposed before the delegation was granted.
    expect(delegationNote([all], question)).toContain('开启托管之前')
    expect(
      delegationNote([p1], {
        ...state,
        proposal: { kind: 'state', target: 'n1', dimension: 'conflict', level: 'open' },
      }),
    ).toContain('冲突')
    expect(delegationNote([p1], state)).toContain('没能替你接受')
  })

  it('tells the person what the AI will and never will do, and how to undo', () => {
    const { message, detail } = grantQuestion('p1')
    expect(message).toContain('学习项目 p1')
    for (const words of ['替你接受', '发布', '复用', '冲突', '开启或关闭托管本身', '撤销']) {
      expect(detail).toContain(words)
    }
  })

  it('lists decisions taken for the person, newest first, the undone ones marked', () => {
    const decisions = delegatedDecisions([
      {
        suggestionId: 'sug_1',
        outcome: 'accepted',
        channel: 'delegation',
        decidedAt: 1,
        reviewer: { actorId: 'actor_human', credentialId: 'del_all' },
      },
      { suggestionId: 'sug_2', outcome: 'accepted', channel: 'delegation', decidedAt: 2 },
      { suggestionId: 'sug_3', outcome: 'accepted', channel: 'learn-review', decidedAt: 3 },
      { suggestionId: 'sug_1', outcome: 'undone', channel: 'learn-review', decidedAt: 4 },
    ])
    expect(decisions).toEqual([
      { suggestionId: 'sug_2', delegationId: undefined, decidedAt: 2, undone: false },
      { suggestionId: 'sug_1', delegationId: 'del_all', decidedAt: 1, undone: true },
    ])
    expect(delegatedText(decisions[0]!, [])).toBe('提议 sug_2')
    expect(
      delegatedText(decisions[0]!, [{ nodeId: 'n9', label: '注意力', fromSuggestion: 'sug_2' }]),
    ).toBe('「注意力」')
  })
})
