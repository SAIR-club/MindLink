import { levelField, type Field, type Values } from '../../form.js'
import { dimensionText, levelText, type Vocabulary } from '../../vocabulary.js'

/**
 * The review queue and delegated confirmation, as pure functions (MindLink#25).
 *
 * Episteme keeps what agents proposed as pending suggestions, outside the person's understanding, until the person
 * accepts, modifies or dismisses each one (ADR 0008, 0009). A person may instead let the service confirm agent
 * proposals for them in a scope (ADR 0016). Everything here reads the service's answers and says what a page shows:
 * no request, no component.
 */

/** What an agent proposes. `cand:<suggestion id>` names a node suggested alongside, still pending or accepted. */
export type Proposal =
  | {
      readonly kind: 'node'
      readonly nodeType: string
      readonly label: string
      readonly properties?: Readonly<Record<string, unknown>>
    }
  | { readonly kind: 'claim'; readonly label: string; readonly about?: readonly string[] }
  | { readonly kind: 'link'; readonly from: string; readonly to: string; readonly relation: string }
  | {
      readonly kind: 'state'
      readonly target: string
      readonly dimension: string
      readonly level: string
    }

/** The words a suggestion was distilled from. */
export interface Origin {
  readonly sourceId: string
  readonly excerpt: string
  readonly speaker?: string
  readonly time?: { readonly from: number; readonly to: number }
  readonly turn?: string
}

export interface Suggestion {
  readonly id: string
  readonly proposal: Proposal
  readonly rationale: string
  readonly proposedBy: string
  readonly proposedAt: number
  readonly scope?: string
  readonly origin?: Origin
  /** `stated`: the quoted words are the learner's own; `inferred`: a reading of what was said (ADR 0011). */
  readonly basis?: 'stated' | 'inferred'
}

export interface Delegation {
  readonly id: string
  readonly scope: string
  readonly grantedAt: number
  readonly revokedAt?: number
}

export interface Review {
  readonly suggestionId: string
  readonly outcome: 'accepted' | 'modified' | 'dismissed' | 'undone'
  readonly channel: string
  readonly decidedAt: number
  readonly reviewer?: { readonly actorId: string; readonly credentialId?: string }
}

/** A node of the person's graph, by the name a page shows it. */
export interface NodeName {
  readonly nodeId: string
  readonly label: string
  readonly fromSuggestion?: string
}

/** The scope that covers every learning project. */
export const ALL_SCOPES = '*'

export const SUGGESTED_NODE = 'cand:'

// ---------------------------------------------------------------------------------------------------------------
// Reading the service's answers. Anything without the documented shape is dropped rather than shown half-read.

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

function proposalOf(value: unknown): Proposal | undefined {
  if (!isObject(value)) return undefined
  switch (value['kind']) {
    case 'node': {
      const nodeType = text(value['nodeType'])
      const label = text(value['label'])
      if (nodeType === undefined || label === undefined) return undefined
      return {
        kind: 'node',
        nodeType,
        label,
        ...(isObject(value['properties']) ? { properties: value['properties'] } : {}),
      }
    }
    case 'claim': {
      const label = text(value['label'])
      if (label === undefined) return undefined
      const about = value['about']
      return {
        kind: 'claim',
        label,
        ...(Array.isArray(about) ? { about: about.filter((id) => typeof id === 'string') } : {}),
      }
    }
    case 'link': {
      const from = text(value['from'])
      const to = text(value['to'])
      const relation = text(value['relation'])
      if (from === undefined || to === undefined || relation === undefined) return undefined
      return { kind: 'link', from, to, relation }
    }
    case 'state': {
      const target = text(value['target'])
      const dimension = text(value['dimension'])
      const level = text(value['level'])
      if (target === undefined || dimension === undefined || level === undefined) return undefined
      return { kind: 'state', target, dimension, level }
    }
    default:
      return undefined
  }
}

function originOf(value: unknown): Origin | undefined {
  if (!isObject(value)) return undefined
  const sourceId = text(value['sourceId'])
  const excerpt = text(value['excerpt'])
  if (sourceId === undefined || excerpt === undefined) return undefined
  const speaker = text(value['speaker'])
  const turn = text(value['turn'])
  const time = value['time']
  return {
    sourceId,
    excerpt,
    ...(speaker === undefined ? {} : { speaker }),
    ...(turn === undefined ? {} : { turn }),
    ...(isObject(time) && typeof time['from'] === 'number' && typeof time['to'] === 'number'
      ? { time: { from: time['from'], to: time['to'] } }
      : {}),
  }
}

