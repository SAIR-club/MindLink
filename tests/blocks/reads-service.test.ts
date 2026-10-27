import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMindLink } from '@mindlink/app'
import type { Launched } from '@mindlink/platform'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The block reads (MindLink#11) through the launcher: an agent calls each tool over MCP against a real graph, where
 * the learner accepted a claim, recorded it shaky, talked in a thread and published it.
 *
 * The first claim is proposed without a scope, so it belongs to no course: a project without a course reads it, and
 * the course project reads neither it nor its publication. The second test follows a course end to end: the scope
 * `project_open` gives is passed to `distill`, and what the learner accepts is read by the course's tools.
 */

type Json = Record<string, unknown>

interface ToolResult {
  readonly content?: readonly { readonly type: string; readonly text: string }[]
  readonly structuredContent?: Json
  readonly isError?: boolean
}

const PROTOCOL = '2026-07-28'

let directory: string
let service: Launched

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-reads-'))
  service = await startMindLink({
    mode: 'local',
    graph: join(directory, 'graph.jsonl'),
    port: 0,
    sharing: true,
  })
})

afterEach(async () => {
  await service.close()
  await rm(directory, { recursive: true, force: true })
})

async function rest(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
  const response = await fetch(`${service.url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${service.humanToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const json = (await response.json().catch(() => ({}))) as Json
  if (response.status !== 200)
    throw new Error(`${path}: ${response.status} ${JSON.stringify(json)}`)
  return json
}

/** A minimal MCP host speaking raw JSON-RPC, so what is exercised is the wire itself. */
function agent(name: string) {
  let nextId = 1
  return async (tool: string, args: Json): Promise<ToolResult> => {
    const response = await fetch(service.mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${service.humanToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': PROTOCOL,
        'mcp-method': 'tools/call',
        'mcp-name': tool,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: nextId++,
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': PROTOCOL,
            'io.modelcontextprotocol/clientInfo': { name, version: '1' },
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
    if (body['result'] === undefined) throw new Error(`no result for ${tool}: ${text}`)
    return body['result'] as ToolResult
  }
}

const textOf = (result: ToolResult): string =>
  result.content?.map((part) => part.text).join('\n') ?? ''

const API = '/api/v1'
const SCENE = '/api/v1/scene/mindlink'

describe('the block reads through the launcher', () => {
  it('answers each tool over MCP from the learner’s own graph and public publications', async () => {
    const call = agent('scripted-host')
    const created = await rest('POST', `${SCENE}/projects/create`, {
      title: '线性代数',
      course: 'linalg',
      goalType: 'deep',
    })
    const projectId = String((created['project'] as Json)['id'])
    const bare = await rest('POST', `${SCENE}/projects/create`, {
      title: '随便学学',
      goalType: 'speedrun',
    })
    const bareId = String((bare['project'] as Json)['id'])

    // A claim in the course, accepted by the learner and recorded as held without confidence.
    const proposed = await call('propose', {
      kind: 'claim',
      label: '特征值是线性变换的伸缩倍数',
      rationale: '学习者在对话里这么说',
    })
    expect(proposed.isError, textOf(proposed)).not.toBe(true)
    const pending = (await rest('GET', `${API}/suggestions`))['suggestions'] as Json[]
    await rest('POST', `${API}/suggestions/decide`, { id: pending[0]!['id'], action: 'accept' })
    const nodes = (await rest('GET', `${API}/state`))['nodes'] as Json[]
    const claim = nodes.find((node) => node['label'] === '特征值是线性变换的伸缩倍数')!
    expect(claim['tags']).not.toContain('scope:linalg')
    const nodeId = String(claim['nodeId'])
    await rest('POST', `${API}/record`, { target: nodeId, dimensions: { confidence: 'low' } })

    const opened = await call('thread_open', { title: '特征值', scope: 'linalg' })
    const threadId = String((opened.structuredContent?.['thread'] as Json | undefined)?.['id'])
    for (const [speaker, text] of [
      ['learner', '特征值到底是什么意思？'],
      ['agent', '可以把它看成变换沿某个方向的伸缩倍数。'],
      ['learner', '那负的特征值呢？'],
    ] as const) {
      const appended = await call('thread_append', { thread: threadId, speaker, text })
      expect(appended.isError, textOf(appended)).not.toBe(true)
    }

    await rest('POST', `${API}/publications`, { root: nodeId })

    const gaps = await call('state_gaps', { projectId: bareId })
    expect(gaps.isError, textOf(gaps)).not.toBe(true)
    expect(gaps.structuredContent).toMatchObject({
      items: [{ nodeId, reason: 'shaky' }],
      counts: { conflict: 0, shaky: 1, unexplained: 0 },
    })
    expect(gaps.structuredContent?.['scope']).toBeUndefined()
    expect((await call('state_gaps', { projectId })).structuredContent).toMatchObject({
      scope: 'scope:linalg',
      items: [],
    })

    // A real recorded conflict reads as its level, not as the id of another item.
    await rest('POST', `${API}/record`, { target: nodeId, dimensions: { conflict: 'open' } })
    const conflicted = await call('state_gaps', { projectId: bareId })
    expect(conflicted.isError, textOf(conflicted)).not.toBe(true)
    expect(conflicted.structuredContent).toMatchObject({
      items: [{ nodeId, reason: 'conflict', conflict: { level: 'open' } }],
    })
    expect(textOf(conflicted)).toContain('; conflict: open')
    expect(textOf(conflicted)).not.toContain('conflicts with')
    await rest('POST', `${API}/record`, { target: nodeId, dimensions: { conflict: 'none' } })

    const recent = await call('recent_turns', { threadId, limit: 2 })
    expect(recent.isError, textOf(recent)).not.toBe(true)
    expect(recent.structuredContent).toMatchObject({
      total: 3,
      turns: [
        { seq: 2, summarized: false },
        { seq: 3, text: '那负的特征值呢？' },
      ],
    })
    const unknown = await call('recent_turns', { threadId: 'no-such-thread' })
    expect(unknown.isError).toBe(true)
    expect(textOf(unknown)).toContain('unknown_thread')

    const hotspots = await call('course_hotspots', { projectId })
    expect(hotspots.isError, textOf(hotspots)).not.toBe(true)
    // The live publication's root is in no course, so Episteme lists none for this one.
    expect(hotspots.structuredContent).toMatchObject({
      course: 'linalg',
      publications: 0,
      hotspots: [],
      contradictions: [],
    })
    const noCourse = await call('course_hotspots', { projectId: bareId })
    expect(noCourse.structuredContent).toMatchObject({ hotspots: [], reason: 'no_course' })

    const due = await call('items_due', { projectId: bareId, intervals: { low: 0 } })
    expect(due.isError, textOf(due)).not.toBe(true)
    expect(due.structuredContent).toMatchObject({ items: [{ nodeId, confidence: 'low' }] })
    // Touched just now: not due under the default interval of a day.
    expect((await call('items_due', { projectId: bareId })).structuredContent).toMatchObject({
      items: [],
    })
    const badIntervals = await call('items_due', { projectId: bareId, intervals: { low: -1 } })
    expect(badIntervals.isError).toBe(true)

    const missing = await call('state_gaps', { projectId: 'nope' })
    expect(missing.isError).toBe(true)
    expect(textOf(missing)).toContain('project_not_found')
  })

  it('reads what the learner accepted from a distillation given the project’s course as its scope', async () => {
    const call = agent('scripted-host')
    const created = await rest('POST', `${SCENE}/projects/create`, {
      title: '线性代数',
      course: 'linalg',
      goalType: 'speedrun',
    })
    const projectId = String((created['project'] as Json)['id'])

    const opened = await call('project_open', { id: projectId })
    expect(opened.isError, textOf(opened)).not.toBe(true)
    const scope = (opened.structuredContent?.['summary'] as Json)['scope']
    expect(scope).toBe('linalg')
    expect(textOf(opened)).toContain('pass scope "linalg"')

    const distilled = await call('distill', {
      text: '学习者：特征值是线性变换沿特征向量方向的伸缩倍数。\nagent：对，负的特征值表示方向反过来。',
      learner: '学习者',
      candidates: [
        {
          kind: 'node',
          ref: 'eigen',
          role: 'claim',
          label: '特征值是线性变换沿特征向量方向的伸缩倍数',
          quote: '特征值是线性变换沿特征向量方向的伸缩倍数',
          basis: 'stated',
          rationale: '学习者用自己的话说出了特征值的含义',
        },
      ],
      scope,
    })
    expect(distilled.isError, textOf(distilled)).not.toBe(true)
    const pending = (await rest('GET', `${API}/suggestions`))['suggestions'] as Json[]
    const node = pending.find((suggestion) => (suggestion['proposal'] as Json)['kind'] === 'node')
    expect(node?.['scope']).toBe('linalg')
    await rest('POST', `${API}/suggestions/decide`, { id: node!['id'], action: 'accept' })

    const nodes = (await rest('GET', `${API}/state`))['nodes'] as Json[]
    const accepted = nodes.find((entry) => (entry['tags'] as string[]).includes('scope:linalg'))
    expect(accepted).toBeDefined()
    const nodeId = String(accepted!['nodeId'])
    await rest('POST', `${API}/record`, { target: nodeId, dimensions: { confidence: 'low' } })

    expect((await call('state_gaps', { projectId })).structuredContent).toMatchObject({
      scope: 'scope:linalg',
      items: [{ nodeId, reason: 'shaky' }],
    })
    expect(
      (await call('items_due', { projectId, intervals: { low: 0 } })).structuredContent,
    ).toMatchObject({ items: [{ nodeId, confidence: 'low' }] })
  })
})
