# MindLink for Claude Code

Connects Claude Code to a MindLink service over MCP and teaches it, through a skill, when to call which tool.

## Install

1. Start MindLink (from the MindLink repository):

   ```bash
   pnpm mindlink            # local mode: one person, loopback, http://127.0.0.1:4321
   ```

2. Add the MCP server to Claude Code.

   Local mode (no token needed on loopback):

   ```bash
   claude mcp add --transport http mindlink http://127.0.0.1:4321/mcp
   ```

   Shared mode (a course server): create an agent token for this machine in MindLink (the token page, or
   `POST /api/v1/tokens` with your own token), then:

   ```bash
   claude mcp add --transport http mindlink https://mindlink.example.edu/mcp --header "Authorization: Bearer <agent token>"
   ```

   Or check `mcp.json` (local) or `mcp.shared.json` (shared) into a project as `.mcp.json`; the shared one reads the
   token from the `MINDLINK_AGENT_TOKEN` environment variable.

3. Install the skill, for yourself or for one project:

   ```bash
   cp -r host/claude-code/skills/mindlink ~/.claude/skills/            # for yourself
   cp -r host/claude-code/skills/mindlink <project>/.claude/skills/    # for one project
   ```

4. In Claude Code, run `/mcp` to check that `mindlink` is connected, then start: "我想用 MindLink 学一下 …".

## What the agent may and may not do

The agent proposes; the learner decides. It cannot accept its own suggestions: an agent's credential is refused on
every decision route, and the skill tells it never to try. Candidate understanding waits in MindLink's review page
until the learner accepts, edits or dismisses it.
