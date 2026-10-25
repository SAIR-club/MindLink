import { CognitiveSession, learnScene, sceneViewOf } from '@episteme/application'
import { asId, type ActorId, type NodeId, type PublicationId } from '@episteme/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  publicationReaderOf,
  threadReaderOf,
  type PublicationReader,
  type PublicationView,
  type ThreadReader,
} from '../src/index.js'
import { memoryPublications, memoryThreads } from '../src/testing/index.js'

/**
 * One contract for reading threads and publications, run against memory and against real Episteme scene views of two
 * people on one graph. Lin has two threads and two publications, one of them withdrawn; Wei has one thread.
 */

const LIN = 'actor_human_lin'
const WEI = 'actor_human_wei'
const COURSE = 'ml-2026'

type Person = 'lin' | 'wei'

interface World {
  readonly threads: Record<Person, ThreadReader>
  readonly publications: Record<Person, PublicationReader>
  readonly ids: {
    readonly course: string
    readonly other: string
    readonly weis: string
    readonly live: string
    readonly withdrawn: string
  }
  /** Episteme's own `publicationView` for that person, or what the memory world was given. */
  publicationView(person: Person, id: string): PublicationView | undefined
}

const closers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of closers.splice(0)) await close()
})

async function episteme(): Promise<World> {
  const owner = await CognitiveSession.open({ scene: learnScene, sharing: true })
  closers.push(() => owner.close())
  const lin = owner.forActor(LIN, 'Lin')
  const wei = owner.forActor(WEI, 'Wei')

  const course = await lin.openThread({ title: 'Positions', scope: COURSE })
  await lin.appendTurn(course.id, {
    speaker: 'learner',
    text: 'Why do transformers need positions?',
  })
  const other = await lin.openThread({ title: 'Elsewhere' })
  const weis = await wei.openThread({ title: 'Wei’s own', scope: COURSE })

  const claim = await lin.addNode({
    label: 'Attention alone does not encode order',
    kind: 'claim',
    scope: COURSE,
  })
  const elsewhere = await lin.addNode({ label: 'Heads specialise', kind: 'claim' })
  const live = await lin.publish({ root: claim.nodeId })
  const withdrawn = await lin.publish({ root: elsewhere.nodeId })
  if (!live.ok || !withdrawn.ok) throw new Error('publishing was refused')
  await lin.withdrawPublication(withdrawn.publication.id)

  const views = { lin: sceneViewOf(lin), wei: sceneViewOf(wei) }
  return {
    threads: { lin: threadReaderOf(views.lin), wei: threadReaderOf(views.wei) },
    publications: { lin: publicationReaderOf(views.lin), wei: publicationReaderOf(views.wei) },
    ids: {
      course: course.id,
      other: other.id,
      weis: weis.id,
      live: live.publication.id,
      withdrawn: withdrawn.publication.id,
    },
    publicationView: (person, id) => views[person].publicationView(id),
  }
}

function memoryView(id: string, root: string, label: string, live: boolean): PublicationView {
  return {
    publication: {
      id: asId<PublicationId>(id),
      actorId: asId<ActorId>(LIN),
      createdAt: 1,
      root: asId<NodeId>(root),
      members: [asId<NodeId>(root)],
      edges: [],
    },
    live,
    ...(live ? {} : { withdrawnAt: 2 }),
    nodes: [{ nodeId: root, label, type: 'claim', author: LIN, confirmation: 'person' }],
    edges: [],
    threads: [],
    versions: [id],
  }
}

