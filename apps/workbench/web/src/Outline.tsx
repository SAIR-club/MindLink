import type { Outline as OutlineRecord } from './api.js'

/**
 * The conversation as an outline. Topics carry the shape of the discussion, points carry what each part settled,
 * and a branch appears where the model sees the discussion turn into a new line. Every point keeps its turn so
 * reading can return to the words at any time.
 */

interface OutlineProps {
  readonly outline: OutlineRecord
  readonly thread: string
  readonly onJump: (thread: string, turn: string | undefined) => void
  readonly onFork: (title: string, turn: string) => void
}

export function Outline({ outline, thread, onJump, onFork }: OutlineProps) {
  if (outline.topics.length === 0) {
    return <span className="git-empty" role="img" aria-label="还没有大纲" />
  }
  return (
    <ol className="outline-topics">
      {outline.topics.map((topic) => (
        <li className="outline-topic" key={topic.id}>
          <span className="outline-topic-dot" aria-hidden="true" />
          <h4>{topic.title}</h4>
          <p className="outline-gist">{topic.gist}</p>
          <ul className="outline-points">
            {topic.points.map((point) => (
              <li key={`${topic.id}-${point.turn}`}>
                <span className="outline-point-dot" aria-hidden="true" />
                <button
                  type="button"
                  className="outline-point"
                  aria-label={`定位到「${point.text}」的原对话`}
                  onClick={() => onJump(thread, point.turn)}
                >
                  {point.text}
                </button>
              </li>
            ))}
          </ul>
          {topic.branch !== undefined && (
            <button
              type="button"
              className="outline-branch"
              aria-label={`从「${topic.branch.title}」分叉`}
              onClick={() => onFork(topic.branch?.title ?? '', topic.branch?.turn ?? '')}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4 13V8.5A2.5 2.5 0 0 1 6.5 6H13m-2.6-2.5L13 6l-2.6 2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {topic.branch.title}
            </button>
          )}
        </li>
      ))}
    </ol>
  )
}
