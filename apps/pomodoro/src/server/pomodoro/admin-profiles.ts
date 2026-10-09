import { and, asc, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { writeNotices } from "@/server/pomodoro/notices"
import {
  forgetPublicProfile,
  forgetUsersPages,
  isDuplicateHandle,
} from "@/server/pomodoro/public-profile"
import { pomodoroAuditLogs, pomodoroFollows, pomodoroProfiles } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type { PROFILE_VISIBILITY_FILTERS, ProfileSortColumn } from "@/lib/pomodoro/admin-lists"
import { profileEditedMessage } from "@/lib/pomodoro/notices"
import { isHandleAvailableShape, isHandleShape } from "@/lib/pomodoro/public-profile"

/**
 * Public profiles in the admin (admin task 06, part 2): every profile with a
 * handle, and the window that fixes its handle, display name or bio. Hiding
 * one is `hideProfilesByAdmin` in `admin-members.ts`; showing it again is
 * Lift on the Bans page. See `workspace/docs/admin-members.md`.
 */

const followers = sql<number>`(select count(*)::int from ${pomodoroFollows} where ${pomodoroFollows.followedUserId} = ${pomodoroProfiles.userId})`

export async function listAdminProfiles(query: {
  search: string
  visibility: (typeof PROFILE_VISIBILITY_FILTERS)[number]
  sort: ProfileSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const filters: SQL[] = [isNotNull(pomodoroProfiles.handle)]
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      ilike(pomodoroProfiles.handle, pattern),
      ilike(pomodoroProfiles.publicDisplayName, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.visibility === "public")
    filters.push(eq(pomodoroProfiles.profilePublic, true), isNull(pomodoroProfiles.hiddenAt))
  if (query.visibility === "private") filters.push(eq(pomodoroProfiles.profilePublic, false))
  if (query.visibility === "hidden") filters.push(isNotNull(pomodoroProfiles.hiddenAt))
  const where = and(...filters)

  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    name: users.name,
    handle: pomodoroProfiles.handle,
    followers,
    updated: pomodoroProfiles.updatedAt,
  }[query.sort]

  const [rows, [total]] = await Promise.all([
    db
      .select({
        userId: pomodoroProfiles.userId,
        name: users.name,
        email: users.email,
        handle: sql<string>`${pomodoroProfiles.handle}`,
        publicDisplayName: pomodoroProfiles.publicDisplayName,
        profilePublic: pomodoroProfiles.profilePublic,
        hiddenAt: pomodoroProfiles.hiddenAt,
        leaderboardOptIn: pomodoroProfiles.leaderboardOptIn,
        leaderboardHiddenAt: pomodoroProfiles.leaderboardHiddenAt,
        followers,
        updatedAt: pomodoroProfiles.updatedAt,
      })
      .from(pomodoroProfiles)
      .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroProfiles.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroProfiles)
      .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
      .where(where),
  ])
  return { rows, total: total?.total ?? 0 }
}

export type AdminProfileRow = Awaited<ReturnType<typeof listAdminProfiles>>["rows"][number]

/** One profile, for the window. */
export async function loadAdminProfile(userId: string) {
  const [row] = await db
    .select({
      userId: pomodoroProfiles.userId,
      name: users.name,
      handle: pomodoroProfiles.handle,
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      bio: pomodoroProfiles.bio,
      profilePublic: pomodoroProfiles.profilePublic,
      hiddenAt: pomodoroProfiles.hiddenAt,
    })
    .from(pomodoroProfiles)
    .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
    .where(eq(pomodoroProfiles.userId, userId))
    .limit(1)
  if (!row) throw new Error("PROFILE_NOT_FOUND")
  return row
}

export type AdminProfile = Awaited<ReturnType<typeof loadAdminProfile>>

/** What the owner's notice calls each field. */
const FIELD_NAMES = { handle: "address", publicDisplayName: "display name", bio: "bio" } as const

/**
 * Saves an admin's fix to a profile's handle, display name or bio.
 *
 * The handle passes the same checks as the owner's own save: its shape, the
 * reserved list, and the unique index for one already taken. Only fields that
 * really changed are written, logged and named in the owner's notice, which
 * never says which admin. A save that changes nothing writes nothing.
 */
export async function saveAdminProfile({
  userId,
  handle,
  publicDisplayName,
  bio,
  actorUserId,
}: {
  userId: string
  handle: string
  publicDisplayName: string | null
  bio: string | null
  actorUserId: string
}) {
  if (!isHandleShape(handle)) throw new Error("INVALID_HANDLE")
  if (!isHandleAvailableShape(handle)) throw new Error("RESERVED_HANDLE")

  const before = await loadAdminProfile(userId)
  const after = { handle, publicDisplayName: publicDisplayName || null, bio: bio || null }
  const changed = (Object.keys(after) as (keyof typeof after)[]).filter((key) => before[key] !== after[key])
  if (!changed.length) return { changed: [] as string[] }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(pomodoroProfiles)
        .set({ ...after, updatedAt: new Date() })
        .where(eq(pomodoroProfiles.userId, userId))
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: "edit",
        resource: "pomodoro_profile",
        recordIds: [userId],
      })
      await writeNotices(tx, [
        {
          recipientUserId: userId,
          kind: "profile_edited",
          message: profileEditedMessage(changed.map((key) => FIELD_NAMES[key])),
          href: "/settings?tab=public",
        },
      ])
    })
  } catch (error) {
    if (isDuplicateHandle(error)) throw new Error("HANDLE_TAKEN")
    throw error
  }

  // The old address stops answering at once, and the new one reads fresh.
  forgetPublicProfile(before.handle)
  forgetPublicProfile(handle)
  forgetUsersPages()
  return { changed: changed.map((key) => FIELD_NAMES[key]) }
}
