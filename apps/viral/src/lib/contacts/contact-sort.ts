/**
 * The columns the contacts list can be ordered by, in one browser-safe place.
 *
 * One list, not three. The route validates `?sort=` against it, the server
 * function's validator checks the incoming value against it, and the query
 * turns it into a real column — a second hand-written copy of any of those is
 * how a sort column silently stops working: no error, the list just reorders by
 * the wrong thing. See the same lesson on the feedback and accounts tables.
 *
 * It lives here rather than in `@/server/contacts` because a route and a
 * component need the runtime array, and importing a runtime value out of
 * `@/server/*` is what drags server code into the browser bundle.
 */
export const CONTACT_SORT_COLUMNS = [
  "email",
  "name",
  "status",
  "created",
  /** When anything was last sent to them. Never emailed sorts as the oldest. */
  "emailed",
] as const

export type ContactSortColumn = (typeof CONTACT_SORT_COLUMNS)[number]
