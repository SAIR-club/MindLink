import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addPerson, addToken, startService } from '@episteme/service'
import {
  buildExportNotes,
  workbenchProfile,
  type HeldNode,
  type ModelClient,
  type NotesExport,
  type Space,
} from '@mindlink/workbench'
import { expect, it } from 'vitest'
import { pageBody, rest } from './rest.js'

function node(nodeId: string, label: string, details: Partial<HeldNode> = {}): HeldNode {
  return {
    nodeId,
    label,
    type: 'claim',
    author: 'mine',
    understanding: [],
    relations: [],
    elsewhere: [],
    withdrawn: false,
    conflict: false,
    openChallenges: 0,
    topics: [],
    ...details,
  }
}

const at = (day: number) => Date.UTC(2026, 0, day)

it('builds portable Markdown notes with sources, history and links to their final filenames', () => {
  const long = '序'.repeat(40)
  const first = node('first', `${long}/旧`, { withdrawn: true })
  const middle = node('middle', `${long}?新`, {
    relations: [{ type: 'evolves_to', direction: 'in', nodeId: first.nodeId, label: first.label }],
  })
  const topic = {
    materialId: 'private-material-id',
    title: '材料: "位置".md',
    section: '位置/编码',
  }
  const latest = node('latest', '位置:编/码', {
    conflict: true,
    topics: [topic, { ...topic, materialId: 'another', title: '另一份材料' }],
    excerpt: '第一句\n第二句',
    origin: { at: at(1), speaker: 'learner', basis: 'stated', thread: 'private-thread-id' },
    relations: [
      { type: 'supports', direction: 'out', nodeId: first.nodeId, label: first.label },
      { type: 'contradicts', direction: 'in', nodeId: first.nodeId, label: first.label },
      { type: 'evolves_to', direction: 'in', nodeId: middle.nodeId, label: middle.label },
      { type: 'supports', direction: 'out', nodeId: 'foreign', label: '其他人的原文' },
    ],
  })
  const result = buildExportNotes({
    spaceName: '机器/学习',
    exportedAt: at(5),
    actor: 'mine',
    nodes: [
      first,
      middle,
      latest,
      node('foreign', '其他人的原文', { author: 'another person', topics: [topic] }),
      node('device', 'NUL.txt'),
      node('blank', ':*?'),
    ],
    confirmedAt: new Map([
      ['first', at(2)],
      ['middle', at(3)],
      ['latest', at(4)],
    ]),
    threadTitle: (id) => (id === 'private-thread-id' ? '一次对话' : undefined),
    authorName: () => undefined,
  })

  expect(result.fileName).toBe('机器学习-我的理解.zip')
  const files = new Map(result.files.map(({ path, text }) => [path, text]))
  expect([...files.keys()]).toEqual([
    'README.md',
    `理解/${long}.md`,
    `理解/${long} (2).md`,
    '理解/位置编码.md',
    '理解/_NUL.txt.md',
    '理解/理解.md',
    '主题/位置编码.md',
    '主题/位置编码 (2).md',
  ])
  expect(files.get('README.md')).toContain('理解 5 条，主题 2 个。')
  expect(files.get('README.md')).toContain('2026-01-05')
  const note = files.get('理解/位置编码.md')
  expect(note).toContain(
    '---\nid: "latest"\nconfirmed: 2026-01-04T00:00:00.000Z\ntopics: ["位置/编码"]\n' +
      'source: ["材料: \\"位置\\".md","另一份材料"]\nconflict: true\n---\n\n位置:编/码\n',
  )
  expect(note).toContain('## 来源\n\n> 第一句\n> 第二句\n\n对话《一次对话》')
  expect(note).toContain(`- 支持 [[${long}]]\n- 矛盾 [[${long}]]\n- 修正自 [[${long} (2)]]`)
  expect(note).toContain(`## 修改记录\n\n- 2026-01-03 ${middle.label}\n- 2026-01-02 ${first.label}`)
  expect(files.get('主题/位置编码.md')).toContain('[[理解/位置编码]]')
  expect(files.get('主题/位置编码 (2).md')).toContain('[[理解/位置编码]]')
  expect(files.get('理解/_NUL.txt.md')).not.toContain('##')
  const all = result.files.map(({ text }) => text).join('\n')
  expect(all).not.toMatch(/其他人的原文|private-thread-id|private-material-id/)
  for (const [, target] of all.matchAll(/\[\[([^\]]+)\]\]/gu)) {
    expect(files.has(target?.includes('/') === true ? `${target}.md` : `理解/${target}.md`)).toBe(
      true,
    )
  }
})

