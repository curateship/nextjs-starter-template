import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { pomodoroAuditLogs, pomodoroTags, pomodoroTaskTags } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type { TagSortColumn } from "@/lib/pomodoro/admin-lists"

/**
 * Member task tags in the admin (admin task 06, part 4): every tag a member
 * made for their tasks, and deleting one. These are the labels on tasks, not
 * the theme and sound tags on the catalogue. See `workspace/docs/tasks.md`.
 */

export type AdminTagRow = {
  id: string
  name: string
  userId: string
  ownerName: string
  ownerEmail: string
  /** How many of the owner's tasks carry it. */
  taskCount: number
  createdAt: Date
}

export async function listAdminTags(query: {
  search: string
  user?: string
  sort: TagSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}): Promise<{ rows: AdminTagRow[]; total: number }> {
  const filters: SQL[] = []
  if (query.user) filters.push(eq(pomodoroTags.userId, query.user))
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(ilike(pomodoroTags.name, pattern), ilike(users.name, pattern), ilike(users.email, pattern))
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const taskCount = sql<number>`(
    select count(*) from ${pomodoroTaskTags}
    where ${pomodoroTaskTags.tagId} = ${pomodoroTags.id})::int`
  const order = query.direction === "asc" ? asc : desc
  const sortColumn = {
    name: sql`lower(${pomodoroTags.name})`,
    owner: users.name,
    tasks: taskCount,
    created: pomodoroTags.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroTags.id,
        name: pomodoroTags.name,
        userId: pomodoroTags.userId,
        ownerName: users.name,
        ownerEmail: users.email,
        taskCount,
        createdAt: pomodoroTags.createdAt,
      })
      .from(pomodoroTags)
      .innerJoin(users, eq(users.id, pomodoroTags.userId))
      .where(where)
      .orderBy(order(sortColumn), asc(pomodoroTags.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroTags)
      .innerJoin(users, eq(users.id, pomodoroTags.userId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

/**
 * Deletes tags, one id or many. The tasks carrying them lose the label by the
 * cascade on `pomodoro_task_tags`, and the tasks themselves stay. One log row
 * names every tag that went.
 */
export async function deleteAdminTags({ tagIds, actorUserId }: { tagIds: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(pomodoroTags)
      .where(inArray(pomodoroTags.id, tagIds))
      .returning({ id: pomodoroTags.id })
    const deleted = removed.map((row) => row.id)
    if (deleted.length)
      await tx
        .insert(pomodoroAuditLogs)
        .values({ actorUserId, action: "delete", resource: "task_tags", recordIds: deleted })
    const gone = new Set(deleted)
    return { deleted, skipped: tagIds.filter((id) => !gone.has(id)) }
  })
}
