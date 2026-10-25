import type { SceneView } from '@episteme/application'

/**
 * What a feature may read about a person's understanding.
 *
 * Reads only. Changing someone's understanding is a proposal they decide (`Proposer`), never a write: there is no
 * way to record, decide or link through a port, at run time as well as in the type, because the view behind it has
 * none.
 */
export interface StateReader {
  progress(): ReturnType<SceneView['progress']>
  nodes(): ReturnType<SceneView['listNodes']>
  understandingOf(
    ...args: Parameters<SceneView['understandingOf']>
  ): ReturnType<SceneView['understandingOf']>
  historyOf(...args: Parameters<SceneView['historyOf']>): ReturnType<SceneView['historyOf']>
  vocabulary(): ReturnType<SceneView['vocabulary']>
  recall(...args: Parameters<SceneView['recall']>): ReturnType<SceneView['recall']>
  pendingSuggestions(): ReturnType<SceneView['pendingSuggestions']>
}

/** What a feature may suggest. Every suggestion waits for the person, or for a delegation they granted. */
export interface Proposer {
  propose(...args: Parameters<SceneView['propose']>): ReturnType<SceneView['propose']>
  distill(...args: Parameters<SceneView['distill']>): ReturnType<SceneView['distill']>
}

export function stateReaderOf(view: SceneView): StateReader {
  return Object.freeze({
    progress: () => view.progress(),
    nodes: () => view.listNodes(),
    understandingOf: (...args: Parameters<SceneView['understandingOf']>) =>
      view.understandingOf(...args),
    historyOf: (...args: Parameters<SceneView['historyOf']>) => view.historyOf(...args),
    vocabulary: () => view.vocabulary(),
    recall: (...args: Parameters<SceneView['recall']>) => view.recall(...args),
    pendingSuggestions: () => view.pendingSuggestions(),
  })
}

export function proposerOf(view: SceneView): Proposer {
  return Object.freeze({
    propose: (...args: Parameters<SceneView['propose']>) => view.propose(...args),
    distill: (...args: Parameters<SceneView['distill']>) => view.distill(...args),
  })
}
