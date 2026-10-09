import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { appUrlFor } from "@/server/app-url"
import { emailBrandName } from "@/server/email/branding"
import { getEmailProvider } from "@/server/email/provider"
import { getSendableEmailConfig } from "@/server/email/settings"
import { findWorkspaceIdForRequest } from "@/server/workspaces/for-request"
import { writeNotices } from "@/server/pomodoro/notices"
import { leaveRoom } from "@/server/pomodoro/rooms"
import { closeBookedRoom } from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroAuditLogs,
  pomodoroSuspensions,
  pomodoroWarnings,
  roomMemberships,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import { createBroadcastBlock } from "@/lib/broadcasts/blocks"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { escapeHtml } from "@/lib/email/escape-html"
import {
  ADMIN_WARNING_MESSAGE,
  roomsSuspendedMessage,
} from "@/lib/pomodoro/notices"
import { runningSuspension, shortDate, timezoneOf } from "@/server/pomodoro/room-access"

/**
 * The site-wide safety tools (admin task 05): warnings, suspensions from every
 * room, and the two pause switches. See `workspace/docs/admin-safety-tools.md`.
 *
 * The checks at every way into a room are in `room-access.ts`.
 */

type Database = CustomShellDb
const DAY_MS = 24 * 60 * 60_000

// ---------------------------------------------------------------------------
// Warnings
// ---------------------------------------------------------------------------

/**
 * Warns members: a bell notice carrying the admin's words, a kept row the
 * next admin can read, and an email sent after the commit. A failed email is
 * reported back, never undoing the warning.
 */
export async function warnMembers({
  userIds,
  message,
  actorUserId,
  database = db,
}: {
  userIds: string[]
  message: string
  actorUserId: string
  database?: Database
}) {
  const people = await database.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, userIds))
  if (!people.length) return { warned: [], emailed: 0, emailProblem: null as string | null }
  const rows = await database.transaction(async (tx) => {
    const inserted = await tx
      .insert(pomodoroWarnings)
      .values(people.map((person) => ({ userId: person.id, message, createdByUserId: actorUserId })))
      .returning({ id: pomodoroWarnings.id })
    await writeNotices(tx, people.map((person) => ({
      recipientUserId: person.id,
      kind: "admin_warning" as const,
      message: ADMIN_WARNING_MESSAGE,
      detail: message,
    })))
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "warn", resource: "members", recordIds: inserted.map((row) => row.id) })
    return inserted
  })
  let emailed = 0
  let emailProblem: string | null = null
  for (const person of people) {
    const result = await emailMember(database, person, "A note from the team about your account", [
      "One of the team sent you a warning about how you are using rooms:",
      message,
      "Nothing else has changed on your account. You can keep using rooms as normal.",
    ])
    if (result.sent) emailed += 1
    else emailProblem = result.reason
  }
  if (emailProblem) console.error("a warning email did not go out", emailProblem)
  return { warned: rows.map((row) => row.id), emailed, emailProblem }
}

/** Every warning one member has had, newest first, for the admin's window. */
export async function listWarnings(userId: string, database: Database = db) {
  return database
    .select({ id: pomodoroWarnings.id, message: pomodoroWarnings.message, createdAt: pomodoroWarnings.createdAt })
    .from(pomodoroWarnings)
    .where(eq(pomodoroWarnings.userId, userId))
    .orderBy(desc(pomodoroWarnings.createdAt))
    .limit(50)
}

async function emailMember(database: Database, person: { id: string; email: string }, subject: string, paragraphs: string[]) {
  try {
    const workspaceId = await findWorkspaceIdForRequest(person.id, database)
    if (!workspaceId) return { sent: false, reason: "This deployment has no site to send from." }
    const config = await getSendableEmailConfig(workspaceId, database)
    if (!config) return { sent: false, reason: "Email is not set up. Add a sender and a Resend key in Settings → Email." }
    const appName = await emailBrandName(workspaceId, database)
    const body = createBroadcastBlock("richText")
    if (body.kind !== "richText") return { sent: false, reason: "The email could not be drawn." }
    body.content.htmlContent = paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join("")
    const button = createBroadcastBlock("button")
    if (button.kind !== "button") return { sent: false, reason: "The email could not be drawn." }
    button.content.label = `Open ${appName}`
    button.content.url = appUrlFor("/")
    const html = renderBroadcastEmailHtml([body, button], { preheader: subject, appName, renderStyle: "system" })
    const result = await getEmailProvider(config.apiKey).send({ from: config.from, to: person.email, subject, html })
    return result.success ? { sent: true, reason: "" } : { sent: false, reason: result.error ?? "The send did not go through." }
  } catch (cause) {
    return { sent: false, reason: cause instanceof Error ? cause.message : "The send did not go through." }
  }
}