it('exports reviewed notes and explicit citations from the selected space over HTTP', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'episteme-export-notes-'))
  const users = join(directory, 'users.json')
  const model: ModelClient = {
    name: 'scripted',
    simulated: false,
    complete: () => Promise.resolve({ text: '位置编码让模型知道顺序[1]。' }),
  }
  const lin = await addPerson(users, '林')
  const wei = await addPerson(users, '魏')
  const linToken = await addToken(users, lin, 'human', 'workbench')
  const weiToken = await addToken(users, wei, 'human', 'workbench')
  const service = await startService({
    graph: join(directory, 'graph.db'),
    port: 0,
    profile: workbenchProfile({ model }),
    mode: 'shared',
    users,
    publicOrigin: 'https://workbench.example.edu',
    sharing: true,
    embeddings: false,
  })
  try {
    const scene = '/scene/workbench'
    const call = <T>(path: string, body?: unknown, token = weiToken) =>
      pageBody<T>({ ...service, humanToken: token }, path, body)
    const newSpace = async (name: string, token = weiToken) =>
      (await call<{ space: Space }>(`${scene}/spaces`, { name }, token)).space.id
    const space = await newSpace('注意力')
    const otherSpace = await newSpace('另一空间')
    const foreignSpace = await newSpace('林的空间', linToken)
    const direct = async (space: string, label: string, token?: string) =>
      (
        await call<{ node: HeldNode }>(
          '/nodes',
          { scope: `workbench:${space}`, label, kind: 'claim' },
          token,
        )
      ).node.nodeId
    await direct(otherSpace, '同一人在另一空间的理解')
    const share = async (label: string) => {
      const node = await direct(foreignSpace, label, linToken)
      const { publication } = await call<{ publication: { id: string } }>(
        '/publications',
        { root: node },
        linToken,
      )
      return { node, publication: publication.id }
    }
    await share('别人发布但没有被引用的理解')
    const cited = await share('读者主动引用的理解')
    await call(`/publications/${cited.publication}/adopt`, {
      node: cited.node,
      dimensions: { confidence: 'medium' },
    })
    await call(`${scene}/sharing/cite`, { space, ...cited })
    const { names } = await call<{ names: Record<string, string> }>('/me')
    const query = new URLSearchParams({ space, [`author.${lin}`]: names[lin] ?? '' })

    await call(`${scene}/materials`, {
      space,
      fileName: '笔记.md',
      contentBase64: Buffer.from(
        '# 位置编码\n\n位置编码让模型知道顺序。\n不应出现在导出里的材料正文。',
      ).toString('base64'),
    })
    async function offer(question: string) {
      const { thread, turn } = await call<{ thread: string; turn: string }>(`${scene}/ask`, {
        space,
        question,
      })
      const { suggestions } = await call<{ suggestions: readonly { id: string }[] }>(
        `${scene}/candidates/turn`,
        { space, thread, turn },
      )
      expect(suggestions).toHaveLength(1)
      return suggestions[0]!.id
    }
    const accepted = await offer('位置编码可以把顺序告诉模型')
    await call('/suggestions/decide', { id: accepted, action: 'accept' })
    await offer('这条仍然在等待确认')

    const result = await call<NotesExport>(`${scene}/understanding/export?${query}`)
    expect(result.fileName).toBe('注意力-我的理解.zip')
    const files = new Map(result.files.map(({ path, text }) => [path, text]))
    expect(files.get('理解/位置编码可以把顺序告诉模型.md')).toMatch(
      /confirmed: \d{4}-\d{2}-\d{2}T[^\n]+\ntopics: \["位置编码"\]\nsource: \["笔记\.md"\]/u,
    )
    expect(files.get('主题/位置编码.md')).toContain('[[位置编码可以把顺序告诉模型]]')
    expect(files.get('理解/读者主动引用的理解.md')).toContain('from: "林"')
    expect(JSON.stringify(result)).not.toMatch(
      /仍然在等待确认|没有被引用|另一空间的理解|不应出现在导出里/u,
    )
    const forbidden = await rest(
      service.apiUrl,
      `${scene}/understanding/export?space=${encodeURIComponent(foreignSpace)}`,
      undefined,
      weiToken,
    )
    expect(forbidden.body.code).toBe('unknown_space')
    const empty = await newSpace('空空间')
    expect(
      (await call<NotesExport>(`${scene}/understanding/export?space=${empty}`)).files.map(
        ({ path }) => path,
      ),
    ).toEqual(['README.md'])
  } finally {
    await service.close()
    await rm(directory, { recursive: true, force: true })
  }
})
