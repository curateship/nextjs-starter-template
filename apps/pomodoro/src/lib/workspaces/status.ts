/**
 * Whether a workspace answers a visitor.
 *
 * Here rather than beside the table because the admin form needs them too, and
 * only `src/lib/api/*`, `src/routes/api/**` and `src/server/*` may reach into
 * `@/server` — a form importing the schema module would drag the database
 * driver into the browser bundle.
 */
export const WORKSPACE_STATUSES = ["active", "draft", "inactive"] as const

export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number]

/** The two states that answer. A draft answers so it can be checked first. */
export const LIVE_WORKSPACE_STATUSES: readonly WorkspaceStatus[] = [
  "active",
  "draft",
]
