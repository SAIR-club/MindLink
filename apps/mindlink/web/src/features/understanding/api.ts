import { API, type Client } from '../../client.js'
import { VOCABULARY_PATH, vocabularyOf, type Vocabulary } from '../../vocabulary.js'
import {
  delegatedDecisions,
  delegationsOf,
  nodesOf,
  referencedNodes,
  reviewsOf,
  suggestionsOf,
  type DelegatedDecision,
  type Delegation,
  type NodeName,
  type Proposal,
  type Suggestion,
} from './review.js'

/**
 * The review page's calls to Episteme's REST API (`/api/v1`), each reading its answer with `review.ts`. The pages
 * call these and nothing else, so a test drives the same calls against a running service.
 */

export interface Queue {
  readonly suggestions: readonly Suggestion[]
  readonly delegations: readonly Delegation[]
  readonly vocabulary: Vocabulary
  readonly nodes: readonly NodeName[]
}

/** The person's nodes, by name. Read only when a suggestion refers to one, since it reads the whole state. */
export async function readNodes(api: Client): Promise<readonly NodeName[]> {
  return nodesOf(await api.get(`${API}/state`))
}

/**
 * Everything the queue shows: the pending suggestions, the delegations that may cover them, the vocabulary their
 * levels are named by, and the names of the nodes they refer to.
 */
export async function readQueue(
  api: Client,
  {
    known = [],
    vocabulary = async () => vocabularyOf(await api.get(VOCABULARY_PATH)),
  }: {
    /** The nodes already read, so they are read again only when a suggestion names one they lack. */
    readonly known?: readonly NodeName[]
    /** Reads the vocabulary: the shell's `useVocabulary()` on a page. */
    readonly vocabulary?: () => Promise<Vocabulary>
  } = {},
): Promise<Queue> {
  const [suggestionsAnswer, delegationsAnswer, vocabularyRead] = await Promise.all([
    api.get(`${API}/suggestions`),
    api.get(`${API}/delegations`),
    vocabulary(),
  ])
  const suggestions = suggestionsOf(suggestionsAnswer)
  const wanted = referencedNodes(suggestions)
  const missing = wanted.some(
    (id) => !known.some((node) => node.nodeId === id || `cand:${node.fromSuggestion ?? ''}` === id),
  )
  return {
    suggestions,
    delegations: delegationsOf(delegationsAnswer),
    vocabulary: vocabularyRead,
    nodes: missing ? await readNodes(api) : known,
  }
}

export type Decision =
  | { readonly action: 'accept' }
  | { readonly action: 'dismiss' }
  | { readonly action: 'modify'; readonly proposal: Proposal }

/** Sends the person's decision on one suggestion. Answers with the suggestions still pending. */
export async function decide(
  api: Client,
  id: string,
  decision: Decision,
): Promise<readonly Suggestion[]> {
  return suggestionsOf(await api.post(`${API}/suggestions/decide`, { id, ...decision }))
}

/** The person's delegations, live and revoked. */
export async function readDelegations(api: Client): Promise<readonly Delegation[]> {
  return delegationsOf(await api.get(`${API}/delegations`))
}

/** Turns delegated confirmation on for a scope. */
export async function grant(api: Client, scope: string): Promise<void> {
  await api.post(`${API}/delegations`, { scope })
}

/** Turns a delegation off, from the next proposal on. What it already decided stays until undone. */
export async function revoke(api: Client, delegationId: string): Promise<void> {
  await api.post(`${API}/delegations/${encodeURIComponent(delegationId)}/revoke`)
}

/** Undoes one decision taken under a delegation: revokes what it committed. */
export async function undo(api: Client, suggestionId: string): Promise<void> {
  await api.post(`${API}/reviews/${encodeURIComponent(suggestionId)}/undo`)
}

export interface DelegationState {
  readonly delegations: readonly Delegation[]
  readonly decisions: readonly DelegatedDecision[]
  readonly nodes: readonly NodeName[]
}

/**
 * The delegation page: the delegations, and the decisions taken under one ("已替你确认"), each marked when undone.
 * An undo is recorded on the person's own channel, so the undone marks come from every review, not only the
 * delegation channel's.
 */
export async function readDelegationState(api: Client): Promise<DelegationState> {
  const [delegations, delegated, all] = await Promise.all([
    readDelegations(api),
    api.get(`${API}/reviews?channel=delegation`),
    api.get(`${API}/reviews`),
  ])
  const undone = reviewsOf(all).filter((review) => review.outcome === 'undone')
  const decisions = delegatedDecisions([...reviewsOf(delegated), ...undone])
  return {
    delegations,
    decisions,
    nodes: decisions.length === 0 ? [] : await readNodes(api),
  }
}