function memory(): Promise<World> {
  const course = { id: 'thr_course', owner: LIN, title: 'Positions', scope: COURSE, createdAt: 1 }
  const other = { id: 'thr_other', owner: LIN, title: 'Elsewhere', createdAt: 2 }
  const weis = { id: 'thr_weis', owner: WEI, title: 'Wei’s own', scope: COURSE, createdAt: 3 }
  const turn = {
    id: 'turn_1',
    thread: course.id,
    seq: 1,
    speaker: 'learner' as const,
    text: 'Why do transformers need positions?',
    by: LIN,
    at: 1,
  }
  const entries = [
    {
      view: memoryView('pub_live', 'claim_1', 'Attention alone does not encode order', true),
      scope: COURSE,
    },
    { view: memoryView('pub_withdrawn', 'claim_2', 'Heads specialise', false) },
  ]
  const given = (person: Person, id: string) =>
    entries
      .map((entry) => entry.view)
      .find(
        (view) =>
          view.publication.id === id &&
          (view.live || (person === 'lin' && view.publication.actorId === LIN)),
      )
  return Promise.resolve({
    threads: {
      lin: memoryThreads([
        { thread: course, turns: [turn] },
        { thread: other, turns: [] },
      ]),
      wei: memoryThreads([{ thread: weis, turns: [] }]),
    },
    publications: {
      lin: memoryPublications(entries, { caller: LIN }),
      wei: memoryPublications(entries, { caller: WEI }),
    },
    ids: {
      course: course.id,
      other: other.id,
      weis: weis.id,
      live: 'pub_live',
      withdrawn: 'pub_withdrawn',
    },
    publicationView: given,
  })
}

const worlds: readonly [string, () => Promise<World>][] = [
  ['memory', memory],
  ['episteme scene views', episteme],
]

for (const [name, open] of worlds) {
  describe(`thread reader over ${name}`, () => {
    it('reads the caller’s own threads, newest first, by scope', async () => {
      const { threads, ids } = await open()
      expect(threads.lin.threads().map((thread) => thread.id)).toEqual([ids.other, ids.course])
      expect(threads.lin.threads(COURSE).map((thread) => thread.id)).toEqual([ids.course])
      expect(threads.lin.threadView(ids.course)?.turns.map((turn) => turn.text)).toEqual([
        'Why do transformers need positions?',
      ])
    })

    it('never reads another person’s threads', async () => {
      const { threads, ids } = await open()
      expect(threads.wei.threads().map((thread) => thread.id)).toEqual([ids.weis])
      expect(threads.wei.threads(COURSE).map((thread) => thread.id)).toEqual([ids.weis])
      expect(threads.wei.threadView(ids.course)).toBeUndefined()
      expect(threads.wei.threadView(ids.other)).toBeUndefined()
      expect(threads.lin.threadView(ids.weis)).toBeUndefined()
    })
  })

  describe(`publication reader over ${name}`, () => {
    it('browses only live publications', async () => {
      const { publications, ids } = await open()
      for (const reader of [publications.lin, publications.wei]) {
        expect(reader.browse().map((summary) => summary.id)).toEqual([ids.live])
      }
      expect(publications.wei.browse({ scope: COURSE }).map((summary) => summary.id)).toEqual([
        ids.live,
      ])
      expect(publications.wei.browse({ scope: 'other-course' })).toEqual([])
      expect(publications.wei.browse({ author: LIN })).toHaveLength(1)
      expect(publications.wei.browse({ author: WEI })).toEqual([])
      expect(publications.wei.browse({ q: 'specialise' })).toEqual([])
    })

    it('lists what the publication’s own view holds', async () => {
      const { publications, ids } = await open()
      const [summary] = publications.wei.browse()
      const view = publications.wei.view(ids.live)
      expect(summary).toMatchObject({
        id: ids.live,
        author: LIN,
        rootLabel: 'Attention alone does not encode order',
        members: view?.publication.members.length,
        version: 1,
      })
    })

    it('views a publication exactly as Episteme’s publicationView does', async () => {
      const world = await open()
      const { publications, ids } = world
      const live = publications.wei.view(ids.live)
      expect(live).toBeDefined()
      expect(live?.live).toBe(true)
      expect(live).toEqual(world.publicationView('wei', ids.live))
      expect(live?.nodes.map((node) => node.label)).toEqual([
        'Attention alone does not encode order',
      ])

      // Withdrawn: gone for everyone else, still there for its author.
      expect(publications.wei.view(ids.withdrawn)).toBeUndefined()
      expect(world.publicationView('wei', ids.withdrawn)).toBeUndefined()
      const own = publications.lin.view(ids.withdrawn)
      expect(own?.live).toBe(false)
      expect(own).toEqual(world.publicationView('lin', ids.withdrawn))

      expect(publications.wei.view('pub_unknown')).toBeUndefined()
    })
  })
}