/** The pending suggestions in an answer from `GET /suggestions` or `POST /suggestions/decide`. */
export function suggestionsOf(answer: Readonly<Record<string, unknown>>): readonly Suggestion[] {
  const raw = answer['suggestions']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown): Suggestion[] => {
    if (!isObject(item)) return []
    const id = text(item['id'])
    const proposal = proposalOf(item['proposal'])
    if (id === undefined || proposal === undefined) return []
    const scope = text(item['scope'])
    const origin = originOf(item['origin'])
    const basis = item['basis']
    return [
      {
        id,
        proposal,
        rationale: text(item['rationale']) ?? '',
        proposedBy: text(item['proposedBy']) ?? '',
        proposedAt: typeof item['proposedAt'] === 'number' ? item['proposedAt'] : 0,
        ...(scope === undefined ? {} : { scope }),
        ...(origin === undefined ? {} : { origin }),
        ...(basis === 'stated' || basis === 'inferred' ? { basis } : {}),
      },
    ]
  })
}

/** The delegations in an answer from `GET /delegations`, live and revoked. */
export function delegationsOf(answer: Readonly<Record<string, unknown>>): readonly Delegation[] {
  const raw = answer['delegations']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown): Delegation[] => {
    if (!isObject(item)) return []
    const id = text(item['id'])
    const scope = text(item['scope'])
    if (id === undefined || scope === undefined) return []
    const revokedAt = item['revokedAt']
    return [
      {
        id,
        scope,
        grantedAt: typeof item['grantedAt'] === 'number' ? item['grantedAt'] : 0,
        ...(typeof revokedAt === 'number' ? { revokedAt } : {}),
      },
    ]
  })
}

const OUTCOMES: readonly string[] = ['accepted', 'modified', 'dismissed', 'undone']

/** The decisions in an answer from `GET /reviews`. */
export function reviewsOf(answer: Readonly<Record<string, unknown>>): readonly Review[] {
  const raw = answer['reviews']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown): Review[] => {
    if (!isObject(item)) return []
    const suggestionId = text(item['suggestionId'])
    const outcome = text(item['outcome'])
    if (suggestionId === undefined || outcome === undefined || !OUTCOMES.includes(outcome))
      return []
    const reviewer = item['reviewer']
    const actorId = isObject(reviewer) ? text(reviewer['actorId']) : undefined
    const credentialId = isObject(reviewer) ? text(reviewer['credentialId']) : undefined
    return [
      {
        suggestionId,
        outcome: outcome as Review['outcome'],
        channel: text(item['channel']) ?? '',
        decidedAt: typeof item['decidedAt'] === 'number' ? item['decidedAt'] : 0,
        ...(actorId === undefined
          ? {}
          : { reviewer: { actorId, ...(credentialId === undefined ? {} : { credentialId }) } }),
      },
    ]
  })
}

/** The nodes in an answer from `GET /state`, by name. */
export function nodesOf(answer: Readonly<Record<string, unknown>>): readonly NodeName[] {
  const raw = answer['nodes']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item: unknown): NodeName[] => {
    if (!isObject(item)) return []
    const nodeId = text(item['nodeId'])
    const label = text(item['label'])
    if (nodeId === undefined || label === undefined) return []
    const fromSuggestion = text(item['fromSuggestion'])
    return [{ nodeId, label, ...(fromSuggestion === undefined ? {} : { fromSuggestion }) }]
  })
}

// ---------------------------------------------------------------------------------------------------------------
// What a suggestion proposes, in words.

const NODE_TYPES: Readonly<Record<string, string>> = {
  question: '问题',
  claim: '论断',
  concept: '概念',
  evidence: '证据',
  example: '例子',
}

const RELATIONS: Readonly<Record<string, string>> = {
  answers: '回答',
  supports: '支持',
  contradicts: '反驳',
  refers_to: '涉及',
  depends_on: '依赖',
  part_of: '属于',
  example_of: '是……的例子',
}

/** A node type in words, or its id when it has no Chinese name here. */
export function nodeTypeText(nodeType: string): string {
  return NODE_TYPES[nodeType] ?? nodeType
}

