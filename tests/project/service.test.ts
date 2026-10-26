import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addPerson, addToken } from '@episteme/service'
import { startMindLink } from '@mindlink/app'
import type { Launched } from '@mindlink/platform'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient, type Fetch } from '../../apps/mindlink/web/src/client.js'
import { projectApi } from '../../apps/mindlink/web/src/features/project/project.js'

/**
 * Learning projects through the running service (MindLink#10): two people on one shared deployment, each with a
 * human token for the REST their pages call and an agent token for MCP.
 */

type Json = Record<string, unknown>

interface ToolResult {
  readonly content?: readonly { readonly type: string; readonly text: string }[]
  readonly structuredContent?: Json
  readonly isError?: boolean
}

const PROTOCOL = '2026-07-28'
const API = '/api/v1/scene/mindlink'

let directory: string
let service: Launched
let tokens: { linHuman: string; linAgent: string; meiHuman: string; meiAgent: string }

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-project-'))
  const users = join(directory, 'users.json')
  const lin = await addPerson(users, 'Lin')
  const mei = await addPerson(users, 'Mei')
  tokens = {
    linHuman: await addToken(users, lin, 'human', 'workspace'),
    linAgent: await addToken(users, lin, 'agent', 'claude-code'),
    meiHuman: await addToken(users, mei, 'human', 'workspace'),
    meiAgent: await addToken(users, mei, 'agent', 'codex'),
  }
  service = await startMindLink({
    mode: 'shared',
    users,
    publicOrigin: 'https://mindlink.test',
    graph: join(directory, 'graph.jsonl'),
    port: 0,
  })
})

afterEach(async () => {
  await service.close()
  await rm(directory, { recursive: true, force: true })
})

async function rest(
  token: string,
  method: 'GET' | 'POST',
  path: string,
  body?: Json,
): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${service.url}${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Json }
}

