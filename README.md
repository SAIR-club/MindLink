# MindLink

> The learning application built on Episteme: guided questions, customizable learning workflows, and understanding shared within a course.

MindLink runs as one Episteme service composed with the Learn scene and MindLink's own tools and routes. It never
opens a graph itself: the service owns the graph (Episteme ADR 0010), agents reach it over MCP, and the web front end
over REST. What MindLink is to become, and the issues that build it, are in the
[MindLink product spec](https://github.com/SAIR-club/Episteme/blob/main/docs/planning/mindlink-spec.md).

## Setup & Quick Start

MindLink builds against the Episteme commit named in `episteme.ref`, checked out beside this repository as
`../Episteme`. `scripts/setup-episteme.mjs` puts it there and builds it.

```bash
node scripts/setup-episteme.mjs   # Episteme at the pinned commit, in ../Episteme
pnpm install
pnpm build
pnpm check                        # typecheck + lint + format + tests
pnpm mindlink                     # mindlink serve: one person, on loopback, no sign-in
```

`mindlink serve` prints where agents connect (`/mcp`) and where the REST API is. In local mode it also prints your
token, which decides in your name: keep it to yourself. For a course, run one shared service:

```bash
node apps/mindlink/dist/cli.js serve --shared --users users.json --public-origin https://mindlink.example.edu
```

People and their tokens are managed with Episteme's service CLI for now (MindLink#24 brings it into MindLink).
Deploying behind HTTPS is described in Episteme's `docs/deployment.md`.

Moving to a newer Episteme is a pull request that changes `episteme.ref` (ADR 0013, step M1). An Episteme
change lands in Episteme first; MindLink then bumps the ref and uses it.

## Structure

```text
mindlink/
├── apps/mindlink/         The composition root (app.ts) and `mindlink serve` (cli.ts)
├── packages/
│   ├── platform/          The only package that imports Episteme: ports, scene, launch; testing/ fakes
│   └── domain-learn/      The Learn vocabulary: node and edge types, state dimensions, guards, presentations
├── architecture.json      The layer table
└── tests/                 Integration tests, and the architecture test that checks the layer table
```

Layers, from the bottom: L0 the platform, L1 base features (learning projects, accounts), L2 features
(understanding, blocks, sharing), L3 the assembly (`app.ts`), L4 the entry (`cli.ts`). A module imports only lower
layers, only through their public entry; a feature's MCP tools and REST routes are wired only in `app.ts`. Every
new module is added to `architecture.json` in the pull request that creates it, and `tests/architecture.test.ts`
fails until it is.
