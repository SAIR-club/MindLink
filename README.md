# MindLink

> The learning application built on Episteme: guided questions, customizable learning workflows, and understanding shared within a course.

MindLink (formerly Learner) provides the interaction surface where inquiry turns into persistent, evolving understanding:
- **`packages/domain-learn`**: The Learn domain pack (vocabulary, node types, edge types, cognitive state dimensions, guards, and hybrid retriever).
- **`apps/learn`**: The Learn interaction surface (terminal CLI + local Web interface).

## Setup & Quick Start

MindLink builds against the Episteme commit named in `episteme.ref`, checked out beside this repository as
`../Episteme`. `scripts/setup-episteme.mjs` puts it there and builds it.

```bash
node scripts/setup-episteme.mjs   # Episteme at the pinned commit, in ../Episteme
pnpm install
pnpm build
pnpm check              # typecheck + lint + tests
pnpm learn:web          # start the local web interface (default http://127.0.0.1:4321)
# or
pnpm learn              # interactive terminal session
```

Moving to a newer Episteme is a pull request that changes `episteme.ref` (ADR 0013, step M1). An Episteme
change lands in Episteme first; MindLink then bumps the ref and uses it.

## Structure

```text
mindlink/
├── apps/
│   └── learn/           Interactive surface: CLI & Web server
├── packages/
│   └── domain-learn/    Domain pack: node/edge definitions, guards, hybrid retrieval
└── tests/               Integration test suite
```
