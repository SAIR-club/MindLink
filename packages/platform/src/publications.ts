import type { PublicationSummary, SceneView } from '@episteme/application'
import { refuse } from './refusal.js'

export interface PublicationQuery {
  readonly author?: string
  readonly scope?: string
  readonly q?: string
}

/** Browses the publications the caller can see (ADR 0014). What is visible is decided by Episteme alone. */
export interface PublicationReader {
  browse(query?: PublicationQuery): readonly PublicationSummary[]
}

/**
 * The publication reader for a scene view.
 *
 * `SceneView` cannot browse publications yet: that is Episteme gap G2 (see MindLink#11). Until it can, browsing is
 * refused rather than answered with an empty list that would read as "nobody has published anything".
 */
export function publicationReaderOf(_view: SceneView): PublicationReader {
  return Object.freeze({
    browse: (): never =>
      refuse(
        'not_available',
        'browsing publications needs Episteme gap G2 (SceneView cannot browse yet)',
      ),
  })
}

export type { PublicationSummary }
