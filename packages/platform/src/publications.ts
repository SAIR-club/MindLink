import type { PublicationSummary, PublicationView, SceneView } from '@episteme/application'

export interface PublicationQuery {
  readonly author?: string
  readonly scope?: string
  readonly q?: string
}

/** Reads the publications the caller can see (ADR 0014). What is visible is decided by Episteme alone. */
export interface PublicationReader {
  /** Live publications, newest first. A withdrawn publication never appears. */
  browse(query?: PublicationQuery): readonly PublicationSummary[]
  /**
   * One publication's public content: its members, the relations it made public, thread summaries and version
   * chain. No one's state and no adopter. `undefined` for an unknown publication, or a withdrawn one the caller did
   * not write.
   */
  view(id: string): PublicationView | undefined
}

/** The publication reader for a scene view. */
export function publicationReaderOf(view: SceneView): PublicationReader {
  return Object.freeze({
    browse: (query: PublicationQuery = {}) => view.browsePublications(query),
    view: (id: string) => view.publicationView(id),
  })
}

export type { PublicationSummary, PublicationView }
