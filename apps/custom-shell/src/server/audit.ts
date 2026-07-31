import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAdminAuditLogs,
  customShellPlans,
  customShellUsers,
} from "@/server/schema"

/**
 * The read side of the admin audit trail. Entries are written by
 * `recordAdminAudit` in `@/server/accounts`; nothing here ever writes, edits or
 * deletes one, which is the whole point of keeping the trail.
 */

export type AuditSort = "action" | "resource" | "created"

export type AuditListQuery = {
  search: string
  action: string
  resource: string
  actor: string
  page: number
  pageSize: number
  sort: AuditSort
  direction: "asc" | "desc"
}

export type AuditLogRow = {
  id: string
  action: string
  resource: string
  detail: string | null
  createdAt: string
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  /**
   * What the entry's record ids point at today. `name` is null once the record
   * is gone — a deleted account can never be looked up again, which is why the
   * delete itself now saves the email in `detail`.
   */
  records: { id: string; name: string | null }[]
  /**
   * The fields a plan edit changed. Null on entries written before that was
   * recorded, which saved the plan's slug in `detail` instead.
   */
  changedFields: string[] | null
}

export type AuditFilterOptions = {
  actions: string[]
  resources: string[]
  actors: { id: string; name: string }[]
}

export async function listAuditLogs(
  query: AuditListQuery,
  database: CustomShellDb = db
) {
  const filters: SQL[] = []
  const search = query.search.trim()

  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(customShellUsers.name, pattern),
      ilike(customShellUsers.email, pattern),
      ilike(customShellAdminAuditLogs.action, pattern),
      ilike(customShellAdminAuditLogs.resource, pattern),
      ilike(customShellAdminAuditLogs.detail, pattern),
      // Record ids are a jsonb array; casting to text lets one id be searched.
      sql`${customShellAdminAuditLogs.recordIds}::text ilike ${pattern}`,
      // Every row names the account or plan it is about, read back from those
      // same ids, so the search has to reach those names too — otherwise a name
      // sitting in plain sight on the row matches nothing. Only runs when
      // something was typed.
      sql`exists (
        select 1
        from jsonb_array_elements_text(${customShellAdminAuditLogs.recordIds}) as audit_record(id)
        left join ${customShellUsers} target_user on target_user.id = audit_record.id
        left join ${customShellPlans} target_plan on target_plan.id = audit_record.id
        where target_user.name ilike ${pattern}
           or target_user.email ilike ${pattern}
           or target_plan.name ilike ${pattern}
           or target_plan.slug ilike ${pattern}
      )`
    )
    if (match) filters.push(match)
  }
  if (query.action !== "all") {
    filters.push(eq(customShellAdminAuditLogs.action, query.action))
  }
  if (query.resource !== "all") {
    filters.push(eq(customShellAdminAuditLogs.resource, query.resource))
  }
  if (query.actor !== "all") {
    filters.push(eq(customShellAdminAuditLogs.actorUserId, query.actor))
  }

  const where = filters.length ? and(...filters) : undefined
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    action: customShellAdminAuditLogs.action,
    resource: customShellAdminAuditLogs.resource,
    created: customShellAdminAuditLogs.createdAt,
  }[query.sort]

  const [rows, [totals], options] = await Promise.all([
    database
      .select({
        entry: customShellAdminAuditLogs,
        actorName: customShellUsers.name,
        actorEmail: customShellUsers.email,
      })
      .from(customShellAdminAuditLogs)
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, customShellAdminAuditLogs.actorUserId)
      )
      .where(where)
      // Two entries can share a sort value, so newest-first keeps paging stable.
      .orderBy(
        ...(query.sort === "created"
          ? [direction(sortColumn)]
          : [direction(sortColumn), desc(customShellAdminAuditLogs.createdAt)])
      )
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    database
      .select({ total: count() })
      .from(customShellAdminAuditLogs)
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, customShellAdminAuditLogs.actorUserId)
      )
      .where(where),
    listAuditFilterOptions(database),
  ])

  const entries = await toAuditLogRows(rows, database)

  return { entries, total: totals?.total ?? 0, options }
}

/**
 * The entries about one record, newest first — what an account's own page
 * shows. The viewer at `/admin/audit` stays the whole feed; this only ever
 * answers "what have admins done to this person", so it takes no filters.
 */
export async function listAuditLogsForRecord(
  recordId: string,
  limit: number,
  database: CustomShellDb = db
) {
  const rows = await database
    .select({
      entry: customShellAdminAuditLogs,
      actorName: customShellUsers.name,
      actorEmail: customShellUsers.email,
    })
    .from(customShellAdminAuditLogs)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellAdminAuditLogs.actorUserId)
    )
    // Record ids are a jsonb array, so membership is a lookup over its
    // elements rather than a column comparison.
    .where(
      sql`exists (
        select 1
        from jsonb_array_elements_text(${customShellAdminAuditLogs.recordIds}) as audit_record(id)
        where audit_record.id = ${recordId}
      )`
    )
    .orderBy(desc(customShellAdminAuditLogs.createdAt))
    .limit(limit)

  return toAuditLogRows(rows, database)
}

