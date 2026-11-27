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
  readonly onOpenThread: (thread: string) => void
}

export function Outline({ outline, thread, onJump, onOpenThread }: OutlineProps) {
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
          {outline.branches
            ?.filter(
              (branch) =>
                branch.title === topic.title ||
                topic.points.some((point) => point.turn === branch.turn),
            )
            .map((branch) => (
              <button
                type="button"
                key={`branch-${branch.id}`}
                className="outline-branch ui-button"
                aria-label={`进入「${branch.title}」`}
                onClick={() => onOpenThread(branch.id)}
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
                {branch.title}
              </button>
            ))}
          {outline.merges
            ?.filter((merge) => topic.points.some((point) => point.turn === merge.anchor))
            .map((merge) => (
              <button
                type="button"
                key={`merge-${merge.id}`}
                className="outline-merge"
                aria-label={`查看回流到主线的「${merge.summary}」`}
                onClick={() => onJump(thread, merge.turn)}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M13 3V8.5A2.5 2.5 0 0 1 10.5 11H4m2.6-2.5L4 11l2.6 2.5"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {merge.summary}
              </button>
            ))}
        </li>
      ))}
      {outline.merges
        ?.filter(
          (merge) =>
            !outline.topics.some((topic) =>
              topic.points.some((point) => point.turn === merge.anchor),
            ),
        )
        .map((merge) => (
          <li className="outline-topic" key={`merge-loose-${merge.id}`}>
            <button
              type="button"
              className="outline-merge"
              aria-label={`查看回流到主线的「${merge.summary}」`}
              onClick={() => onJump(thread, merge.turn)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M13 3V8.5A2.5 2.5 0 0 1 10.5 11H4m2.6-2.5L4 11l2.6 2.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {merge.summary}
            </button>
          </li>
        ))}
    </ol>
  )
}
