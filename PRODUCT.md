# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

The primary user is a course learner working with a local agent while studying course material. Their job is to ask questions, follow a line of reasoning into branches, and keep an understandable record of what was discussed and concluded.

Course teachers and teaching assistants may read shared understanding across learners. Other audiences have not been confirmed.

## Product Purpose

MindLink turns an agent conversation into a living understanding graph. The learner can read the conversation normally, see its structure and summaries alongside it, follow any understanding back to the words that produced it, and share understood nodes within a course.

Success means the learner can answer three questions from the surface: what was discussed, where each conclusion came from, and which branches are still open.

## Positioning

MindLink's mechanism is bidirectional synchronization between conversation and understanding: the agent and the web write one shared record; the page presents that record as conversation-ordered branches and topic groups; every derived item can locate its source turn. Skills are managed in the page and invoked by the agent.

## Operating Context

- Work happens around uploaded course material and live agent conversations.
- The workbench is a web app. Local agents connect through MCP and REST.
- The product also targets iOS and Android native apps; all three platforms share the same product facts and data, with each platform using its own design language.
- Mobile web remains part of the web platform.
- Understanding can be private, shared with a course, or drawn from public nodes, with provenance preserved.
- The interface uses Simplified Chinese; code and code comments use English.

## Capabilities and Constraints

Confirmed:

- Ordinary conversation works without material. Material is optional context; only material-supported statements carry citations.
- The understanding layer shows a Git-like branch tree. Solid wires and filled points hold confirmed understanding; dashed wires and hollow points hold live notes.
- Clicking an understanding item locates the original conversation turn and highlights it.
- Live meeting-style notes update as the conversation develops. They are accepted together with one action.
- Branch switching is symmetric from the main line and from branches.
- Skills are layered and customizable in structure; the agent invokes them directly. The page manages name, invocation name, enablement, and custom layers.
- Materials, conversations, understanding, and sharing are served by one backing service.
- Accessibility target: keyboard reachability and WCAG 2.2 AA, including readable names for icon controls.

Open decisions:

- Native iOS and Android shells are planned; their platform-specific interaction details are undefined.
- Automatic branch suggestions and topic detection beyond material sections are not settled.
- Server-side authoring of custom skills is not settled.
- Live read-only mirroring of other agents' local transcripts is desired; authorized directories and write-back scope are undecided.

## Brand Commitments

- Product name: MindLink.
- User-facing language: Simplified Chinese. Code and comments: English.
- User-visible status should come from the interface itself: lines, points, position, and icons carry state. Explanatory status captions such as “实时纪要”, “已确认”, and “你的原话” are avoided in the understanding layer.
- No testimonials, customers, pricing, licensing, or deployment commitments have been supplied.

## Evidence on Hand

- Repository README: `README.md`.
- Architecture boundary: `architecture.json`, `tests/architecture.test.ts`.
- Current web workbench: `apps/workbench/web/src`.
- Service and domain logic: `apps/workbench/src`, `apps/mindlink`, `packages`.
- UI reference prototype: `prototypes/mindlink-live.html`.
- PR #78 branch `feat/workbench-live-companion` carries the current live rail, topic tree, click-to-source, and general conversation behavior.
- No real customer quotes, analytics, benchmark results, pricing, or legal/proof assets were provided.

## Product Principles

1. The conversation is the source of truth; every derived understanding stays linked to the turn that produced it.
2. The web page and agents operate on one shared record, so navigation and invocation never fork the data.
3. Material supports claims; it does not gate ordinary conversation.
4. Structure should be inspectable at a glance: topic, branch, state, and provenance come from the arrangement.
5. The learner keeps the final say over what becomes durable understanding.

## Accessibility & Inclusion

All controls must be reachable by keyboard and have accessible names. Icon-only controls must expose their action through `aria-label` or an equivalent accessible mechanism. Text and interactive states must meet WCAG 2.2 AA contrast.