/** An edge type in words, with its id, which is what a modification must name. */
export function relationText(relation: string): string {
  const name = RELATIONS[relation]
  return name === undefined ? relation : `${name}（${relation}）`
}

/** What a page knows besides the suggestion itself, to name what it refers to. */
export interface Context {
  readonly vocabulary: Vocabulary
  /** The suggestions still pending, by id. */
  readonly pending: ReadonlyMap<string, Suggestion>
  /** The person's nodes. */
  readonly nodes: readonly NodeName[]
}

/** A name a proposal can be shown by: a label, or, for a state change, what changes. */
function nameOf(proposal: Proposal): string | undefined {
  return proposal.kind === 'node' || proposal.kind === 'claim' ? proposal.label : undefined
}

/**
 * How a node a proposal refers to is shown: an existing node by its label, a node suggested alongside by what it
 * proposes (marked as still waiting), or one that was not accepted as such.
 */
export function nodeText(nodeId: string, context: Context): string {
  if (nodeId.startsWith(SUGGESTED_NODE)) {
    const id = nodeId.slice(SUGGESTED_NODE.length)
    const pending = context.pending.get(id)
    if (pending !== undefined) {
      const name = nameOf(pending.proposal)
      return name === undefined ? '另一条待确认的提议' : `「${name}」（待确认）`
    }
    const accepted = context.nodes.find((node) => node.fromSuggestion === id)
    return accepted === undefined ? '一条没有被接受的提议' : `「${accepted.label}」`
  }
  const node = context.nodes.find((each) => each.nodeId === nodeId)
  return node === undefined ? nodeId : `「${node.label}」`
}

export interface ProposalView {
  /** What kind of change it is, such as "新问题" or "理解的变化". */
  readonly kind: string
  /** What it proposes, in one line. */
  readonly summary: string
}

/** A proposal, in words: what kind of change and what exactly. Levels and dimensions as the vocabulary names them. */
export function describeProposal(proposal: Proposal, context: Context): ProposalView {
  switch (proposal.kind) {
    case 'node':
      return { kind: `新${nodeTypeText(proposal.nodeType)}`, summary: `「${proposal.label}」` }
    case 'claim': {
      const about = (proposal.about ?? []).map((id) => nodeText(id, context))
      return {
        kind: '新论断',
        summary:
          about.length === 0
            ? `「${proposal.label}」`
            : `「${proposal.label}」，关于 ${about.join('、')}`,
      }
    }
    case 'link':
      return {
        kind: '新连接',
        summary: `${nodeText(proposal.from, context)} → ${relationText(proposal.relation)} → ${nodeText(proposal.to, context)}`,
      }
    case 'state':
      return {
        kind: '理解的变化',
        summary: `${nodeText(proposal.target, context)} 的 ${dimensionText(context.vocabulary, proposal.dimension)} 改为 ${levelText(context.vocabulary, proposal.dimension, proposal.level)}`,
      }
  }
}

/** The ends of a proposal that may name a suggested node. */
function endsOf(proposal: Proposal): readonly string[] {
  switch (proposal.kind) {
    case 'link':
      return [proposal.from, proposal.to]
    case 'state':
      return [proposal.target]
    case 'claim':
      return proposal.about ?? []
    case 'node':
      return []
  }
}

/**
 * The pending suggestions this one waits for: those it refers to as `cand:<id>` that are still in the queue. It can
 * be accepted only after them (`depends_on_pending`).
 */
export function waitingFor(
  suggestion: Suggestion,
  pending: ReadonlyMap<string, Suggestion>,
): readonly Suggestion[] {
  const waiting: Suggestion[] = []
  for (const end of endsOf(suggestion.proposal)) {
    if (!end.startsWith(SUGGESTED_NODE)) continue
    const other = pending.get(end.slice(SUGGESTED_NODE.length))
    if (other !== undefined && !waiting.includes(other)) waiting.push(other)
  }
  return waiting
}

/** The hint shown on a suggestion that waits for others, or `undefined` when it waits for none. */
export function waitingText(waiting: readonly Suggestion[]): string | undefined {
  if (waiting.length === 0) return undefined
  const names = waiting.map((other) => {
    const name = nameOf(other.proposal)
    return name === undefined ? '另一条提议' : `「${name}」`
  })
  return `先接受另一条：${names.join('、')}。它接受之后，这一条才能接受。`
}

