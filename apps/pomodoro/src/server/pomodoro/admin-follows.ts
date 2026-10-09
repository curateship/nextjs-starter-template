import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { forgetFollowingFeed } from "@/server/pomodoro/following"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import { pomodoroAuditLogs, pomodoroCheers, pomodoroFollows, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type { FollowSortColumn } from "@/lib/pomodoro/admin-lists"

/**
 * Follows and cheers in the admin (admin task 06, part 8): who follows whom,
 * who cheered whom, and deleting either. Nobody is told about a delete, the
 * same as an unfollow. See `workspace/docs/admin-members.md`.
 */

type Page = { page: number; pageSize: number }

/**
 * Drops the held public pages of the people who just lost a follower, because
 * the follower count is part of the held page. A member's own unfollow does
 * the same, so an admin delete shows the new number as quickly.
 */
export async function forgetFollowedPages(followedUserIds: string[]) {
  if (!followedUserIds.length) return
  const rows = await db
    .select({ handle: pomodoroProfiles.handle })
    .from(pomodoroProfiles)
    .where(inArray(pomodoroProfiles.userId, [...new Set(followedUserIds)]))
  for (const row of rows) forgetPublicProfile(row.handle)
}

/** The two people on a row: the one acting and the one it was done to. */
const fromUser = alias(users, "from_user")
const toUser = alias(users, "to_user")

/** Search matches either person's name or email; `user` keeps rows they are on. */
function personFilters(
  query: { search: string; user?: string },
  fromId: SQL,
  toId: SQL
) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(fromUser.name, pattern),
      ilike(fromUser.email, pattern),
      ilike(toUser.name, pattern),
      ilike(toUser.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.user) filters.push(sql`(${fromId} = ${query.user} or ${toId} = ${query.user})`)
  return and(...filters)
}

/**
 * Every follow. "most" orders by how many accounts the follower follows,
 * biggest first, which is how a follow-spammer shows up at the top.
 */
export async function listAdminFollows(
  query: Page & { search: string; user?: string; sort: FollowSortColumn; direction: "asc" | "desc" }
) {
  const where = personFilters(query, sql`${pomodoroFollows.followerUserId}`, sql`${pomodoroFollows.followedUserId}`)
  // Counted over every follow the follower has, not only the ones this search
  // matched, so the figure is the same whatever the filter.
  const followerFollows = sql<number>`(select count(*)::int from ${pomodoroFollows} as f2 where f2.follower_user_id = ${pomodoroFollows.followerUserId})`
  const direction = query.direction === "asc" ? asc : desc
  const order =
    query.sort === "most"
      ? [direction(followerFollows), desc(pomodoroFollows.createdAt), asc(pomodoroFollows.id)]
      : [direction(pomodoroFollows.createdAt), asc(pomodoroFollows.id)]
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroFollows.id,
        followerId: pomodoroFollows.followerUserId,
        followerName: fromUser.name,
        followerEmail: fromUser.email,
        followedId: pomodoroFollows.followedUserId,
        followedName: toUser.name,
        followedEmail: toUser.email,
        followerFollows,
        createdAt: pomodoroFollows.createdAt,
      })
      .from(pomodoroFollows)
      .innerJoin(fromUser, eq(fromUser.id, pomodoroFollows.followerUserId))
      .innerJoin(toUser, eq(toUser.id, pomodoroFollows.followedUserId))
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroFollows)
      .innerJoin(fromUser, eq(fromUser.id, pomodoroFollows.followerUserId))
      .innerJoin(toUser, eq(toUser.id, pomodoroFollows.followedUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminFollowRow = Awaited<ReturnType<typeof listAdminFollows>>["rows"][number]

/** Every cheer, newest first unless asked otherwise. */
export async function listAdminCheers(
  query: Page & { search: string; user?: string; direction: "asc" | "desc" }
) {
  const where = personFilters(query, sql`${pomodoroCheers.fromUserId}`, sql`${pomodoroCheers.toUserId}`)
  const direction = query.direction === "asc" ? asc : desc
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroCheers.id,
        fromId: pomodoroCheers.fromUserId,
        fromName: fromUser.name,
        fromEmail: fromUser.email,
        toId: pomodoroCheers.toUserId,
        toName: toUser.name,
        toEmail: toUser.email,
        cheerId: pomodoroCheers.cheerId,
        createdAt: pomodoroCheers.createdAt,
      })
      .from(pomodoroCheers)
      .innerJoin(fromUser, eq(fromUser.id, pomodoroCheers.fromUserId))
      .innerJoin(toUser, eq(toUser.id, pomodoroCheers.toUserId))
      .where(where)
      .orderBy(direction(pomodoroCheers.createdAt), asc(pomodoroCheers.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroCheers)
      .innerJoin(fromUser, eq(fromUser.id, pomodoroCheers.fromUserId))
      .innerJoin(toUser, eq(toUser.id, pomodoroCheers.toUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminCheerRow = Awaited<ReturnType<typeof listAdminCheers>>["rows"][number]

/**
 * Deletes follows. Nobody is told, the same as an unfollow. Each follower's
 * held feed is dropped afterwards, so the person they stopped following
 * leaves it on the next load.
 */
export async function deleteAdminFollows({ ids, actorUserId }: { ids: string[]; actorUserId: string }) {
  const gone = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(pomodoroFollows)
      .where(inArray(pomodoroFollows.id, ids))
      .returning({
        id: pomodoroFollows.id,
        followerUserId: pomodoroFollows.followerUserId,
        followedUserId: pomodoroFollows.followedUserId,
      })
    if (rows.length)
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: "delete",
        resource: "follows",
        recordIds: rows.map((row) => row.id),
      })
    return rows
  })
  for (const follower of new Set(gone.map((row) => row.followerUserId))) forgetFollowingFeed(follower)
  await forgetFollowedPages(gone.map((row) => row.followedUserId))
  const deleted = gone.map((row) => row.id)
  return { deleted, skipped: ids.filter((id) => !deleted.includes(id)) }
}

/**
 * Deletes cheers. The bell notice the cheer already sent stays: it holds no
 * link to the cheer row, and nobody is told about the delete.
 */
export async function deleteAdminCheers({ ids, actorUserId }: { ids: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(pomodoroCheers)
      .where(inArray(pomodoroCheers.id, ids))
      .returning({ id: pomodoroCheers.id })
    const deleted = rows.map((row) => row.id)
    if (deleted.length)
      await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "delete", resource: "cheers", recordIds: deleted })
    return { deleted, skipped: ids.filter((id) => !deleted.includes(id)) }
  })
}