type AuditQueryRow = {
  entry: typeof customShellAdminAuditLogs.$inferSelect
  actorName: string | null
  actorEmail: string | null
}

/** Turns raw entries into rows that name what their ids point at. */
async function toAuditLogRows(
  rows: AuditQueryRow[],
  database: CustomShellDb
): Promise<AuditLogRow[]> {
  const named = await nameRecords(rows, database)

  return rows.map((row) => {
    const recordIds = Array.isArray(row.entry.recordIds)
      ? row.entry.recordIds
      : []
    const records = recordIds.map((id) => ({
      id,
      name: named.names.get(id) ?? null,
    }))

    return {
      id: row.entry.id,
      action: row.entry.action,
      resource: row.entry.resource,
      detail: row.entry.detail,
      createdAt: row.entry.createdAt.toISOString(),
      actorId: row.entry.actorUserId,
      actorName: row.actorName,
      actorEmail: row.actorEmail,
      // `records` carries every id with the name it resolves to, so the raw
      // id list would only be the same data twice.
      records,
      changedFields: readChangedFields(
        row.entry.action,
        row.entry.resource,
        row.entry.detail,
        recordIds.map((id) => named.slugs.get(id))
      ),
    }
  })
}

/**
 * Looks up what the ids on this page of entries point at, so a row can say
 * "changed Tyler Pham's role" instead of "changed a role". One extra query per
 * kind of record, for the page's ids only.
 */
async function nameRecords(
  rows: { entry: { resource: string; recordIds: string[] | null } }[],
  database: CustomShellDb
) {
  const userIds = new Set<string>()
  const planIds = new Set<string>()

  for (const row of rows) {
    const target = row.entry.resource === "plan" ? planIds : userIds
    for (const id of row.entry.recordIds ?? []) target.add(id)
  }

  const [users, plans] = await Promise.all([
    userIds.size
      ? database
          .select({ id: customShellUsers.id, name: customShellUsers.name })
          .from(customShellUsers)
          .where(inArray(customShellUsers.id, [...userIds]))
      : [],
    planIds.size
      ? database
          .select({
            id: customShellPlans.id,
            name: customShellPlans.name,
            slug: customShellPlans.slug,
          })
          .from(customShellPlans)
          .where(inArray(customShellPlans.id, [...planIds]))
      : [],
  ])

  const names = new Map<string, string>()
  const slugs = new Map<string, string>()
  for (const user of users) names.set(user.id, user.name)
  for (const plan of plans) {
    names.set(plan.id, plan.name)
    slugs.set(plan.id, plan.slug)
  }

  return { names, slugs }
}

/**
 * Plan edits used to save the plan's slug here and now save the list of fields
 * that changed. Both are plain text, so the slug we just read back is what
 * tells them apart — an entry repeating the plan's own slug is an old one and
 * has nothing to say about what changed.
 */
function readChangedFields(
  action: string,
  resource: string,
  detail: string | null,
  slugs: (string | undefined)[]
) {
  if (action !== "update" || resource !== "plan" || !detail) return null
  if (slugs.includes(detail)) return null

  const fields = detail
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean)

  return fields.length ? fields : null
}

/**
 * The filter dropdowns list what the trail actually holds rather than a
 * hardcoded list, so an action added later shows up on its own and an action
 * that was never used does not offer an empty filter.
 *
 * One query, not three. It returns each distinct action/resource/admin
 * combination that was actually recorded — a handful of rows in practice, since
 * an admin only ever performs a few kinds of change — and the three lists are
 * split out here.
 */
async function listAuditFilterOptions(
  database: CustomShellDb
): Promise<AuditFilterOptions> {
  const rows = await database
    .selectDistinct({
      action: customShellAdminAuditLogs.action,
      resource: customShellAdminAuditLogs.resource,
      actorId: customShellAdminAuditLogs.actorUserId,
      actorName: customShellUsers.name,
    })
    .from(customShellAdminAuditLogs)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellAdminAuditLogs.actorUserId)
    )

  const actions = new Set<string>()
  const resources = new Set<string>()
  const actors = new Map<string, string>()

  for (const row of rows) {
    actions.add(row.action)
    resources.add(row.resource)
    // A deleted admin leaves the id blank; there is nobody left to filter by.
    if (row.actorId && row.actorName) {
      actors.set(row.actorId, row.actorName)
    }
  }

  return {
    actions: [...actions].sort(),
    resources: [...resources].sort(),
    actors: [...actors]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
