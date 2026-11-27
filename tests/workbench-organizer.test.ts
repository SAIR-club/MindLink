import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startService, type EpistemeService } from '@episteme/service'
import { SimulatedModel, workbenchProfile, type ModelClient, type Space } from '@mindlink/workbench'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rest as restOf } from './rest.js'

let directory: string
let graph: string
let service: EpistemeService

const start = async (model: ModelClient = new SimulatedModel()): Promise<void> => {
  service = await startService({ graph, port: 0, profile: workbenchProfile({ model }) })
}

const call = <T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  token = service.humanToken,
) =>
  restOf<T & { readonly code?: string; readonly error?: string }>(service.apiUrl, path, body, token)

const scene = '/scene/workbench'

function scripted(initial: string): ModelClient & { text: string; calls: number } {
  const model = {
    name: 'organizer-script',
    simulated: false,
    calls: 0,
    text: initial,
    complete(messages: readonly { readonly role: string; readonly content: string }[]) {
      model.calls += 1
      const system = messages.find((message) => message.role === 'system')?.content ?? ''
      return Promise.resolve({
        text: system.includes('学习对话的组织者') ? model.text : '编造的答案[推断]',
      })
    },
  }
  return model
}

async function newSpace(name = '机器学习'): Promise<Space> {
  return (await call<{ space: Space }>(`${scene}/spaces`, { name })).body.space
}

async function ask(space: string, question: string, thread?: string): Promise<string> {
  const answered = await call<{ thread: string }>(`${scene}/ask`, {
    space,
    question,
    ...(thread === undefined ? {} : { thread }),
  })
  expect(answered.status).toBe(200)
  return answered.body.thread
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mindlink-organizer-'))
  graph = join(directory, 'graph.db')
})

afterEach(async () => {
  await service.close()
  await rm(directory, { recursive: true, force: true, maxRetries: 5 })
})

describe('the conversation organizer', () => {
  it('opens a branch at a genuine topic change and keeps it idempotent', async () => {
    const model = scripted('{}')
    await start(model)
    const space = await newSpace()
    const questions = [
      '位置编码有什么用',
      '请解释注意力机制',
      '梯度消失怎么处理',
      '番茄炒蛋怎么做',
      '量子纠缠是什么',
      '今天天气如何',
    ]
    let thread = ''
    const turns: string[] = []
    for (const [index, question] of questions.entries()) {
      thread = await ask(space.id, question, index === 0 ? undefined : thread)
      const read = await call<{ turns: readonly { id: string; speaker: string }[] }>(
        `${scene}/session?thread=${thread}`,
      )
      turns.push(read.body.turns.at(-2)?.id ?? '')
    }
    const fork = turns[3]
    expect(fork).toBeTruthy()
    model.text = JSON.stringify({
      topics: [
        {
          title: '模型训练',
          gist: '从位置编码到梯度问题',
          points: [{ text: '梯度消失需要处理', turn: turns[2] }],
        },
      ],
      branches: [{ turn: fork, title: '烹饪', confidence: 0.95 }],
      merges: [],
    })

    const organized = await call<{
      branches: readonly { id: string; turn: string; title: string }[]
    }>(`${scene}/organize`, { space: space.id, thread })
    expect(organized.status).toBe(200)
    expect(organized.body.branches).toMatchObject([{ turn: fork, title: '烹饪' }])

    const sessions = await call<{
      sessions: readonly { id: string; parent?: { thread: string; turn: string } }[]
    }>(`${scene}/sessions?space=${space.id}`)
    const branch = sessions.body.sessions.find((session) => session.parent?.thread === thread)
    expect(branch?.parent).toEqual({ thread, turn: fork })

    const again = await call<{ branches: readonly unknown[] }>(`${scene}/organize`, {
      space: space.id,
      thread,
    })
    expect(again.body.branches).toHaveLength(1)
  })

  it('merges a useful branch conclusion back once', async () => {
    const model = scripted('{}')
    await start(model)
    const space = await newSpace()
    const main = await ask(space.id, '位置编码有什么用')
    const first = await call<{ turns: readonly { id: string }[] }>(
      `${scene}/session?thread=${main}`,
    )
    const mainTurn = first.body.turns.at(-2)?.id ?? ''
    for (let index = 0; index < 5; index += 1) {
      await ask(space.id, `追问 ${index}`, main)
    }
    model.text = JSON.stringify({
      topics: [],
      branches: [{ turn: mainTurn, title: '烹饪', confidence: 0.95 }],
      merges: [],
    })
    await call(`${scene}/organize`, { space: space.id, thread: main })
    const sessions = await call<{
      sessions: readonly { id: string; parent?: { thread: string } }[]
    }>(`${scene}/sessions?space=${space.id}`)
    const branch = sessions.body.sessions.find((session) => session.parent?.thread === main)
    expect(branch).toBeDefined()
    await ask(space.id, '鸡蛋怎么炒', branch?.id)
    await ask(space.id, '番茄什么时候下锅', branch?.id)

    model.text = JSON.stringify({
      topics: [],
      branches: [],
      merges: [{ branch: branch?.id, summary: '鸡蛋不要炒老，番茄出汁后回锅。', confidence: 0.95 }],
    })
    const merged = await call<{
      merges: readonly { branch: string; summary: string; turn: string }[]
    }>(`${scene}/organize`, { space: space.id, thread: main })
    expect(merged.body.merges).toMatchObject([
      { branch: branch?.id, summary: '鸡蛋不要炒老，番茄出汁后回锅。' },
    ])

    const parent = await call<{ turns: readonly { text: string }[] }>(
      `${scene}/session?thread=${main}`,
    )
    expect(parent.body.turns.filter((turn) => turn.text.includes('鸡蛋不要炒老'))).toHaveLength(1)

    const again = await call<{ merges: readonly unknown[] }>(`${scene}/organize`, {
      space: space.id,
      thread: main,
    })
    expect(again.body.merges).toHaveLength(1)
    const after = await call<{ turns: readonly { text: string }[] }>(
      `${scene}/session?thread=${main}`,
    )
    expect(after.body.turns.filter((turn) => turn.text.includes('鸡蛋不要炒老'))).toHaveLength(1)
  })

  it('leaves a simulated conversation untouched', async () => {
    await start()
    const space = await newSpace()
    const thread = await ask(space.id, '位置编码有什么用')
    const organized = await call<{
      branches: readonly unknown[]
      merges: readonly unknown[]
    }>(`${scene}/organize`, { space: space.id, thread })
    expect(organized.body.branches).toEqual([])
    expect(organized.body.merges).toEqual([])
  })
})
