/**
 * The states a site can be in.
 *
 * Here rather than beside the table because the admin form needs them too, and
 * only `src/lib/api/*`, `src/routes/api/**` and `src/server/*` may reach into
 * `@/server` — a form that imported the schema module would drag the database
 * driver into the browser bundle.
 */
export const SITE_STATUSES = ["draft", "active", "inactive"] as const

export type SiteStatus = (typeof SITE_STATUSES)[number]

/** The two states that answer a visitor. A draft answers so it can be checked. */
export const LIVE_SITE_STATUSES: readonly SiteStatus[] = ["active", "draft"]