/** Existing node ids a page must know the names of to show these suggestions. */
export function referencedNodes(suggestions: readonly Suggestion[]): readonly string[] {
  const pending = new Set(suggestions.map((suggestion) => suggestion.id))
  const ids = new Set<string>()
  for (const suggestion of suggestions) {
    for (const end of endsOf(suggestion.proposal)) {
      if (!end.startsWith(SUGGESTED_NODE) || !pending.has(end.slice(SUGGESTED_NODE.length))) {
        ids.add(end)
      }
    }
  }
  return [...ids]
}

// ---------------------------------------------------------------------------------------------------------------
// Who proposed it and on what words.

export interface BasisView {
  /** "原话" or "推断"; "agent 的提议" when it came from no material. */
  readonly label: string
  readonly explanation: string
  readonly tone: 'stated' | 'inferred' | 'proposed'
}

/**
 * What a suggestion rests on, said so an agent's inference is never taken for the learner's own words. `stated`
 * still does not mean the suggestion is what the learner meant (ADR 0011).
 */
export function basisOf(suggestion: Suggestion): BasisView {
  if (suggestion.basis === 'stated') {
    return {
      label: '原话',
      explanation: '引用的是你自己说的话。提议是否就是你的意思，仍要你判断。',
      tone: 'stated',
    }
  }
  if (suggestion.basis === 'inferred' || suggestion.origin !== undefined) {
    return {
      label: '推断',
      explanation: '这是 agent 从材料里读出来的，不是你的原话。',
      tone: 'inferred',
    }
  }
  return {
    label: '推断',
    explanation: 'agent 直接提出的，没有引用材料。',
    tone: 'proposed',
  }
}

/** Who proposed it: an agent, by the name its actor id carries. */
export function proposerText(proposedBy: string): string {
  const prefix = 'actor_agent_'
  if (proposedBy.startsWith(prefix)) {
    const name = proposedBy.slice(prefix.length)
    if (name === 'rule-based-distiller') return 'agent：材料整理（规则）'
    return `agent：${name}`
  }
  if (proposedBy === 'actor_agent') return 'agent'
  return proposedBy === '' ? '未知来源' : proposedBy
}

/** Who said the quoted words, or `undefined` when the material did not say. */
export function speakerText(origin: Origin | undefined): string | undefined {
  return origin?.speaker === undefined || origin.speaker === '' ? undefined : origin.speaker
}

/** When the quoted words were said, for material with times, as `m:ss–m:ss`. */
export function timeText(origin: Origin | undefined): string | undefined {
  if (origin?.time === undefined) return undefined
  const at = (seconds: number): string =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
  return `${at(origin.time.from)}–${at(origin.time.to)}`
}

// ---------------------------------------------------------------------------------------------------------------
// Modifying before accepting.

/**
 * The fields a person edits to modify a proposal: the level of a state change (only levels the vocabulary offers
 * for new input, never a legacy one), the text of a node or claim, the type of a link.
 */
export function editorFields(proposal: Proposal, vocabulary: Vocabulary): readonly Field[] {
  switch (proposal.kind) {
    case 'state':
      return [
        levelField(vocabulary, proposal.dimension, {
          label: `${dimensionText(vocabulary, proposal.dimension)} 的等级`,
          value: proposal.level,
        }),
      ]
    case 'node':
    case 'claim':
      return [
        {
          name: 'label',
          label: '内容',
          kind: 'textarea',
          required: true,
          value: proposal.label,
        },
      ]
    case 'link':
      return [
        {
          name: 'relation',
          label: '关系类型',
          kind: 'text',
          required: true,
          value: proposal.relation,
        },
      ]
  }
}