// ---------------------------------------------------------------------------
// Suspensions
// ---------------------------------------------------------------------------

/**
 * Bars members from every room for `days`, or until lifted when null. A
 * running suspension is replaced, so a member has one at a time. Anybody in a
 * room is taken out after the commit, the way leaving does: a host's own room
 * ends, since a room cannot run without its host.
 *
 * Returns the rooms whose open screens need telling.
 */
export async function suspendMembers({
  userIds,
  days,
  reason,
  actorUserId,
  database = db,
  now = new Date(),
}: {
  userIds: string[]
  days: number | null
  reason: string
  actorUserId: string
  database?: Database
  now?: Date
}) {
  const people = await database.select({ id: users.id }).from(users).where(inArray(users.id, userIds))
  if (!people.length) return { suspended: [], touchedRooms: [] as { id: string; closed: boolean }[] }
  const endsAt = days === null ? null : new Date(now.getTime() + days * DAY_MS)
  const ids = people.map((person) => person.id)
  const timezones = new Map(await Promise.all(ids.map(async (id) => [id, await timezoneOf(id, database)] as const)))

  const suspended = await database.transaction(async (tx) => {
    await tx
      .update(pomodoroSuspensions)
      .set({ liftedAt: now, liftedByUserId: actorUserId })
      .where(and(inArray(pomodoroSuspensions.userId, ids), runningSuspension(now)))
    const inserted = await tx
      .insert(pomodoroSuspensions)
      .values(ids.map((userId) => ({ userId, reason, endsAt, createdByUserId: actorUserId, createdAt: now })))
      .returning({ id: pomodoroSuspensions.id })
    await writeNotices(tx, ids.map((userId) => ({
      recipientUserId: userId,
      kind: "rooms_suspended" as const,
      message: roomsSuspendedMessage(endsAt ? shortDate(endsAt, timezones.get(userId) ?? "UTC") : null),
      detail: reason,
    })))
    // A room they booked would open on time with its host refused at the door,
    // so it is cancelled the way the host would cancel it, invitations and all.
    // Their weekly rules stay, and skip their days until the suspension ends.
    const booked = await tx
      .select()
      .from(rooms)
      .where(and(inArray(rooms.hostUserId, ids), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`))
      .for("update")
    for (const room of booked) await closeBookedRoom(tx, room, now)
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "suspend", resource: "members", recordIds: inserted.map((row) => row.id) })
    return inserted.map((row) => row.id)
  })

  // Taken out after the commit, so a room that fails to let go never undoes
  // the suspension; the next join, open or send is refused either way.
  const inside = await database
    .select({ userId: roomMemberships.userId, slug: rooms.slug, roomId: rooms.id })
    .from(roomMemberships)
    .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
    .where(and(inArray(roomMemberships.userId, ids), sql`${roomMemberships.leftAt} is null`))
  const touchedRooms: { id: string; closed: boolean }[] = []
  for (const membership of inside) {
    try {
      const { closed, left } = await leaveRoom(membership.slug, membership.userId, database, now)
      if (closed || left) touchedRooms.push({ id: membership.roomId, closed })
    } catch (cause) {
      console.error("a suspended member could not be taken out of a room", cause)
    }
  }
  return { suspended, touchedRooms }
}

export async function liftSuspensions({
  suspensionIds,
  actorUserId,
  database = db,
  now = new Date(),
}: {
  suspensionIds: string[]
  actorUserId: string
  database?: Database
  now?: Date
}) {
  return database.transaction(async (tx) => {
    const lifted = await tx
      .update(pomodoroSuspensions)
      .set({ liftedAt: now, liftedByUserId: actorUserId })
      .where(and(inArray(pomodoroSuspensions.id, suspensionIds), runningSuspension(now)))
      .returning({ id: pomodoroSuspensions.id })
    const done = lifted.map((row) => row.id)
    if (done.length)
      await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "lift_suspension", resource: "members", recordIds: done })
    return { changed: done, skipped: suspensionIds.filter((id) => !done.includes(id)) }
  })
}
