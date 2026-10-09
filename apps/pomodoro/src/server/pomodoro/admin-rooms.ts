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
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db } from "@/server/db"
import { writeNotices } from "@/server/pomodoro/notices"
import { endActiveMemberships, phaseUpdate, roomHref } from "@/server/pomodoro/rooms"
import { closeBookedRoom } from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroAuditLogs,
  pomodoroNoticeLinks,
  pomodoroRoomPresets,
  pomodoroRoomRepeats,
  roomInvites,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications, customShellUsers as users } from "@/server/schema"
import { roomChangedMessage } from "@/lib/pomodoro/notices"
import type {
  InviteSortColumn,
  INVITE_STATUS_FILTERS,
} from "@/lib/pomodoro/admin-lists"

/**
 * What an admin does to rooms beyond deleting them (admin task 04): close a
 * live one, edit one in a window, feature one on Browse rooms, cancel invites
 * still waiting to go out, and keep the house presets hosts pick from. See
 * `workspace/docs/rooms-admin.md`.
 *
 * Every change writes one `pomodoro_audit_logs` row in the same transaction.
 * The caller nudges open room screens after the commit, through `notifyRoom`.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function logRoomAct(
  tx: Transaction,
  actorUserId: string,
  action: string,
  resource: string,
  recordIds: string[]
) {
  if (!recordIds.length) return
  await tx
    .insert(pomodoroAuditLogs)
    .values({ actorUserId, action, resource, recordIds })
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

/**
 * Ends rooms the way a host's Close does, without the host check. People
 * inside are taken out and their screens say the room has ended; the chat,
 * the members and any reports are kept. A booked room that has not opened
 * yet is cancelled the way its host would cancel it, with its unsent
 * invitations stopped. A room already closed is skipped.
 */
export async function closeAdminRooms({
  roomIds,
  actorUserId,
  timestamp = new Date(),
}: {
  roomIds: string[]
  actorUserId: string
  timestamp?: Date
}) {
  const closed = await db.transaction(async (tx) => {
    const open = await tx
      .select()
      .from(rooms)
      .where(
        and(inArray(rooms.id, roomIds), isNull(rooms.closedAt), ne(rooms.phase, "closed"))
      )
      .for("update")
    for (const room of open) {
      if (room.phase === "scheduled") {
        await closeBookedRoom(tx, room, timestamp)
        continue
      }
      const { set } = phaseUpdate(room, "closed", timestamp)
      await tx.update(rooms).set(set).where(eq(rooms.id, room.id))
      await endActiveMemberships(tx, room.id, timestamp)
    }
    await writeNotices(
      tx,
      open.map((room) => ({
        recipientUserId: room.hostUserId,
        kind: "room_changed" as const,
        message: roomChangedMessage(room.name, "closed"),
        roomId: room.id,
        href: roomHref(room.slug),
      }))
    )
    const ids = open.map((room) => room.id)
    await logRoomAct(tx, actorUserId, "close_rooms", "rooms", ids)
    return ids
  })
  const done = new Set(closed)
  return { closed, skipped: roomIds.filter((id) => !done.has(id)) }
}

// ---------------------------------------------------------------------------
// The room window
// ---------------------------------------------------------------------------

export async function loadAdminRoom(id: string) {
  const [row] = await db
    .select({
      id: rooms.id,
      slug: rooms.slug,
      name: rooms.name,
      visibility: rooms.visibility,
      phase: rooms.phase,
      focusMinutes: rooms.focusMinutes,
      shortBreakMinutes: rooms.shortBreakMinutes,
      longBreakMinutes: rooms.longBreakMinutes,
      autoStart: rooms.autoStart,
      sound: rooms.sound,
      background: rooms.background,
      featuredAt: rooms.featuredAt,
      closedAt: rooms.closedAt,
      hostName: users.name,
    })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.hostUserId))
    .where(eq(rooms.id, id))
    .limit(1)
  if (!row) throw new Error("ROOM_NOT_FOUND")
  return row
}

export type AdminRoomItem = Awaited<ReturnType<typeof loadAdminRoom>>

export type AdminRoomInput = {
  name: string
  visibility: "public" | "unlisted"
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  autoStart: boolean
  sound: string
  background: string
  featured: boolean
}

