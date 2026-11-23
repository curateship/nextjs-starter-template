import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { pomodoroBlocks } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"

/**
 * Blocks in the admin (admin task 06, part 9). Read-only on purpose: a block
 * is a private choice between two members, so an admin can see it and never
 * undo it. Nothing here is reachable by a member. See
 * `workspace/docs/admin-members.md`.
 */

type Page = { page: number; pageSize: number }

const blocker = alias(users, "blocker")
const blocked = alias(users, "blocked")

/** Every block, newest first: who blocked whom and when. */
export async function listAdminBlocks(query: Page & { search: string; user?: string }) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(blocker.name, pattern),
      ilike(blocker.email, pattern),
      ilike(blocked.name, pattern),
      ilike(blocked.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.user)
    filters.push(
      sql`(${pomodoroBlocks.blockerUserId} = ${query.user} or ${pomodoroBlocks.blockedUserId} = ${query.user})`
    )
  const where = and(...filters)
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroBlocks.id,
        blockerId: pomodoroBlocks.blockerUserId,
        blockerName: blocker.name,
        blockerEmail: blocker.email,
        blockedId: pomodoroBlocks.blockedUserId,
        blockedName: blocked.name,
        blockedEmail: blocked.email,
        createdAt: pomodoroBlocks.createdAt,
      })
      .from(pomodoroBlocks)
      .innerJoin(blocker, eq(blocker.id, pomodoroBlocks.blockerUserId))
      .innerJoin(blocked, eq(blocked.id, pomodoroBlocks.blockedUserId))
      .where(where)
      .orderBy(desc(pomodoroBlocks.createdAt), asc(pomodoroBlocks.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroBlocks)
      .innerJoin(blocker, eq(blocker.id, pomodoroBlocks.blockerUserId))
      .innerJoin(blocked, eq(blocked.id, pomodoroBlocks.blockedUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminBlockRow = Awaited<ReturnType<typeof listAdminBlocks>>["rows"][number]

/**
 * The accounts blocked the most, with how many people blocked each, biggest
 * first. Search and `user` narrow to the blocked account.
 */
export async function listMostBlocked(query: Page & { search: string; user?: string }) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const match = or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    if (match) filters.push(match)
  }
  if (query.user) filters.push(eq(pomodoroBlocks.blockedUserId, query.user))
  const where = and(...filters)
  const blocks = sql<number>`count(*)::int`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroBlocks.blockedUserId,
        name: users.name,
        email: users.email,
        blocks,
        lastBlockedAt: sql<Date>`max(${pomodoroBlocks.createdAt})`,
      })
      .from(pomodoroBlocks)
      .innerJoin(users, eq(users.id, pomodoroBlocks.blockedUserId))
      .where(where)
      .groupBy(pomodoroBlocks.blockedUserId, users.name, users.email)
      .orderBy(desc(blocks), asc(pomodoroBlocks.blockedUserId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: sql<number>`count(distinct ${pomodoroBlocks.blockedUserId})::int` })
      .from(pomodoroBlocks)
      .innerJoin(users, eq(users.id, pomodoroBlocks.blockedUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminMostBlockedRow = Awaited<ReturnType<typeof listMostBlocked>>["rows"][number]