/** The proposal a person's edit stands for, of the same kind, ready for `modify`. */
export function modifiedProposal(proposal: Proposal, values: Values): Proposal {
  switch (proposal.kind) {
    case 'state':
      return { ...proposal, level: values['level'] ?? proposal.level }
    case 'node':
    case 'claim':
      return { ...proposal, label: (values['label'] ?? proposal.label).trim() }
    case 'link':
      return { ...proposal, relation: (values['relation'] ?? proposal.relation).trim() }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Delegated confirmation (ADR 0016).

/** The delegations still live. */
export function liveDelegations(delegations: readonly Delegation[]): readonly Delegation[] {
  return delegations.filter((delegation) => delegation.revokedAt === undefined)
}

/** The live delegation for exactly this scope, if there is one. */
export function delegationFor(
  delegations: readonly Delegation[],
  scope: string,
): Delegation | undefined {
  return liveDelegations(delegations).find((delegation) => delegation.scope === scope)
}

/** A scope, in words. */
export function scopeText(scope: string): string {
  return scope === ALL_SCOPES ? '全部（所有学习项目）' : `学习项目 ${scope}`
}

/** What a scope a person typed stands for: `*` when empty. */
export function normaliseScope(scope: string): string {
  const trimmed = scope.trim()
  return trimmed === '' ? ALL_SCOPES : trimmed
}

/** Whether a live delegation covers a suggestion: one for every scope, or for the suggestion's own. */
export function coveringDelegation(
  delegations: readonly Delegation[],
  suggestion: Suggestion,
): Delegation | undefined {
  return liveDelegations(delegations).find(
    (delegation) => delegation.scope === ALL_SCOPES || delegation.scope === suggestion.scope,
  )
}

/**
 * Why a suggestion inside a live delegation still waits for the person, or `undefined` when no live delegation
 * covers it. The service decides only fresh proposals, never a conflict, and leaves anything it cannot accept.
 */
export function delegationNote(
  delegations: readonly Delegation[],
  suggestion: Suggestion,
): string | undefined {
  const covering = coveringDelegation(delegations, suggestion)
  if (covering === undefined) return undefined
  const proposal = suggestion.proposal
  if (proposal.kind === 'state' && proposal.dimension === 'conflict') {
    return '托管中，但这条涉及冲突：托管从不替你决定冲突，需要你本人确认。'
  }
  if (suggestion.proposedAt < covering.grantedAt) {
    return '托管中：这条在开启托管之前就已提出，托管只确认之后的新提议，需要你本人确认。'
  }
  return '托管中，但服务没能替你接受它（例如它依赖的提议还没被接受），需要你本人确认。'
}

/** What the confirm dialog says before a delegation is turned on. */
export function grantQuestion(scope: string): {
  readonly message: string
  readonly detail: string
} {
  return {
    message: `为「${scopeText(scope)}」开启托管确认？`,
    detail: [
      '开启后：agent 在这个范围里的新提议，会由服务按原样替你接受，并记为"托管确认"，不再等你审阅。',
      '不会替你做：发布或撤回、复用别人的发布、决定涉及冲突的提议、开启或关闭托管本身；开启之前已经在队列里的提议也仍然等你决定。',
      '怎样撤回：随时可以在这里关闭托管，之后的新提议回到审阅队列；已经替你确认的条目在"已替你确认"里逐条或全部撤销，撤销会撤回它写入的内容，历史里保留记录。',
    ].join('\n'),
  }
}

/** One decision taken under a delegation, and whether the person has undone it since. */
export interface DelegatedDecision {
  readonly suggestionId: string
  readonly delegationId: string | undefined
  readonly decidedAt: number
  readonly undone: boolean
}

/** The decisions taken for the person under a delegation, newest first, each marked when undone. */
export function delegatedDecisions(reviews: readonly Review[]): readonly DelegatedDecision[] {
  const undone = new Set(
    reviews.filter((review) => review.outcome === 'undone').map((review) => review.suggestionId),
  )
  return reviews
    .filter((review) => review.channel === 'delegation' && review.outcome === 'accepted')
    .map((review) => ({
      suggestionId: review.suggestionId,
      delegationId: review.reviewer?.credentialId,
      decidedAt: review.decidedAt,
      undone: undone.has(review.suggestionId),
    }))
    .sort((a, b) => b.decidedAt - a.decidedAt)
}

/**
 * What a delegated decision committed, in words. The review record names only the suggestion, so a node it created
 * is shown by its label; anything else by the suggestion id.
 */
export function delegatedText(decision: DelegatedDecision, nodes: readonly NodeName[]): string {
  const node = nodes.find((each) => each.fromSuggestion === decision.suggestionId)
  return node === undefined ? `提议 ${decision.suggestionId}` : `「${node.label}」`
}

/** A moment, for a person reading the list. */
export function timeOf(millis: number): string {
  if (millis <= 0) return ''
  const date = new Date(millis)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
