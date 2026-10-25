import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mindlinkScene } from '@mindlink/app'
import type { BlockRegistry } from '@mindlink/app/blocks'
import { launch, type Launched } from '@mindlink/platform'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// The engine's tools and routes over test blocks; the app wires the same ones over the built-in library.
import { workflowTools } from '../../apps/mindlink/src/blocks/mcp.js'
import { workflowRoutes } from '../../apps/mindlink/src/blocks/routes.js'
import { projectTools } from '../../apps/mindlink/src/project/mcp.js'
import { projectRoutes } from '../../apps/mindlink/src/project/routes.js'
import { fakeProjects, registryOf } from './engine-helpers.js'

/**
 * The block engine through the running service (MindLink#9): a scripted MCP host walks the `apply` workflow from the
 * format draft, which uses `guide` twice at two intensities, and a page reads and adjusts the run over REST.
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
let registry: BlockRegistry

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-engine-'))
  registry = await registryOf()
  const options = {
    registry: () => registry,
    projects: fakeProjects({
      p1: { workflowId: 'builtin:apply', guidance: 'tell' },
      p2: { workflowId: 'user:lean-flow', guidance: 'tell' },
    }),
  }
  // A second copy of the engine reads the real learning projects, served under its own prefix.
  const real = workflowTools({ registry: () => registry }).map((tool) => ({
    ...tool,
    name: `real_${tool.name}`,
  }))
  service = await launch({
    scene: mindlinkScene,
    tools: [...workflowTools(options), ...real, ...projectTools],
    routes: [...workflowRoutes(options), ...projectRoutes],
    mode: 'local',
    graph: join(directory, 'graph.jsonl'),
    port: 0,
  })
})

afterEach(async () => {
  await service.close()
  await rm(directory, { recursive: true, force: true })
})

async function rest(
  method: 'GET' | 'POST',
  path: string,
  body?: Json,
): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${service.url}${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${service.humanToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: (await response.json().catch(() => ({}))) as Json }
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

/** The three intensity sections of the fixture `guide`, by a sentence only each one has. */
const GUIDE_SECTIONS = {
  hint: '给一条线索',
  ask: '只用反问推进',
  tell: '直接回答学习者选定的问题',
} as const

