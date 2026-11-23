import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import { pomodoroAchievements, pomodoroAuditLogs, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type { AchievementSortColumn } from "@/lib/pomodoro/admin-lists"

/**
 * Earned badges in the admin (admin task 06, part 10): who earned which and
 * when, and Revoke. See `workspace/docs/achievements.md`.
 *
 * A revoked badge keeps its row with `revoked_at` set. The award check offers
 * every badge the counters satisfy and lets the unique index refuse the ones
 * on record, so the row staying is what stops the next finished focus handing
 * the badge straight back. Every reader of the table skips revoked rows.
 */

export async function listAdminAchievements(query: {
  search: string
  badgeId?: string
  userId?: string
  sort: AchievementSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const filters: SQL[] = [isNull(pomodoroAchievements.revokedAt)]
  if (query.badgeId) filters.push(eq(pomodoroAchievements.badgeId, query.badgeId))
  if (query.userId) filters.push(eq(pomodoroAchievements.userId, query.userId))
  const search = query.search.trim()
  if (search) {
    const match = or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    if (match) filters.push(match)
  }
  const where = and(...filters)
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    person: users.name,
    badge: pomodoroAchievements.badgeId,
    earned: pomodoroAchievements.earnedAt,
  }[query.sort]

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: pomodoroAchievements.id,
        userId: pomodoroAchievements.userId,
        name: users.name,
        email: users.email,
        badgeId: pomodoroAchievements.badgeId,
        earnedAt: pomodoroAchievements.earnedAt,
      })
      .from(pomodoroAchievements)
      .innerJoin(users, eq(users.id, pomodoroAchievements.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroAchievements.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroAchievements)
      .innerJoin(users, eq(users.id, pomodoroAchievements.userId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0 }
}

export type AdminAchievementRow = Awaited<ReturnType<typeof listAdminAchievements>>["rows"][number]

/**
 * Takes badges away. Each one is marked revoked and dropped from its owner's
 * pinned badges, in one transaction with one log row. The member is not told.
 * A badge already revoked, or gone, is reported as skipped.
 */
export async function revokeAchievements({
  ids,
  actorUserId,
  now = new Date(),
}: {
  ids: string[]
  actorUserId: string
  now?: Date
}) {
  const result = await db.transaction(async (tx) => {
    const revoked = await tx
      .update(pomodoroAchievements)
      .set({ revokedAt: now, revokedByUserId: actorUserId })
      .where(and(inArray(pomodoroAchievements.id, ids), isNull(pomodoroAchievements.revokedAt)))
      .returning({
        id: pomodoroAchievements.id,
        userId: pomodoroAchievements.userId,
        badgeId: pomodoroAchievements.badgeId,
      })
    const handles: (string | null)[] = []
    for (const row of revoked) {
      // `pinned_badges - id` removes one string from a JSON array; a badge
      // that was never pinned leaves the array as it was.
      const [profile] = await tx
        .update(pomodoroProfiles)
        .set({ pinnedBadges: sql`${pomodoroProfiles.pinnedBadges} - ${row.badgeId}::text` })
        .where(eq(pomodoroProfiles.userId, row.userId))
        .returning({ handle: pomodoroProfiles.handle })
      handles.push(profile?.handle ?? null)
    }
    const done = revoked.map((row) => row.id)
    if (done.length)
      await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "revoke", resource: "achievements", recordIds: done })
    return { changed: done, skipped: ids.filter((id) => !done.includes(id)), handles }
  })
  // The public page holds its badges for a while; it should drop one at once.
  for (const handle of new Set(result.handles)) forgetPublicProfile(handle)
  return { changed: result.changed, skipped: result.skipped }
}
