import { asId, defineDomainPack, type DimensionId } from '@episteme/core'
import { afterEach, describe, expect, it } from 'vitest'
import { featureRecords, sceneOf, type RawRecords } from '../src/index.js'
import { memoryRecords, openTestView } from '../src/testing/index.js'

/**
 * One contract for the record layer, run against both raw stores: memory, and a real Episteme scene view. A feature
 * tested against memory therefore behaves the same against the service.
 */

const confidence = asId<DimensionId>('confidence')
const testScene = sceneOf({
  packs: [
    defineDomainPack('platform-test', {
      nodeTypes: [],
      edgeTypes: [],
      stateDimensions: [
        {
          id: confidence,
          label: 'Confidence',
          kind: 'ordinal',
          ordered: true,
          levels: ['low', 'high'],
        },
      ],
    }),
  ],
  distillationPolicy: {
    id: 'platform-test',
    nodeTypes: {},
    edgeTypes: {},
    stateDimensions: {},
    limits: { perEpisode: 1, perRun: 1 },
    propertiesFor: (_role, label) => ({ text: label }),
  },
  dimensions: [
    {
      id: confidence,
      label: 'Confidence',
      kind: 'ordinal',
      ordered: true,
      levels: ['low', 'high'],
    },
  ],
  presentations: [
    {
      id: 'confidence',
      labelZh: '确信程度',
      levelLabelsZh: { low: '低', high: '高' },
      description: 'How much you would rely on this.',
      descriptionZh: '你愿意多大程度上依赖它。',
    },
  ],
})

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

const stores: readonly [string, () => Promise<RawRecords>][] = [
  ['memory', () => Promise.resolve(memoryRecords())],
  [
    'episteme scene view',
    async () => {
      const opened = await openTestView(testScene)
      closers.push(() => opened.close())
      return opened.view.records
    },
  ],
]

interface Project {
  readonly title: string
}

for (const [name, open] of stores) {
  describe(`feature records over ${name}`, () => {
    it('reads back what was written, by id', async () => {
      const projects = featureRecords(await open(), 'project').of<Project>({
        kind: 'project',
        version: 1,
      })
      await projects.put('p1', { title: '线性代数' })
      await projects.put('p2', { title: '概率论' })
      expect(projects.get('p1')).toEqual({ title: '线性代数' })
      expect(projects.list()).toEqual([
        { id: 'p1', value: { title: '线性代数' } },
        { id: 'p2', value: { title: '概率论' } },
      ])
    })

    it('keeps the latest version of a record', async () => {
      const projects = featureRecords(await open(), 'project').of<Project>({
        kind: 'project',
        version: 1,
      })
      await projects.put('p1', { title: 'first' })
      await projects.put('p1', { title: 'second' })
      expect(projects.get('p1')).toEqual({ title: 'second' })
      expect(projects.list()).toHaveLength(1)
    })

    it('removes a record', async () => {
      const projects = featureRecords(await open(), 'project').of<Project>({
        kind: 'project',
        version: 1,
      })
      await projects.put('p1', { title: 'gone soon' })
      await projects.remove('p1')
      expect(projects.get('p1')).toBeUndefined()
      expect(projects.list()).toEqual([])
    })

    it('keeps one feature out of another feature’s records', async () => {
      const raw = await open()
      await featureRecords(raw, 'project')
        .of<Project>({ kind: 'item', version: 1 })
        .put('x', { title: 'mine' })
      const other = featureRecords(raw, 'blocks').of<Project>({ kind: 'item', version: 1 })
      expect(other.get('x')).toBeUndefined()
      expect(other.list()).toEqual([])
    })

    it('reads an earlier version through migrate', async () => {
      const raw = await open()
      await featureRecords(raw, 'project')
        .of<{ name: string }>({ kind: 'project', version: 1 })
        .put('p1', { name: 'old shape' })
      const current = featureRecords(raw, 'project').of<Project>({
        kind: 'project',
        version: 2,
        migrate: (value, from) => {
          expect(from).toBe(1)
          return { title: (value as { name: string }).name }
        },
      })
      expect(current.get('p1')).toEqual({ title: 'old shape' })
    })

    it('refuses to read a record written by a newer build', async () => {
      const raw = await open()
      await featureRecords(raw, 'project')
        .of<Project>({ kind: 'project', version: 2, migrate: () => ({ title: '' }) })
        .put('p1', { title: 'new' })
      const older = featureRecords(raw, 'project').of<Project>({ kind: 'project', version: 1 })
      expect(() => older.get('p1')).toThrow(/newer than this build/)
    })

    it('refuses an id that could reach another kind', async () => {
      const projects = featureRecords(await open(), 'project').of<Project>({
        kind: 'project',
        version: 1,
      })
      await expect(projects.put('../blocks/x', { title: 'escape' })).rejects.toMatchObject({
        code: 'invalid_record_id',
      })
    })
  })
}

describe('record kinds are checked when declared', () => {
  it('needs a migrate function above version 1', () => {
    expect(() =>
      featureRecords(memoryRecords(), 'project').of({ kind: 'project', version: 2 }),
    ).toThrow(/needs a migrate function/)
  })

  it('rejects a feature or kind name that is not a plain lowercase name', () => {
    expect(() => featureRecords(memoryRecords(), 'Project')).toThrow(/lowercase/)
    expect(() =>
      featureRecords(memoryRecords(), 'project').of({ kind: 'a/b', version: 1 }),
    ).toThrow(/lowercase/)
  })
})
