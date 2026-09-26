import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { appUrlFor } from "@/server/app-url"
import { escapeHtml } from "@/lib/email/escape-html"
import { createBroadcastBlock } from "@/lib/broadcasts/blocks"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { emailBrandName } from "@/server/email/branding"
import { getEmailProvider } from "@/server/email/provider"
import { getSendableEmailConfig } from "@/server/email/settings"
import { findWorkspaceIdForRequest } from "@/server/workspaces/for-request"
import {
  pomodoroProfiles,
  roomInvites,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import { phaseUpdate, type RoomSettings } from "@/server/pomodoro/rooms"
import { formatRoomStart } from "@/lib/pomodoro/scheduled-rooms"

/**
 * Booked rooms: a host picks a start time, the room opens itself on that time
 * with nobody's browser open, and the people the host typed in get an email
 * with the link and the time.
 *
 * Two passes run on the app's background worker, both in `openDueRooms`
 * below. They follow the same rule as the room clock in rooms.ts: a claim is
 * an update with a guard in its WHERE, so two overlapping passes cannot both
 * do the same piece of work. Rooms are claimed on their sequence number,
 * invites on their status.
 */

const INVITES_PER_PASS = 20
const ROOMS_PER_PASS = 25
/** What a claimed invitation says while its send is still in the air. */
const INTERRUPTED_SEND =
  "The send was interrupted, so delivery could not be confirmed."

export type ScheduleRoomInput = RoomSettings & {
  startsAt: Date
  invites: string[]
}

/**
 * Books a room and queues its invitations in one transaction.
 *
 * Nothing else the host has is touched: no membership is made, and the room
 * they are sitting in right now keeps running. A booking is a future room,
 * not a move.
 */
export async function scheduleRoomWithInvites(
  userId: string,
  slug: string,
  input: ScheduleRoomInput,
  database: CustomShellDb = db
) {
  const { startsAt, invites, ...settings } = input
  return database.transaction(async (tx) => {
    const [room] = await tx
      .insert(rooms)
      .values({ ...settings, hostUserId: userId, slug, phase: "scheduled", startsAt })
      .returning()
    if (invites.length) {
      await tx
        .insert(roomInvites)
        .values(invites.map((email) => ({ roomId: room.id, email })))
        .onConflictDoNothing()
    }
    return room
  })
}

/**
 * Calls off a booked room.
 *
 * Only the host, only before it opens, and the invitations that have not left
 * yet are cancelled in the same transaction — which is what makes "cancelling
 * kills the email" true rather than a race. An invitation already sent stays
 * marked sent, because it did happen.
 */
export async function cancelScheduledRoom(
  slug: string,
  userId: string,
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  return database.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.slug, slug)).for("update").limit(1)
    if (!room) throw new Error("ROOM_NOT_FOUND")
    if (room.hostUserId !== userId) throw new Error("ROOM_HOST_REQUIRED")
    if (room.closedAt || room.phase === "closed") throw new Error("ROOM_CLOSED")
    if (room.phase !== "scheduled") throw new Error("ROOM_ALREADY_OPEN")

    const { set } = phaseUpdate(room, "closed", timestamp)
    await tx.update(rooms).set(set).where(eq(rooms.id, room.id))
    const stopped = await tx
      .update(roomInvites)
      .set({ status: "cancelled" })
      .where(and(eq(roomInvites.roomId, room.id), eq(roomInvites.status, "queued")))
      .returning({ id: roomInvites.id })
    return { cancelledInvites: stopped.length }
  })
}

export type UpcomingRoom = {
  id: string
  slug: string
  name: string
  visibility: string
  startsAt: Date
  focusMinutes: number
  hostName: string
  mine: boolean
  invitedCount: number
  emailedCount: number
}

/**
 * What the Upcoming group on the rooms page shows: every public booking, plus
 * the viewer's own bookings whether or not they are listed.
 *
 * Invite counts are the host's own business, so they come back as zero for
 * anybody else. Nobody's address is ever in this answer.
 */
