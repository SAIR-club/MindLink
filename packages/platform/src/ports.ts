import type { SceneView } from '@episteme/application'
import { systemClock, type Clock } from './clock.js'
import { publicationReaderOf, type PublicationReader } from './publications.js'
import {
  featureRecords,
  readonlyFeatureRecords,
  type FeatureRecords,
  type ReadonlyFeatureRecords,
} from './records.js'
import { proposerOf, stateReaderOf, type Proposer, type StateReader } from './state.js'
import { threadReaderOf, type ThreadReader } from './threads.js'

/** Everything a feature reaches Episteme through, for one caller and one request. */
export interface Ports {
  readonly state: StateReader
  readonly proposer: Proposer
  /** This feature's records only. */
  readonly records: FeatureRecords
  /** Another feature's records, read only. Read them through that feature's own exported functions. */
  readRecordsOf(feature: string): ReadonlyFeatureRecords
  readonly threads: ThreadReader
  readonly publications: PublicationReader
  readonly clock: Clock
}

/** The ports of one feature over a scene view. */
export function portsOf(view: SceneView, feature: string, clock: Clock = systemClock): Ports {
  return Object.freeze({
    state: stateReaderOf(view),
    proposer: proposerOf(view),
    records: featureRecords(view.records, feature),
    readRecordsOf: (other: string) => readonlyFeatureRecords(view.records, other),
    threads: threadReaderOf(view),
    publications: publicationReaderOf(view),
    clock,
  })
}
