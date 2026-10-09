import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db } from "@/server/db"
import { dropMessageNotices, writeNotices } from "@/server/pomodoro/notices"
import { runningSuspension } from "@/server/pomodoro/room-access"
import {
  pomodoroAuditLogs,
  pomodoroProfiles,
  pomodoroSuspensions,
  roomBans,
  roomMessages,
  roomReports,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type {
  CHAT_STATUS_FILTERS,
  ChatRoomSortColumn,
} from "@/lib/pomodoro/admin-lists"
import { PROFILE_RESTORED_MESSAGE } from "@/lib/pomodoro/notices"

/**
 * The Chat dashboard and the bans page (admin task 05): every room's chat,
 * the held lines, a search across all of it, one line to every live room,
 * and the lists of room bans, hidden profiles and suspensions with Lift. See
 * `workspace/docs/admin-safety-tools.md`.
 *
 * Every change writes one `pomodoro_audit_logs` row in the same transaction,
 * and hands back the rooms whose open screens the caller then nudges.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function logChatAct(tx: Transaction, actorUserId: string, action: string, resource: string, recordIds: string[]) {
  if (!recordIds.length) return
  await tx.insert(pomodoroAuditLogs).values({ actorUserId, action, resource, recordIds })
}

const authorName = sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`

// ---------------------------------------------------------------------------
// Rooms with chat
// ---------------------------------------------------------------------------

export async function listChatRooms(query: {
  search: string
  status: (typeof CHAT_STATUS_FILTERS)[number]
  sort: ChatRoomSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const stats = db
    .select({
      roomId: roomMessages.roomId,
      messages: sql<number>`count(*)::int`.as("messages"),
      held: sql<number>`count(*) filter (where ${roomMessages.heldAt} is not null and ${roomMessages.deletedAt} is null)::int`.as("held"),
      lastAt: sql<Date>`max(${roomMessages.createdAt})`.as("last_at"),
    })
    .from(roomMessages)
    .where(eq(roomMessages.broadcast, false))
    .groupBy(roomMessages.roomId)
    .as("stats")
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const match = or(ilike(rooms.name, `%${search}%`), ilike(users.name, `%${search}%`))
    if (match) filters.push(match)
  }
  const closed = sql`(${rooms.closedAt} is not null or ${rooms.phase} = 'closed')`
  if (query.status === "open") filters.push(sql`not ${closed}`)
  if (query.status === "closed") filters.push(closed)
  const where = filters.length ? and(...filters) : undefined
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = { last: stats.lastAt, messages: stats.messages, name: rooms.name }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: rooms.id,
        name: rooms.name,
        slug: rooms.slug,
        hostUserId: rooms.hostUserId,
        hostName: users.name,
        messages: stats.messages,
        held: stats.held,
        lastAt: stats.lastAt,
        closed: sql<boolean>`${closed}`,
      })
      .from(stats)
      .innerJoin(rooms, eq(rooms.id, stats.roomId))
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(rooms.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(stats)
      .innerJoin(rooms, eq(rooms.id, stats.roomId))
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminChatRoomRow = Awaited<ReturnType<typeof listChatRooms>>["rows"][number]

/** One message as the admin sees it: removed and held lines included, with their words. */
const messageColumns = {
  id: roomMessages.id,
  roomId: roomMessages.roomId,
  userId: roomMessages.userId,
  authorName,
  authorEmail: users.email,
  body: roomMessages.body,
  createdAt: roomMessages.createdAt,
  deletedAt: roomMessages.deletedAt,
  removedBy: roomMessages.removedBy,
  heldAt: roomMessages.heldAt,
  broadcast: roomMessages.broadcast,
}

/** The newest five hundred lines of one room, oldest at the top. */
const ROOM_CHAT_LIMIT = 500

export async function loadRoomChat(roomId: string) {
  const [room] = await db
    .select({
      id: rooms.id,
      name: rooms.name,
      slug: rooms.slug,
      hostUserId: rooms.hostUserId,
      hostName: users.name,
      closed: sql<boolean>`(${rooms.closedAt} is not null or ${rooms.phase} = 'closed')`,
    })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.hostUserId))
    .where(eq(rooms.id, roomId))
    .limit(1)
  if (!room) throw new Error("ROOM_NOT_FOUND")
  const messages = await db
    .select(messageColumns)
    .from(roomMessages)
    .innerJoin(users, eq(users.id, roomMessages.userId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .where(eq(roomMessages.roomId, roomId))
    .orderBy(desc(roomMessages.createdAt))
    .limit(ROOM_CHAT_LIMIT)
  return { room, messages: messages.reverse(), capped: messages.length === ROOM_CHAT_LIMIT }
}

export type AdminRoomChat = Awaited<ReturnType<typeof loadRoomChat>>
export type AdminChatMessage = AdminRoomChat["messages"][number]

/**
 * Searches every room's lines by word or by person (name or email), or lists
 * the held lines waiting for an admin. Newest first.
 */
export async function listChatMessages(query: { search: string; held: boolean; page: number; pageSize: number }) {
  const filters: SQL[] = [eq(roomMessages.broadcast, false)]
  if (query.held) {
    filters.push(isNotNull(roomMessages.heldAt), isNull(roomMessages.deletedAt))
  }
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(ilike(roomMessages.body, pattern), ilike(users.name, pattern), ilike(users.email, pattern), ilike(pomodoroProfiles.publicDisplayName, pattern))
    if (match) filters.push(match)
  }
  const where = and(...filters)
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({ ...messageColumns, roomName: rooms.name })
      .from(roomMessages)
      .innerJoin(users, eq(users.id, roomMessages.userId))
      .innerJoin(rooms, eq(rooms.id, roomMessages.roomId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(roomMessages.createdAt), asc(roomMessages.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(roomMessages)
      .innerJoin(users, eq(users.id, roomMessages.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

/** How many lines wait for an admin, for the Held tab's count. */
export async function countHeldMessages() {
  const [row] = await db
    .select({ total: count() })
    .from(roomMessages)
    .where(and(isNotNull(roomMessages.heldAt), isNull(roomMessages.deletedAt)))
  return row?.total ?? 0
}

export type AdminChatSearchRow = Awaited<ReturnType<typeof listChatMessages>>["rows"][number]

/**
 * Removes lines the way a host's Delete does: the room shows "Message
 * removed" in their place, and the words stay in the table for reports. A
 * held line deleted here simply never appears. Already removed is skipped.
 */
export async function deleteChatMessages({ messageIds, actorUserId, now = new Date() }: { messageIds: string[]; actorUserId: string; now?: Date }) {
  return db.transaction(async (tx) => {
    const removed = await tx
      .update(roomMessages)
      .set({ deletedAt: now, removedBy: "admin" })
      .where(and(inArray(roomMessages.id, messageIds), isNull(roomMessages.deletedAt)))
      .returning({ id: roomMessages.id, roomId: roomMessages.roomId })
    // A mention or reaction notice would quote a line the room no longer shows.
    for (const message of removed) await dropMessageNotices(tx, message.id)
    const ids = removed.map((row) => row.id)
    await logChatAct(tx, actorUserId, "delete_messages", "room_messages", ids)
    return {
      deleted: ids,
      skipped: messageIds.filter((id) => !ids.includes(id)),
      roomIds: [...new Set(removed.map((row) => row.roomId))],
    }
  })
}

/**
 * Lets held lines through: the room shows them where they were written. The
 * people named in one are not told afterwards; it arrives as a plain line.
 */
export async function releaseHeldMessages({ messageIds, actorUserId }: { messageIds: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const released = await tx
      .update(roomMessages)
      .set({ heldAt: null })
      .where(and(inArray(roomMessages.id, messageIds), isNotNull(roomMessages.heldAt), isNull(roomMessages.deletedAt)))
      .returning({ id: roomMessages.id, roomId: roomMessages.roomId })
    const ids = released.map((row) => row.id)
    await logChatAct(tx, actorUserId, "release_messages", "room_messages", ids)
    return {
      changed: ids,
      skipped: messageIds.filter((id) => !ids.includes(id)),
      roomIds: [...new Set(released.map((row) => row.roomId))],
    }
  })
}

// ---------------------------------------------------------------------------
// One line to every live room
// ---------------------------------------------------------------------------

/** A room people are in right now: open, not booked for later, not ended. */
const liveRoom = and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('closed', 'scheduled')`)

export async function countLiveRooms() {
  const [row] = await db.select({ total: count() }).from(rooms).where(liveRoom)
  return row?.total ?? 0
}

/** Every live room, so a pause switch can tell their open screens. */
export async function liveRoomIds() {
  return (await db.select({ id: rooms.id }).from(rooms).where(liveRoom)).map((row) => row.id)
}

/**
 * Pins one line at the top of every live room's chat, signed by the team.
 * Each room gets its own row, so deleting it from one room's window takes it
 * out of that room only. A room that ends takes its line with it.
 */
export async function messageLiveRooms({ body, actorUserId }: { body: string; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const live = await tx.select({ id: rooms.id }).from(rooms).where(liveRoom)
    if (!live.length) return { roomIds: [] as string[] }
    const inserted = await tx
      .insert(roomMessages)
      .values(live.map((room) => ({ roomId: room.id, userId: actorUserId, body, broadcast: true })))
      .returning({ id: roomMessages.id })
    await logChatAct(tx, actorUserId, "message_live_rooms", "room_messages", inserted.map((row) => row.id))
    return { roomIds: live.map((room) => room.id) }
  })
}

// ---------------------------------------------------------------------------
// Bans, hidden profiles and suspensions
// ---------------------------------------------------------------------------

const bannedBy = alias(users, "banned_by")

export async function listRoomBans(query: { search: string; page: number; pageSize: number }) {
  const search = query.search.trim()
  const where = search
    ? or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`), ilike(rooms.name, `%${search}%`))
    : undefined
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: roomBans.id,
        userId: roomBans.userId,
        name: users.name,
        email: users.email,
        roomName: rooms.name,
        bannedByName: bannedBy.name,
        createdAt: roomBans.createdAt,
      })
      .from(roomBans)
      .innerJoin(users, eq(users.id, roomBans.userId))
      .innerJoin(rooms, eq(rooms.id, roomBans.roomId))
      .innerJoin(bannedBy, eq(bannedBy.id, roomBans.bannedByUserId))
      .where(where)
      .orderBy(desc(roomBans.createdAt), asc(roomBans.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(roomBans)
      .innerJoin(users, eq(users.id, roomBans.userId))
      .innerJoin(rooms, eq(rooms.id, roomBans.roomId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminRoomBanRow = Awaited<ReturnType<typeof listRoomBans>>["rows"][number]

/** Lifts room bans: the person can join that room again. Nobody is told. */
export async function liftRoomBans({ banIds, actorUserId }: { banIds: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const lifted = await tx.delete(roomBans).where(inArray(roomBans.id, banIds)).returning({ id: roomBans.id })
    const ids = lifted.map((row) => row.id)
    await logChatAct(tx, actorUserId, "lift_room_bans", "room_bans", ids)
    return { changed: ids, skipped: banIds.filter((id) => !ids.includes(id)) }
  })
}

export async function listHiddenProfiles(query: { search: string; page: number; pageSize: number }) {
  const filters: SQL[] = [isNotNull(pomodoroProfiles.hiddenAt)]
  const search = query.search.trim()
  if (search) {
    const match = or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`), ilike(pomodoroProfiles.handle, `%${search}%`))
    if (match) filters.push(match)
  }
  const where = and(...filters)
  // The latest profile report about them, which is what hid it.
  const lastReport = sql<string | null>`(
    select ${roomReports.reason} from ${roomReports}
    where ${roomReports.profileUserId} = ${pomodoroProfiles.userId} and ${roomReports.kind} = 'profile'
    order by ${roomReports.createdAt} desc limit 1)`
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroProfiles.userId,
        name: users.name,
        email: users.email,
        handle: pomodoroProfiles.handle,
        hiddenAt: pomodoroProfiles.hiddenAt,
        reportReason: lastReport,
      })
      .from(pomodoroProfiles)
      .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
      .where(where)
      .orderBy(desc(pomodoroProfiles.hiddenAt), asc(pomodoroProfiles.userId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(pomodoroProfiles).innerJoin(users, eq(users.id, pomodoroProfiles.userId)).where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminHiddenProfileRow = Awaited<ReturnType<typeof listHiddenProfiles>>["rows"][number]

/**
 * Shows hidden profiles again, and tells each owner in the bell the way
 * hiding did. Handed back the handles so the caller drops the held pages.
 */
export async function showHiddenProfiles({ userIds, actorUserId }: { userIds: string[]; actorUserId: string }) {
  return db.transaction(async (tx) => {
    const shown = await tx
      .update(pomodoroProfiles)
      .set({ hiddenAt: null, updatedAt: new Date() })
      .where(and(inArray(pomodoroProfiles.userId, userIds), isNotNull(pomodoroProfiles.hiddenAt)))
      .returning({ userId: pomodoroProfiles.userId, handle: pomodoroProfiles.handle })
    const ids = shown.map((row) => row.userId)
    await logChatAct(tx, actorUserId, "unhide", "pomodoro_profile", ids)
    await writeNotices(tx, ids.map((userId) => ({
      recipientUserId: userId,
      kind: "profile_restored" as const,
      message: PROFILE_RESTORED_MESSAGE,
      href: "/settings?tab=public",
    })))
    return { changed: ids, skipped: userIds.filter((id) => !ids.includes(id)), handles: shown.map((row) => row.handle) }
  })
}

const suspendedBy = alias(users, "suspended_by")

export async function listSuspensions(query: { search: string; page: number; pageSize: number; now?: Date }) {
  const filters: SQL[] = []
  const running = runningSuspension(query.now ?? new Date())
  if (running) filters.push(running)
  const search = query.search.trim()
  if (search) {
    const match = or(ilike(users.name, `%${search}%`), ilike(users.email, `%${search}%`))
    if (match) filters.push(match)
  }
  const where = and(...filters)
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroSuspensions.id,
        userId: pomodoroSuspensions.userId,
        name: users.name,
        email: users.email,
        reason: pomodoroSuspensions.reason,
        endsAt: pomodoroSuspensions.endsAt,
        createdAt: pomodoroSuspensions.createdAt,
        suspendedByName: suspendedBy.name,
      })
      .from(pomodoroSuspensions)
      .innerJoin(users, eq(users.id, pomodoroSuspensions.userId))
      .leftJoin(suspendedBy, eq(suspendedBy.id, pomodoroSuspensions.createdByUserId))
      .where(where)
      .orderBy(desc(pomodoroSuspensions.createdAt), asc(pomodoroSuspensions.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(pomodoroSuspensions).innerJoin(users, eq(users.id, pomodoroSuspensions.userId)).where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminSuspensionRow = Awaited<ReturnType<typeof listSuspensions>>["rows"][number]