export async function listUpcomingRooms(
  userId: string,
  database: CustomShellDb = db
): Promise<UpcomingRoom[]> {
  const displayName = sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`
  const rows = await database
    .select({
      id: rooms.id,
      slug: rooms.slug,
      name: rooms.name,
      visibility: rooms.visibility,
      startsAt: rooms.startsAt,
      focusMinutes: rooms.focusMinutes,
      hostUserId: rooms.hostUserId,
      hostName: displayName,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .where(
      and(
        eq(rooms.phase, "scheduled"),
        sql`${rooms.closedAt} is null`,
        or(eq(rooms.visibility, "public"), eq(rooms.hostUserId, userId))
      )
    )
    .orderBy(asc(rooms.startsAt))
    .limit(50)

  const mine = rows.filter((row) => row.hostUserId === userId).map((row) => row.id)
  const counts = mine.length
    ? await database
        .select({
          roomId: roomInvites.roomId,
          invited: sql<number>`count(*) filter (where ${roomInvites.status} <> 'cancelled')::int`,
          emailed: sql<number>`count(*) filter (where ${roomInvites.status} = 'sent')::int`,
        })
        .from(roomInvites)
        .where(inArray(roomInvites.roomId, mine))
        .groupBy(roomInvites.roomId)
    : []
  const byRoom = new Map(counts.map((row) => [row.roomId, row]))

  return rows.flatMap(({ hostUserId, startsAt, ...row }) => {
    // The column is nullable for every room that was never booked, but the
    // phase check constraint means a scheduled one always has it.
    if (!startsAt) return []
    const count = byRoom.get(row.id)
    return [
      {
        ...row,
        startsAt,
        mine: hostUserId === userId,
        invitedCount: count?.invited ?? 0,
        emailedCount: count?.emailed ?? 0,
      },
    ]
  })
}

export type ScheduledRoomOpenResult =
  | { kind: "opened"; room: Room }
  | { kind: "stale" }

/**
 * Opens one booked room, guarded on its sequence the same way a timed phase
 * change is. A room that was cancelled, or opened by another pass a moment
 * ago, no longer matches and this does nothing.
 *
 * Auto-start decides what it opens into. A host who ticked "auto-start the
 * next focus" booked a room that is already focusing when people arrive;
 * without it the room opens to Waiting and the host presses Start focus.
 */
export async function openScheduledRoom(
  roomId: string,
  sequence: number,
  database: CustomShellDb = db,
  timestamp = new Date()
): Promise<ScheduledRoomOpenResult> {
  return database.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.sequence, sequence), eq(rooms.phase, "scheduled")))
      .for("update")
      .limit(1)
    if (!room || room.closedAt || !room.startsAt || room.startsAt > timestamp) {
      return { kind: "stale" }
    }
    const { set } = phaseUpdate(room, room.autoStart ? "focus" : "waiting", timestamp)
    const [updated] = await tx.update(rooms).set(set).where(eq(rooms.id, room.id)).returning()
    return { kind: "opened", room: updated }
  })
}

/**
 * The background pass: open every booked room whose time has come, then send
 * the invitations waiting to go out.
 *
 * Opening comes first so an invitation sent seconds before the start time
 * still points at a room that is already running.
 */
export async function openDueRooms(
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  const due = await database
    .select({ id: rooms.id, sequence: rooms.sequence })
    .from(rooms)
    .where(and(eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`, lte(rooms.startsAt, timestamp)))
    .orderBy(asc(rooms.startsAt))
    .limit(ROOMS_PER_PASS)

  // Nothing is broadcast when a room opens: a booked room has no members
  // yet, so there is no live connection to tell. The browse page looks again
  // on its own once the start time passes — see UpcomingRooms.
  let opened = 0
  for (const row of due) {
    const result = await openScheduledRoom(row.id, row.sequence, database, timestamp)
    if (result.kind === "opened") opened += 1
  }
  const emailed = await sendQueuedRoomInvites(database, timestamp)
  return { opened, emailed }
}

/**
 * Sends the invitations that are still queued, oldest first.
 *
 * **The claim is what stops one person being emailed twice.** A pass moves
 * the row out of `queued` before it sends, and only the pass whose update
 * matched `queued` goes on to send, so two overlapping passes cannot both
 * take the same invitation. The claim writes `failed` rather than a
 * half-state, so a process that dies mid-send leaves a row that says the
 * send could not be confirmed instead of one that sends again on the next
 * pass. Sending twice is worse than not sending, and the host can see which
 * happened. Same reserve-then-update shape the shell's own sends use.
 *
 * A provider refusal is written down with the provider's own reason and is
 * not retried: a host would rather read "that address bounced" than watch an
 * invitation disappear.
 */
