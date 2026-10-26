import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMindLink } from '@mindlink/app'
import type { Launched } from '@mindlink/platform'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type Client } from '../../apps/mindlink/web/src/client.js'
import {
  decide,
  grant,
  readDelegationState,
  readNodes,
  readQueue,
  revoke,
  undo,
} from '../../apps/mindlink/web/src/features/understanding/api.js'
import {
  basisOf,
  delegationNote,
  modifiedProposal,
  speakerText,
  type Suggestion,
} from '../../apps/mindlink/web/src/features/understanding/review.js'

/**
 * The review page's own calls against a running MindLink (MindLink#25): what it lists, and that each decision,
 * each delegation and each undo is written to the graph.
 */

type Json = Record<string, unknown>

const PROTOCOL = '2026-07-28'
const MATERIAL = [
  '学生：为什么 Transformer 需要位置编码？',
  '老师：因为自注意力本身不区分词的顺序，所以要把位置信息加进去。',
  '学生：我明白了，位置编码让模型知道词的先后。',
].join('\n')

let directory: string
let service: Launched
let api: Client

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-review-'))
  service = await startMindLink({ mode: 'local', graph: join(directory, 'graph.jsonl'), port: 0 })
  const token = service.humanToken
  // The page's client, as the browser would run it, with the person's credential the page's cookie carries.
  api = createClient({
    fetch: (path, init) =>
      fetch(`${service.url}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
      }),
  })
})

afterEach(async () => {
  await service.close()
  await rm(directory, { recursive: true, force: true })
})

/** An agent's proposal over MCP, as a host would send it. */
async function propose(args: Json): Promise<Json> {
  const response = await fetch(service.mcpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL,
      'mcp-method': 'tools/call',
      'mcp-name': 'propose',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'propose',
        arguments: args,
        _meta: {
          'io.modelcontextprotocol/protocolVersion': PROTOCOL,
          'io.modelcontextprotocol/clientInfo': { name: 'claude-code', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    }),
  })
  const text = await response.text()
  const json = response.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .at(-1)
    : text
  const body = JSON.parse(json ?? '{}') as Json
  const result = body['result'] as { isError?: boolean; structuredContent?: Json } | undefined
  if (result === undefined || result.isError === true) throw new Error(`propose failed: ${text}`)
  return result.structuredContent ?? {}
}

async function reviews(): Promise<readonly Json[]> {
  return (await api.get('/api/v1/reviews'))['reviews'] as Json[]
}

const find = (suggestions: readonly Suggestion[], test: (each: Suggestion) => boolean) => {
  const found = suggestions.find(test)
  if (found === undefined) throw new Error('no such suggestion')
  return found
}

describe('the review page against the service', () => {
  it('lists distilled suggestions with basis and speaker, and writes accept, modify and dismiss', async () => {
    await api.post('/api/v1/distill', { title: '位置编码', text: MATERIAL })
    const queue = await readQueue(api)
    expect(queue.suggestions.length).toBeGreaterThanOrEqual(3)
    for (const suggestion of queue.suggestions) {
      // Every one says whose words it rests on and whether they are the learner's own.
      expect(['原话', '推断']).toContain(basisOf(suggestion).label)
      expect(speakerText(suggestion.origin)).toMatch(/^(学生|老师)$/)
    }
    expect(queue.vocabulary.dimensions.length).toBeGreaterThan(0)

    const question = find(
      queue.suggestions,
      (each) => each.proposal.kind === 'node' && each.proposal.nodeType === 'question',
    )
    const claim = find(
      queue.suggestions,
      (each) => each.proposal.kind === 'node' && each.proposal.nodeType === 'claim',
    )
    const link = find(queue.suggestions, (each) => each.proposal.kind === 'link')

    await decide(api, question.id, { action: 'accept' })
    await decide(api, claim.id, {
      action: 'modify',
      proposal: modifiedProposal(claim.proposal, {
        label: '自注意力不区分顺序，所以需要位置编码。',
      }),
    })
    const left = await decide(api, link.id, { action: 'dismiss' })
    expect(left.map((each) => each.id)).not.toContain(link.id)

    const labels = (await readNodes(api)).map((node) => node.label)
    expect(labels).toContain('为什么 Transformer 需要位置编码？')
    expect(labels).toContain('自注意力不区分顺序，所以需要位置编码。')
    const outcomes: Record<string, unknown> = {}
    for (const review of await reviews())
      outcomes[String(review['suggestionId'])] = review['outcome']
    expect(outcomes).toMatchObject({
      [question.id]: 'accepted',
      [claim.id]: 'modified',
      [link.id]: 'dismissed',
    })
  })

  it('confirms under delegation, lists it, undoes it, and turns delegation off', async () => {
    await grant(api, '*')
    let state = await readDelegationState(api)
    expect(state.delegations.filter((each) => each.revokedAt === undefined)).toHaveLength(1)

    const accepted = await propose({
      kind: 'claim',
      label: '位置编码给出词的先后',
      rationale: '你在笔记里这样写',
    })
    expect(JSON.stringify(accepted)).toContain('delegation')
    expect((await readQueue(api)).suggestions).toEqual([])

    state = await readDelegationState(api)
    expect(state.decisions).toHaveLength(1)
    const [decision] = state.decisions
    expect(decision?.undone).toBe(false)
    expect(state.nodes.map((node) => node.label)).toContain('位置编码给出词的先后')

    await undo(api, decision!.suggestionId)
    state = await readDelegationState(api)
    expect(state.decisions[0]?.undone).toBe(true)
    expect((await readNodes(api)).map((node) => node.label)).not.toContain('位置编码给出词的先后')

    // A conflict is never decided for the person, even under delegation.
    const created = await api.post('/api/v1/nodes', { kind: 'concept', label: '位置编码' })
    const node = created['node'] as { nodeId?: string; id?: string }
    const nodeId = node.nodeId ?? node.id
    expect(nodeId).toBeDefined()
    await propose({
      kind: 'state',
      target: nodeId,
      dimension: 'conflict',
      level: 'open',
      rationale: '你说的和笔记矛盾',
    })
    const waiting = await readQueue(api)
    expect(waiting.suggestions).toHaveLength(1)
    expect(delegationNote(waiting.delegations, waiting.suggestions[0]!)).toContain('冲突')

    await revoke(api, state.delegations[0]!.id)
    await propose({ kind: 'claim', label: '正弦编码可以外推', rationale: '老师提到过' })
    const after = await readQueue(api)
    expect(after.suggestions.map((each) => each.proposal.kind).sort()).toEqual(['claim', 'state'])
    expect((await readDelegationState(api)).decisions).toHaveLength(1)
  })
})
