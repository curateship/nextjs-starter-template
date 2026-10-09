import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { writeNotices } from "@/server/pomodoro/notices"
import { pomodoroAuditLogs, pomodoroGroupMembers, pomodoroGroups } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import { groupDeletedMessage } from "@/lib/pomodoro/notices"
import type { GroupSortColumn } from "@/lib/pomodoro/admin-lists"

/**
 * Focus groups in the admin (admin task 06, part 11): every private group, its
 * members, and deleting it. Deleting tells everybody who was in it, owner
 * included. See `workspace/docs/admin-members.md`.
 */

const memberCount = sql<number>`(select count(*)::int from ${pomodoroGroupMembers} where ${pomodoroGroupMembers.groupId} = ${pomodoroGroups.id})`

export async function listAdminGroups(query: {
  search: string
  user?: string
  sort: GroupSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(ilike(pomodoroGroups.name, pattern), ilike(users.name, pattern), ilike(users.email, pattern))
    if (match) filters.push(match)
  }
  // Groups they own or are in.
  if (query.user) {
    const inGroup = or(
      eq(pomodoroGroups.ownerUserId, query.user),
      inArray(
        pomodoroGroups.id,
        db
          .select({ id: pomodoroGroupMembers.groupId })
          .from(pomodoroGroupMembers)
          .where(eq(pomodoroGroupMembers.userId, query.user))
      )
    )
    if (inGroup) filters.push(inGroup)
  }
  const where = and(...filters)
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    name: pomodoroGroups.name,
    owner: users.name,
    members: memberCount,
    created: pomodoroGroups.createdAt,
  }[query.sort]
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroGroups.id,
        name: pomodoroGroups.name,
        ownerId: pomodoroGroups.ownerUserId,
        ownerName: users.name,
        ownerEmail: users.email,
        memberCount,
        createdAt: pomodoroGroups.createdAt,
      })
      .from(pomodoroGroups)
      .innerJoin(users, eq(users.id, pomodoroGroups.ownerUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroGroups.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroGroups)
      .innerJoin(users, eq(users.id, pomodoroGroups.ownerUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminGroupRow = Awaited<ReturnType<typeof listAdminGroups>>["rows"][number]

/** One group and everybody in it, owner first, for the group window. */
export async function loadAdminGroup(groupId: string) {
  const [group] = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      ownerId: pomodoroGroups.ownerUserId,
      ownerName: users.name,
      createdAt: pomodoroGroups.createdAt,
    })
    .from(pomodoroGroups)
    .innerJoin(users, eq(users.id, pomodoroGroups.ownerUserId))
    .where(eq(pomodoroGroups.id, groupId))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_FOUND")
  const members = await db
    .select({
      userId: pomodoroGroupMembers.userId,
      name: users.name,
      email: users.email,
      joinedAt: pomodoroGroupMembers.joinedAt,
    })
    .from(pomodoroGroupMembers)
    .innerJoin(users, eq(users.id, pomodoroGroupMembers.userId))
    .where(eq(pomodoroGroupMembers.groupId, groupId))
    .orderBy(
      desc(sql`${pomodoroGroupMembers.userId} = ${group.ownerId}`),
      asc(pomodoroGroupMembers.joinedAt)
    )
  return { group, members }
}

export type AdminGroup = Awaited<ReturnType<typeof loadAdminGroup>>

/**
 * Deletes groups. Their memberships go by the cascade. Everybody who was in
 * a group, the owner included, is told in the bell in the same transaction,
 * without naming the admin. The notice carries no group id, because the
 * group is gone.
 */
export async function deleteAdminGroups({ ids, actorUserId }: { ids: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const groups = await tx
      .select({ id: pomodoroGroups.id, name: pomodoroGroups.name })
      .from(pomodoroGroups)
      .where(inArray(pomodoroGroups.id, ids))
      .for("update")
    const found = groups.map((group) => group.id)
    if (!found.length) return { deleted: [] as string[], skipped: ids }
    const members = await tx
      .select({ groupId: pomodoroGroupMembers.groupId, userId: pomodoroGroupMembers.userId })
      .from(pomodoroGroupMembers)
      .where(inArray(pomodoroGroupMembers.groupId, found))
    const names = new Map(groups.map((group) => [group.id, group.name]))
    await writeNotices(
      tx,
      members.map((member) => ({
        recipientUserId: member.userId,
        kind: "group_deleted" as const,
        message: groupDeletedMessage(names.get(member.groupId) ?? "you were in"),
        href: "/leaderboard",
      }))
    )
    await tx.delete(pomodoroGroups).where(inArray(pomodoroGroups.id, found))
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "delete", resource: "groups", recordIds: found })
    return { deleted: found, skipped: ids.filter((id) => !found.includes(id)) }
  })
}