export async function sendQueuedRoomInvites(
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  const queued = await database
    .select({
      id: roomInvites.id,
      email: roomInvites.email,
      roomId: roomInvites.roomId,
      slug: rooms.slug,
      roomName: rooms.name,
      startsAt: rooms.startsAt,
      focusMinutes: rooms.focusMinutes,
      hostUserId: rooms.hostUserId,
      hostName: sql<string>`coalesce(${pomodoroProfiles.publicDisplayName}, ${users.name})`,
      hostTimezone: sql<string>`coalesce(${pomodoroProfiles.timezone}, 'UTC')`,
    })
    .from(roomInvites)
    .innerJoin(rooms, eq(roomInvites.roomId, rooms.id))
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .where(and(eq(roomInvites.status, "queued"), sql`${rooms.closedAt} is null`))
    .orderBy(asc(roomInvites.createdAt))
    .limit(INVITES_PER_PASS)

  let sent = 0
  for (const invite of queued) {
    if (!invite.startsAt) continue
    const [claimed] = await database
      .update(roomInvites)
      .set({
        status: "failed",
        claimedAt: timestamp,
        failureReason: INTERRUPTED_SEND,
      })
      .where(and(eq(roomInvites.id, invite.id), eq(roomInvites.status, "queued")))
      .returning({ id: roomInvites.id })
    if (!claimed) continue

    const outcome = await deliverInvite(database, {
      email: invite.email,
      hostUserId: invite.hostUserId,
      hostName: invite.hostName,
      hostTimezone: invite.hostTimezone,
      roomName: invite.roomName,
      slug: invite.slug,
      startsAt: invite.startsAt,
      focusMinutes: invite.focusMinutes,
    })
    await database
      .update(roomInvites)
      .set(
        outcome.sent
          ? { status: "sent", sentAt: new Date(), failureReason: null }
          : { status: "failed", failureReason: outcome.reason.slice(0, 200) }
      )
      .where(eq(roomInvites.id, invite.id))
    if (outcome.sent) sent += 1
  }
  return sent
}

type InviteEmail = {
  email: string
  hostUserId: string
  hostName: string
  hostTimezone: string
  roomName: string
  slug: string
  startsAt: Date
  focusMinutes: number
}

/**
 * Hands one invitation to the deployment's own email setup: the workspace's
 * Resend key and sender from Settings → Email, the same pair every other
 * email in this app goes out on. With no key set, outside production, the
 * shell's logging provider writes it to the server log instead of sending it,
 * so a booking can be walked end to end locally.
 */
async function deliverInvite(database: CustomShellDb, invite: InviteEmail) {
  const workspaceId = await findWorkspaceIdForRequest(invite.hostUserId, database)
  if (!workspaceId) return { sent: false, reason: "This deployment has no site to send from." }

  const config = await getSendableEmailConfig(workspaceId, database)
  if (!config) {
    return {
      sent: false,
      reason: "Email is not set up. Add a sender and a Resend key in Settings → Email.",
    }
  }

  const appName = await emailBrandName(workspaceId, database)
  const when = formatRoomStart(invite.startsAt, invite.hostTimezone)
  const link = appUrlFor(`/rooms/${invite.slug}`)

  const intro = createBroadcastBlock("richText")
  if (intro.kind !== "richText") return { sent: false, reason: "The invitation could not be drawn." }
  intro.content.htmlContent = [
    `<p>${escapeHtml(invite.hostName)} booked a focus room and asked me to send you the link.</p>`,
    `<p><strong>${escapeHtml(invite.roomName)}</strong><br />${escapeHtml(when)}<br />${invite.focusMinutes} minute focus sessions</p>`,
    `<p>The room opens itself at that time. Open the link then and you are in.</p>`,
  ].join("")

  const button = createBroadcastBlock("button")
  if (button.kind !== "button") return { sent: false, reason: "The invitation could not be drawn." }
  button.content.label = "Open the room"
  button.content.url = link

  const tail = createBroadcastBlock("richText")
  if (tail.kind !== "richText") return { sent: false, reason: "The invitation could not be drawn." }
  tail.content.htmlContent = `<p style="font-size:13px;color:#71717a;">You are getting this because ${escapeHtml(invite.hostName)} typed your address into ${escapeHtml(appName)}. Ignore it and nothing happens.</p>`

  const subject = `${invite.hostName} invited you to ${invite.roomName} — ${when}`.replace(/[\r\n]+/g, " ")
  const html = renderBroadcastEmailHtml([intro, button, tail], {
    preheader: `${invite.roomName} starts ${when}`,
    appName,
    renderStyle: "system",
  })

  try {
    const result = await getEmailProvider(config.apiKey).send({
      from: config.from,
      to: invite.email,
      subject,
      html,
    })
    return result.success
      ? { sent: true, reason: "" }
      : { sent: false, reason: result.error ?? "The send did not go through." }
  } catch (cause) {
    return { sent: false, reason: cause instanceof Error ? cause.message : "The send did not go through." }
  }
}

/** How many rooms this person already has booked and not yet cancelled. */
export async function countScheduledRoomsHostedBy(
  userId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.hostUserId, userId), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`))
  return row?.total ?? 0
}
