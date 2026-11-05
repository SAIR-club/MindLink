import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addPerson, addToken } from '@episteme/service'
import { startMindLink, type StartOptions } from '@mindlink/app'
import type { Launched } from '@mindlink/platform'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The launcher, driven over HTTP (ADR 0013, step M5).
 *
 * MindLink opens no graph itself: every test here reaches the graph only through the service the launcher starts.
 */

type Json = Record<string, unknown>

let directory: string
let service: Launched | undefined

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-launcher-'))
})

afterEach(async () => {
  await service?.close()
  service = undefined
  await rm(directory, { recursive: true, force: true })
})

async function serve(options: Partial<StartOptions> = {}): Promise<Launched> {
  service = await startMindLink({
    mode: 'local',
    graph: join(directory, 'graph.db'),
    port: 0,
    ...options,
  })
  return service
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  options: { readonly body?: unknown; readonly token?: string | undefined } = {},
): Promise<{ status: number; body: Json }> {
  if (service === undefined) throw new Error('no service is running')
  const token = 'token' in options ? options.token : service.humanToken
  const headers: Record<string, string> = {}
  if (token !== undefined) headers['authorization'] = `Bearer ${token}`
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${service.url}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  const body = (await response.json().catch(() => ({}))) as Json
  return { status: response.status, body }
}

function list<T>(body: Json, key: string): readonly T[] {
  const value = body[key]
  if (!Array.isArray(value)) throw new Error(`"${key}" was not an array in ${JSON.stringify(body)}`)
  return value as readonly T[]
}

interface Suggestion {
  readonly id: string
  readonly proposal: { readonly kind: string; readonly nodeType?: string; readonly label?: string }
}

const MATERIAL =
  '学生：为什么 Transformer 需要位置编码？\n老师：因为自注意力本身不区分词的顺序。\n学生：我明白了。'

describe('the review loop through the launcher', () => {
  it('distills, takes the learner’s decisions, and recalls what they accepted', async () => {
    await serve()

    const distilled = await call('POST', '/api/v1/distill', {
      body: { title: '位置编码', text: MATERIAL },
    })
    expect(distilled.status).toBe(200)

    const pending = list<Suggestion>((await call('GET', '/api/v1/suggestions')).body, 'suggestions')
    const claim = pending.find(
      (suggestion) =>
        suggestion.proposal.kind === 'node' && suggestion.proposal.nodeType === 'claim',
    )
    const question = pending.find(
      (suggestion) =>
        suggestion.proposal.kind === 'node' && suggestion.proposal.nodeType === 'question',
    )
    if (claim === undefined || question === undefined) {
      throw new Error(`distilling gave no claim and question: ${JSON.stringify(pending)}`)
    }

    // Accept the question as it is, put the claim in the learner's own words, and dismiss the rest.
    const accepted = await call('POST', '/api/v1/suggestions/decide', {
      body: { id: question.id, action: 'accept' },
    })
    expect(accepted.status).toBe(200)
    const modified = await call('POST', '/api/v1/suggestions/decide', {
      body: {
        id: claim.id,
        action: 'modify',
        proposal: { kind: 'node', nodeType: 'claim', label: '自注意力本身不知道词的先后顺序' },
      },
    })
    expect(modified.status).toBe(200)
    for (const rest of list<Suggestion>(
      (await call('GET', '/api/v1/suggestions')).body,
      'suggestions',
    )) {
      const dismissed = await call('POST', '/api/v1/suggestions/decide', {
        body: { id: rest.id, action: 'dismiss' },
      })
      expect(dismissed.status).toBe(200)
    }
    expect(list((await call('GET', '/api/v1/suggestions')).body, 'suggestions')).toEqual([])

    const recalled = await call('POST', '/api/v1/recall', {
      body: { question: '自注意力为什么不知道顺序' },
    })
    expect(recalled.status).toBe(200)
    expect(JSON.stringify(recalled.body)).toContain('自注意力本身不知道词的先后顺序')
  })

  it('serves the Learn vocabulary, with the v0.1.0 levels kept as legacy', async () => {
    await serve()
    const vocabulary = await call('GET', '/api/v1/vocabulary')
    expect(vocabulary.status).toBe(200)
    const dimensions = list<{
      id: string
      recordable: boolean
      levels: readonly { id: string; legacy: boolean }[]
    }>(vocabulary.body, 'dimensions')
    const byId = new Map(dimensions.map((dimension) => [dimension.id, dimension]))

    // What a learner may record by hand is the scene's presentations; the list is in registration order.
    expect(
      dimensions
        .filter((dimension) => dimension.recordable)
        .map((dimension) => dimension.id)
        .sort(),
    ).toEqual(['articulation', 'confidence', 'conflict', 'evidence'])
    // Old graphs still open on these levels, and nothing offers them for new input.
    const legacy = (id: string) =>
      byId
        .get(id)
        ?.levels.filter((level) => level.legacy)
        .map((level) => level.id)
    expect(legacy('evidence')).toEqual(['weak', 'derived'])
    expect(legacy('transfer')).toEqual(['none', 'near', 'far'])
  })
})

describe('a graph written by v0.1.0', () => {
  const GOLDEN = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'Episteme',
    'tests',
    'golden',
    'v0.1',
  )

  it('opens under the MindLink scene and reads as it did', async () => {
    const lines = async (name: string) =>
      (await readFile(join(GOLDEN, name), 'utf8'))
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
    const graphPath = join(directory, 'graph.db')
    const db = new Database(graphPath)
    try {
      db.pragma('locking_mode = EXCLUSIVE')
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = FULL')
      db.exec('CREATE TABLE records (seq INTEGER PRIMARY KEY, body TEXT NOT NULL)')
      db.exec(
        'CREATE TABLE companions (name TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (name, seq))',
      )
      db.pragma('user_version = 2')
      const records = await lines('graph.jsonl')
      const suggestions = await lines('graph.jsonl.suggestions.jsonl')
      const sources = await lines('graph.jsonl.sources.jsonl')
      db.transaction(() => {
        const insertRecord = db.prepare('INSERT INTO records (seq, body) VALUES (?, ?)')
        records.forEach((body, index) => insertRecord.run(index + 1, body))
        const insertCompanion = db.prepare(
          'INSERT INTO companions (name, seq, body) VALUES (?, ?, ?)',
        )
        suggestions.forEach((body, index) => insertCompanion.run('suggestions', index + 1, body))
        sources.forEach((body, index) => insertCompanion.run('sources', index + 1, body))
      })()
    } finally {
      db.close()
    }

    const expected = JSON.parse(await readFile(join(GOLDEN, 'expected.json'), 'utf8')) as {
      nodes: readonly string[]
      understanding: Record<string, unknown>
      events: number
    }
    await serve({ graph: graphPath })

    const state = await call('GET', '/api/v1/state')
    expect(state.status).toBe(200)
    expect(state.body['events']).toBe(expected.events)
    const understanding = state.body['understanding'] as Record<string, unknown>
    for (const node of expected.nodes) {
      expect(understanding[node] ?? []).toEqual(expected.understanding[node])
    }
  })
})

describe('shared mode', () => {
  it('serves only the people in the user file, by token', async () => {
    const users = join(directory, 'users.json')
    const actorId = await addPerson(users, 'Learner')
    const token = await addToken(users, actorId, 'human', 'laptop')
    await serve({ mode: 'shared', users, publicOrigin: 'https://mindlink.test' })

    expect((await call('GET', '/api/v1/state', { token: undefined })).status).toBe(401)
    expect((await call('GET', '/api/v1/state', { token })).status).toBe(200)
  })
})