/**
 * Saves the window. A running phase keeps its own end time: new minutes apply
 * from the next phase, so a focus already under way is never cut short. The
 * host is told in the bell when anything they would notice changed.
 */
export async function saveAdminRoom({
  id,
  input,
  actorUserId,
}: {
  id: string
  input: AdminRoomInput
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, id)).for("update").limit(1)
    if (!room) throw new Error("ROOM_NOT_FOUND")
    if (room.closedAt || room.phase === "closed") throw new Error("ROOM_CLOSED")
    const now = new Date()
    const [updated] = await tx
      .update(rooms)
      .set({
        name: input.name,
        visibility: input.visibility,
        focusMinutes: input.focusMinutes,
        shortBreakMinutes: input.shortBreakMinutes,
        longBreakMinutes: input.longBreakMinutes,
        autoStart: input.autoStart,
        sound: input.sound,
        background: input.background,
        featuredAt: input.featured ? (room.featuredAt ?? now) : null,
        updatedAt: now,
      })
      .where(eq(rooms.id, id))
      .returning()
    const noticed =
      room.name !== input.name ||
      room.visibility !== input.visibility ||
      room.focusMinutes !== input.focusMinutes ||
      room.shortBreakMinutes !== input.shortBreakMinutes ||
      room.longBreakMinutes !== input.longBreakMinutes ||
      room.autoStart !== input.autoStart ||
      room.sound !== input.sound ||
      room.background !== input.background
    if (noticed)
      await writeNotices(tx, [
        {
          recipientUserId: room.hostUserId,
          kind: "room_changed" as const,
          message: roomChangedMessage(input.name, "changed"),
          roomId: room.id,
          href: roomHref(room.slug),
        },
      ])
    await logRoomAct(tx, actorUserId, "edit_room", "rooms", [id])
    return updated
  })
}

/** Featured or not, over ticked rooms. */
export async function setAdminRoomsFeatured({
  roomIds,
  featured,
  actorUserId,
}: {
  roomIds: string[]
  featured: boolean
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(rooms)
      .set({ featuredAt: featured ? new Date() : null })
      .where(
        and(
          inArray(rooms.id, roomIds),
          featured ? isNull(rooms.featuredAt) : isNotNull(rooms.featuredAt)
        )
      )
      .returning({ id: rooms.id })
    const ids = changed.map((row) => row.id)
    await logRoomAct(tx, actorUserId, featured ? "feature_rooms" : "unfeature_rooms", "rooms", ids)
    const done = new Set(ids)
    return { changed: ids, same: roomIds.filter((id) => !done.has(id)) }
  })
}

/** Featured or not, over ticked weekly rules: every room they book follows. */
export async function setAdminRoomRepeatsFeatured({
  repeatIds,
  featured,
  actorUserId,
}: {
  repeatIds: string[]
  featured: boolean
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(pomodoroRoomRepeats)
      .set({ featured })
      .where(
        and(
          inArray(pomodoroRoomRepeats.id, repeatIds),
          ne(pomodoroRoomRepeats.featured, featured)
        )
      )
      .returning({ id: pomodoroRoomRepeats.id })
    const ids = changed.map((row) => row.id)
    await logRoomAct(
      tx,
      actorUserId,
      featured ? "feature_room_repeats" : "unfeature_room_repeats",
      "room_repeats",
      ids
    )
    const done = new Set(ids)
    return { changed: ids, same: repeatIds.filter((id) => !done.has(id)) }
  })
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export async function listAdminInvites(query: {
  search: string
  status: (typeof INVITE_STATUS_FILTERS)[number]
  sort: InviteSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(roomInvites.email, pattern),
      ilike(rooms.name, pattern),
      ilike(users.name, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status !== "all") filters.push(eq(roomInvites.status, query.status))
  const where = filters.length ? and(...filters) : undefined
  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    room: rooms.name,
    email: roomInvites.email,
    status: roomInvites.status,
    created: roomInvites.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: roomInvites.id,
        email: roomInvites.email,
        status: roomInvites.status,
        sentAt: roomInvites.sentAt,
        failureReason: roomInvites.failureReason,
        createdAt: roomInvites.createdAt,
        roomName: rooms.name,
        roomStartsAt: rooms.startsAt,
        hostUserId: rooms.hostUserId,
        hostName: users.name,
      })
      .from(roomInvites)
      .innerJoin(rooms, eq(rooms.id, roomInvites.roomId))
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where)
      .orderBy(direction(sortColumn), asc(roomInvites.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(roomInvites)
      .innerJoin(rooms, eq(rooms.id, roomInvites.roomId))
      .innerJoin(users, eq(users.id, rooms.hostUserId))
      .where(where),
  ])
  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminInviteRow = Awaited<ReturnType<typeof listAdminInvites>>["rows"][number]

