import type { SceneView, Thread, ThreadView } from '@episteme/application'

/** Reads the caller's own conversation threads (ADR 0015). */
export interface ThreadReader {
  /** The caller's own threads, newest first, optionally of one learning project or course. */
  threads(scope?: string): readonly Thread[]
  /** One of the caller's own threads with its turns, or `undefined` for any thread that is not theirs. */
  threadView(threadId: string): ThreadView | undefined
}

/** The thread reader for a scene view. Episteme decides whose threads these are: never another person's. */
export function threadReaderOf(view: SceneView): ThreadReader {
  return Object.freeze({
    threads: (scope?: string) => view.threads(scope),
    threadView: (threadId: string) => view.threadView(threadId),
  })
}

export type { Thread, ThreadView }
