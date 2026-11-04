/**
 * The tools blocks may name in `tools:`, checked when blocks are loaded: the generic reads of MindLink#11, by their
 * MCP names. The tools themselves are in `reads/mcp.ts`, wired by `app.ts`; a test keeps the two lists equal.
 */
export const blockToolNames: readonly string[] = Object.freeze([
  'state_gaps',
  'recent_turns',
  'course_hotspots',
  'items_due',
])
