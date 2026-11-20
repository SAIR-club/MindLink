# Connecting an agent to MindLink

MindLink speaks the Model Context Protocol (MCP) over Streamable HTTP, so any agent that is an MCP client can use it;
nothing here is specific to one agent. Two things connect an agent:

- **The MCP server**: where MindLink's tools are. `mcp.json` (local) and `mcp.shared.json` (shared) give it in the
  common `mcpServers` form.
- **The skill** (`skills/mindlink/SKILL.md`): when to call which tool, in the open Agent Skills format.

## 1. Start MindLink

From the MindLink repository:

```bash
pnpm mindlink            # local mode: one person, loopback, http://127.0.0.1:4321
```

## 2. Add the MCP server

| Mode   | URL                                  | Header                                |
| ------ | ------------------------------------ | ------------------------------------- |
| local  | `http://127.0.0.1:4321/mcp`          | none: loopback needs no token         |
| shared | `https://<your MindLink server>/mcp` | `Authorization: Bearer <agent token>` |

In shared mode, create an agent token for this machine in MindLink first (the token page, or `POST /api/v1/tokens`
with your own token). `mcp.shared.json` reads it from the `MINDLINK_AGENT_TOKEN` environment variable.

If your agent reads an `mcpServers` file, use `mcp.json` or `mcp.shared.json` as it is. Otherwise enter the same URL
and header wherever your agent configures an MCP server over HTTP.

## 3. Give the agent the skill

- An agent that supports Agent Skills: copy `skills/mindlink` into the skills folder it reads.
- Any other agent: put the body of `SKILL.md` (everything after the front matter) in the instructions it reads for
  the project, such as `AGENTS.md`.

Then ask it to list its MCP tools: `project_list`, `project_open`, `workflow_next` and `recall` should be among them.
Start with "我想用 MindLink 学一下 …".

## What the agent may and may not do

The agent proposes; the learner decides. It cannot accept its own suggestions: an agent's credential is refused on
every decision route, and the skill tells it never to try. Candidate understanding waits in MindLink's review page
until the learner accepts, edits or dismisses it.