/** A minimal MCP host speaking raw JSON-RPC, so what is exercised is the wire itself. */
function agent(token: string, name: string) {
  let nextId = 1
  return async (tool: string, args: Json): Promise<ToolResult> => {
    const response = await fetch(service.mcpUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
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

async function create(token: string, body: Json): Promise<Json> {
  const created = await rest(token, 'POST', '/projects/create', body)
  expect(created.status).toBe(200)
  return created.body['project'] as Json
}

describe('projects over REST', () => {
  it('creates, changes and archives a project', async () => {
    const project = await create(tokens.linHuman, {
      title: '线性代数',
      course: 'MATH101',
      goalType: 'speedrun',
    })
    expect(project).toMatchObject({ workflowId: 'builtin:speedrun', guidance: 'hint' })
    const id = project['id'] as string

    const changed = await rest(tokens.linHuman, 'POST', '/projects/update', {
      id,
      guidance: 'ask',
      delegation: true,
    })
    expect(changed.status).toBe(200)
    expect(changed.body['project']).toMatchObject({ guidance: 'ask', delegation: true })

    const archived = await rest(tokens.linHuman, 'POST', '/projects/archive', { id })
    expect(archived.status).toBe(200)
    expect((await rest(tokens.linHuman, 'GET', '/projects')).body['projects']).toEqual([])
    const all = await rest(tokens.linHuman, 'GET', '/projects?archived=include')
    expect(all.body['projects']).toEqual([expect.objectContaining({ id, archived: true })])

    const refused = await rest(tokens.linHuman, 'POST', '/projects/update', { id, goal: 'x' })
    expect(refused.status).toBe(422)
  })

  it('keeps each person’s projects their own', async () => {
    const lin = await create(tokens.linHuman, { title: 'Lin 的项目', goalType: 'deep' })
    await create(tokens.meiHuman, { title: 'Mei 的项目', goalType: 'apply' })

    const linList = (await rest(tokens.linHuman, 'GET', '/projects')).body['projects'] as Json[]
    const meiList = (await rest(tokens.meiHuman, 'GET', '/projects')).body['projects'] as Json[]
    expect(linList.map((project) => project['title'])).toEqual(['Lin 的项目'])
    expect(meiList.map((project) => project['title'])).toEqual(['Mei 的项目'])

    const id = lin['id'] as string
    expect((await rest(tokens.meiHuman, 'GET', `/projects/show?id=${id}`)).status).toBe(422)
    expect(
      (await rest(tokens.meiHuman, 'POST', '/projects/update', { id, title: 'taken' })).status,
    ).toBe(422)
    const meiTool = await agent(tokens.meiAgent, 'codex')('project_open', { id })
    expect(meiTool.isError).toBe(true)
    expect(JSON.stringify(meiTool)).toContain('project_not_found')
    expect((await rest(tokens.linHuman, 'GET', `/projects/show?id=${id}`)).body['project']).toEqual(
      lin,
    )
  })
})

describe('projects over MCP', () => {
  it('opens a project, writes back a goal, and reads it on the next open', async () => {
    const { id } = (await create(tokens.linHuman, {
      title: '概率论',
      course: 'MATH201',
      goalType: 'apply',
    })) as { id: string }
    const call = agent(tokens.linAgent, 'claude-code')

    const listed = await call('project_list', {})
    expect(listed.structuredContent?.['projects']).toEqual([expect.objectContaining({ id })])

    const first = await call('project_open', { id })
    expect(first.isError).not.toBe(true)
    expect(first.structuredContent?.['summary']).toEqual({
      scope: 'scope:MATH201',
      missing: ['goal', 'deadline', 'baseline'],
    })

    const updated = await call('project_update', {
      id,
      goal: '期末前能独立做条件概率的题',
      deadline: '2026-12-20',
    })
    expect(updated.isError).not.toBe(true)

    const second = await call('project_open', { id })
    expect(second.structuredContent?.['project']).toMatchObject({
      goal: '期末前能独立做条件概率的题',
      deadline: '2026-12-20',
    })
    expect(second.structuredContent?.['summary']).toMatchObject({ missing: ['baseline'] })
    expect(second.content?.[0]?.text).toContain('Not yet asked: baseline.')
  })

  it('refuses an agent anything beyond goal, deadline and baseline', async () => {
    const { id } = (await create(tokens.linHuman, { title: 'x', goalType: 'deep' })) as {
      id: string
    }
    const refused = await agent(tokens.linAgent, 'claude-code')('project_update', {
      id,
      delegation: true,
    })
    expect(refused.isError).toBe(true)
    expect(JSON.stringify(refused)).toContain('must NOT have additional properties')
    const shown = await rest(tokens.linHuman, 'GET', `/projects/show?id=${id}`)
    expect(shown.body['project']).toMatchObject({ delegation: false })
  })
})

describe('projects through the pages’ data calls', () => {
  /** The calls the project pages make, over the pages' own request client, signed in as `token`. */
  function pages(token: string) {
    const fetcher: Fetch = (path, init) =>
      fetch(`${service.url}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
      })
    return projectApi(createClient({ fetch: fetcher }))
  }

  it('creates, lists, changes settings, archives and restores, and the agent opens what was made', async () => {
    const lin = pages(tokens.linHuman)
    const made = await lin.create({ title: '线性代数', course: ' MATH101 ', goalType: 'speedrun' })
    expect(made).toMatchObject({
      title: '线性代数',
      course: 'MATH101',
      workflowId: 'builtin:speedrun',
      guidance: 'hint',
      archived: false,
    })
    expect(await lin.list(false)).toEqual([made])
    expect(await pages(tokens.meiHuman).list(true)).toEqual([])

    const changed = await lin.update(made.id, {
      course: null,
      guidance: 'tell',
      workflowId: 'builtin:deep',
    })
    expect(changed.course).toBeUndefined()
    expect(changed).toMatchObject({ guidance: 'tell', workflowId: 'builtin:deep' })
    expect(await lin.show(made.id)).toEqual(changed)

    await lin.archive(made.id, true)
    expect(await lin.list(false)).toEqual([])
    expect(await lin.list(true)).toEqual([expect.objectContaining({ id: made.id, archived: true })])
    await expect(lin.update(made.id, { title: '改名' })).rejects.toMatchObject({
      code: 'project_archived',
      message: '这个学习项目已经归档，不能再修改。',
    })
    await lin.archive(made.id, false)
    expect(await lin.list(false)).toEqual([
      expect.objectContaining({ id: made.id, archived: false }),
    ])
    await expect(lin.show('nowhere')).rejects.toMatchObject({ code: 'project_not_found' })

    const fresh = await lin.create({ title: '概率论', course: '', goalType: 'speedrun' })
    const opened = await agent(tokens.linAgent, 'claude-code')('project_open', { id: fresh.id })
    expect(opened.structuredContent?.['project']).toMatchObject({ workflowId: 'builtin:speedrun' })
  })
})
