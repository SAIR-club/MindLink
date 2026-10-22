# @mindlink/platform

MindLink's one way into Episteme. No other MindLink module imports `@episteme/application`, `@episteme/mcp` or
`@episteme/service`; `tests/architecture.test.ts` keeps it so. When Episteme's interfaces change, this package changes
and the features built on it do not.

## What a feature uses

| export | for |
| ------ | --- |
| `Ports` | Everything a feature reaches Episteme through, per caller and request. |
| `StateReader` | Reading understanding: progress, nodes, history, vocabulary, recall. Never writing. |
| `Proposer` | Suggesting and distilling. Every suggestion waits for the person, or a delegation they granted. |
| `FeatureRecords`, `RecordKind` | The feature's own records. Keys are prefixed with the feature's name, so features cannot reach each other's; each kind has a schema version and, above 1, a `migrate`. |
| `ThreadReader`, `PublicationReader` | Reading threads and browsing publications. They refuse with `not_available` until Episteme closes gaps G1 and G2. |
| `defineTool`, `defineRoute` | Turning handlers written against `Ports` into the MCP tools and REST routes Episteme mounts. |
| `refuse` | Refusing a request: a tool error with its code for an agent, a 422 for a person. |

The app uses `sceneOf` and `launch` to start the service.

## Testing

`@mindlink/platform/testing` has an in-memory implementation of every port (`memoryPorts`, `memoryRecords`,
`stubState`, `fixedClock`, …) and `openTestView` for a real scene view over an in-memory graph. The record contract
in `test/` runs against both, so a feature tested against memory behaves the same against the service. Source code
never imports the testing entry.