describe('a scripted agent through the apply workflow', () => {
  it('gets each guide at its own intensity and never the other two', async () => {
    const call = agent('scripted-host')
    const guides: { path: string; intensity: string; text: string }[] = []
    const paths: string[] = []

    let next = await call('workflow_next', { project: 'p1' })
    while (next.structuredContent?.['finished'] === false) {
      expect(next.isError).not.toBe(true)
      const current = next.structuredContent['current'] as Json
      const path = String(current['path'])
      paths.push(path)
      let result: Json = {}
      if (current['block'] === 'builtin:guide') {
        guides.push({ path, intensity: String(current['intensity']), text: textOf(next) })
        // The agent reads the sub-step it is about to do, at the activity's intensity.
        const sub = await call('block_read', { project: 'p1', block: 'predict-questions' })
        expect(sub.isError).not.toBe(true)
        expect(sub.structuredContent?.['intensity']).toBe(current['intensity'])
        result =
          path === 'learn.guide'
            ? { offered: 3, outcome: 'picked', picked_rank: 2, basis: 'course-hotspot' }
            : { offered: 2, outcome: 'ignored' }
      }
      const reported = await call('workflow_report', { project: 'p1', step: path, result })
      expect(reported.isError, textOf(reported)).not.toBe(true)
      next = await call('workflow_next', { project: 'p1' })
    }
    expect(textOf(next)).toContain('这次运行已经全部完成')
    expect(paths).toEqual([
      'goal',
      'diagnose',
      'learn.explain',
      'learn.guide',
      'practice',
      'guide-after-practice',
      'distill',
    ])

    expect(guides.map((guide) => [guide.path, guide.intensity])).toEqual([
      ['learn.guide', 'hint'],
      ['guide-after-practice', 'ask'],
    ])
    for (const guide of guides) {
      for (const [intensity, sentence] of Object.entries(GUIDE_SECTIONS)) {
        if (intensity === guide.intensity) expect(guide.text).toContain(sentence)
        else expect(guide.text).not.toContain(sentence)
      }
      expect(guide.text).not.toMatch(/## (tell|hint|ask)\n[\s\S]*## (tell|hint|ask)\n/)
    }
    expect(guides[0]!.text).toContain('把 3 个预测问题')
    expect(guides[1]!.text).toContain('把 2 个预测问题')

    // Each guide's results are counted on their own and together.
    const stats = await rest('GET', '/stats?project=p1')
    expect(stats.status).toBe(200)
    const guide = (stats.body['blocks'] as Json[]).find(
      (entry) => entry['block'] === 'builtin:guide',
    )!
    expect(guide['reports']).toBe(2)
    expect(
      (guide['bySteps'] as Json[]).map((group) => [
        group['path'],
        (group['fields'] as Json[]).find((field) => field['name'] === 'outcome')!['counts'] as Json,
      ]),
    ).toEqual([
      ['guide-after-practice', { picked: 0, rewrote: 0, ignored: 1 }],
      ['learn.guide', { picked: 1, rewrote: 0, ignored: 0 }],
    ])
  })

  it('refuses a result the activity does not declare, and records nothing', async () => {
    const call = agent('scripted-host')
    await call('workflow_next', { project: 'p1' })
    const bad = await call('workflow_report', {
      project: 'p1',
      step: 'goal',
      result: { note: 'x' },
    })
    expect(bad.isError).toBe(true)
    expect(textOf(bad)).toContain('没有结果字段 "note"')
    const run = await rest('GET', '/runs?project=p1')
    expect((run.body['run'] as Json)['current']).toBe('goal')
  })
})

describe('a run over REST', () => {
  it('is read and adjusted, and the agent’s next step follows', async () => {
    const call = agent('scripted-host')
    await call('workflow_next', { project: 'p2' })
    await call('workflow_report', { project: 'p2', step: 'light-a' })

    const skipped = await rest('POST', '/runs/adjust', {
      project: 'p2',
      action: 'skip',
      path: 'heavy',
    })
    expect(skipped.status).toBe(200)
    const steps = ((skipped.body['run'] as Json)['steps'] as Json[]).map((step) => [
      step['path'],
      step['status'],
    ])
    expect(steps).toEqual([
      ['light-a', 'done'],
      ['heavy', 'skipped'],
      ['light-b', 'current'],
    ])
    expect(
      (await call('workflow_next', { project: 'p2' })).structuredContent?.['current'],
    ).toMatchObject({
      path: 'light-b',
    })

    const refused = await rest('POST', '/runs/adjust', {
      project: 'p2',
      action: 'skip',
      path: 'nope',
    })
    expect(refused.status).toBe(422)

    const removed = await rest('POST', '/runs/adjust', {
      project: 'p2',
      action: 'remove',
      index: 0,
    })
    expect((removed.body['run'] as Json)['current']).toBe('heavy')

    const lean = await rest('POST', '/runs/lean', { project: 'p2', lean: true })
    expect((lean.body['run'] as Json)['current']).toBe('light-b')

    const switched = await rest('POST', '/runs/intensity', { project: 'p2', intensity: 'hint' })
    expect(switched.status).toBe(422)
  })
})

describe('a learning project opened by the agent', () => {
  it('runs the workflow the project was created with', async () => {
    const call = agent('scripted-host')
    const created = await rest('POST', '/projects/create', {
      title: '贝叶斯',
      goalType: 'apply',
      course: 'stats',
    })
    expect(created.status).toBe(200)
    const id = String((created.body['project'] as Json)['id'])

    const opened = await call('project_open', { id })
    expect(opened.isError).not.toBe(true)
    const next = await call('real_workflow_next', { project: id })
    expect(next.isError, textOf(next)).not.toBe(true)
    expect(next.structuredContent?.['current']).toMatchObject({
      path: 'goal',
      block: 'builtin:goal',
    })
    expect((next.structuredContent?.['run'] as Json)['workflow']).toBe('builtin:apply')

    // The goal step writes back through the project's own tool, then the run moves on.
    const updated = await call('project_update', { id, goal: '能用贝叶斯做判断' })
    expect(updated.isError).not.toBe(true)
    await call('real_workflow_report', { project: id, step: 'goal' })
    const after = await call('real_workflow_next', { project: id })
    expect(after.structuredContent?.['current']).toMatchObject({ path: 'diagnose' })

    const missing = await call('real_workflow_next', { project: 'nope' })
    expect(missing.isError).toBe(true)
  })
})
