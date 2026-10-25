/**
 * Learning projects (layer L1): one person's learning space on a course, holding settings only (MindLink#10).
 *
 * Any feature reads a project with `getProject(ports, id)`, passing its own ports, and its course scope with
 * `scopeTag`. Writing needs the project feature's own ports, which only its tools and routes are given, so a feature
 * above cannot change a project. The tools and routes are in `mcp.ts` and `routes.ts`, wired by `app.ts` alone.
 */

export {
  AGENT_WRITABLE,
  createProject,
  DEFAULT_GUIDANCE,
  FEATURE,
  GOAL_TYPES,
  GUIDANCE,
  getProject,
  listProjects,
  parseNewProject,
  parsePatch,
  PERSON_WRITABLE,
  PROJECT_RECORD,
  scopeTag,
  setArchived,
  summaryOf,
  updateProject,
  WORKFLOW_OF,
  type GoalType,
  type Guidance,
  type NewProject,
  type PatchField,
  type Project,
  type ProjectPatch,
  type ProjectSummary,
} from './logic.js'