/**
 * Stops invitations that have not gone out. One already sent, failed or
 * cancelled is left alone and counted as such.
 */
export async function cancelAdminInvites({
  inviteIds,
  actorUserId,
}: {
  inviteIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const stopped = await tx
      .update(roomInvites)
      .set({ status: "cancelled" })
      .where(and(inArray(roomInvites.id, inviteIds), eq(roomInvites.status, "queued")))
      .returning({ id: roomInvites.id, roomId: roomInvites.roomId, email: roomInvites.email })
    // An invitee with an account also had it in the bell. An unread one goes,
    // as it does when the host cancels; one already read stays as history.
    for (const invite of stopped) {
      const accounts = tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${invite.email.toLowerCase()}`)
      const notices = tx
        .select({ id: pomodoroNoticeLinks.noticeId })
        .from(pomodoroNoticeLinks)
        .where(and(eq(pomodoroNoticeLinks.roomId, invite.roomId), eq(pomodoroNoticeLinks.kind, "room_invite")))
      await tx
        .delete(customShellNotifications)
        .where(
          and(
            isNull(customShellNotifications.readAt),
            inArray(customShellNotifications.recipientUserId, accounts),
            inArray(customShellNotifications.id, notices)
          )
        )
    }
    const ids = stopped.map((row) => row.id)
    await logRoomAct(tx, actorUserId, "cancel_invites", "invites", ids)
    const done = new Set(ids)
    return { cancelled: ids, skipped: inviteIds.filter((id) => !done.has(id)) }
  })
}

// ---------------------------------------------------------------------------
// House presets
// ---------------------------------------------------------------------------

export async function listRoomPresets() {
  return db
    .select()
    .from(pomodoroRoomPresets)
    .orderBy(asc(pomodoroRoomPresets.position), asc(pomodoroRoomPresets.createdAt))
}

export type RoomPreset = Awaited<ReturnType<typeof listRoomPresets>>[number]

export type RoomPresetInput = {
  name: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  autoStart: boolean
  sound: string | null
  background: string | null
}

export async function saveRoomPreset({
  id,
  input,
  actorUserId,
}: {
  id: string | null
  input: RoomPresetInput
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    let saved: RoomPreset | undefined
    if (id) {
      ;[saved] = await tx
        .update(pomodoroRoomPresets)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(pomodoroRoomPresets.id, id))
        .returning()
      if (!saved) throw new Error("PRESET_NOT_FOUND")
    } else {
      const [last] = await tx
        .select({ position: sql<number>`coalesce(max(${pomodoroRoomPresets.position}), -1)::int` })
        .from(pomodoroRoomPresets)
      ;[saved] = await tx
        .insert(pomodoroRoomPresets)
        .values({ ...input, position: (last?.position ?? -1) + 1 })
        .returning()
    }
    await logRoomAct(tx, actorUserId, id ? "edit_room_preset" : "create_room_preset", "room_presets", [saved.id])
    return saved
  })
}

export async function deleteRoomPresets({
  presetIds,
  actorUserId,
}: {
  presetIds: string[]
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    const gone = await tx
      .delete(pomodoroRoomPresets)
      .where(inArray(pomodoroRoomPresets.id, presetIds))
      .returning({ id: pomodoroRoomPresets.id })
    const ids = gone.map((row) => row.id)
    await logRoomAct(tx, actorUserId, "delete_room_presets", "room_presets", ids)
    const done = new Set(ids)
    return { deleted: ids, skipped: presetIds.filter((id) => !done.has(id)) }
  })
}
