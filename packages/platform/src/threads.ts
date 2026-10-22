import type { SceneView, Thread, ThreadView } from '@episteme/application'
import { refuse } from './refusal.js'

/** Reads the caller's own conversation threads (ADR 0015). */
export interface ThreadReader {
  threads(scope?: string): readonly Thread[]
  threadView(threadId: string): ThreadView | undefined
}

/**
 * The thread reader for a scene view.
 *
 * `SceneView` cannot read threads yet: that is Episteme gap G1 (see MindLink#11). Until it can, every read is
 * refused, so a feature that needs threads says so instead of answering as if the person had none.
 */
export function threadReaderOf(_view: SceneView): ThreadReader {
  const unavailable = (): never =>
    refuse(
      'not_available',
      'reading threads needs Episteme gap G1 (SceneView cannot read threads yet)',
    )
  return Object.freeze({ threads: unavailable, threadView: unavailable })
}

export type { Thread, ThreadView }
