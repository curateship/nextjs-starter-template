import { randomBytes } from "node:crypto"
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm"

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
  pomodoroRoomRepeats,
  roomInvites,
  rooms,
  type PomodoroRoomRepeat,
  type Room,
} from "@/server/pomodoro/schema"
import { requirePomodoroPerk } from "@/server/pomodoro/entitlements"
import { customShellUsers as users } from "@/server/schema"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import { dropUnreadRoomNotices, writeNotices } from "@/server/pomodoro/notices"
import {
  phaseUpdate,
  roomHref,
  roomName,
  type PomoderTransaction,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import { roomInviteMessage, roomOpenMessage } from "@/lib/pomodoro/notices"
import { formatRoomStart } from "@/lib/pomodoro/scheduled-rooms"
import {
  describeRoomRepeat,
  MAX_ROOM_REPEATS_PER_HOST,
  nextRoomOccurrence,
  ROOM_REPEAT_LEAD_HOURS,
} from "@/lib/pomodoro/room-repeats"

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
  /** Set when the weekly worker books one of a rule's days. */
  repeat?: { id: string; occurrenceDate: string }
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
  const recipients = await bookingRecipients(userId, input.invites, database)
  const room = await database.transaction((tx) => writeBooking(tx, userId, slug, input, recipients))
  if (!room) throw new Error("ROOM_NOT_CREATED")
  return room
}

/**
 * Who hears about a booking, read before any transaction: a read on the
 * shared handle from inside one waits on a second connection. Invitees with
 * an account hear in the bell too. The host is told nothing about which
 * addresses matched.
 */
async function bookingRecipients(userId: string, invites: string[], database: CustomShellDb) {
  const [invitees, hostName] = await Promise.all([
    inviteeAccounts(userId, invites, database),
    roomName(database, userId),
  ])
  return { invitees, hostName }
}

/**
 * The booking itself, inside the caller's transaction. Answers null when a
 * weekly rule's day was already booked, which is the one conflict expected
 * here: a second pass racing this one meets the unique index on (repeat_id,
 * occurrence_date), inserts nothing, and so writes no invitations and no
 * notices either.
 */
async function writeBooking(
  tx: PomoderTransaction,
  userId: string,
  slug: string,
  input: ScheduleRoomInput,
  { invitees, hostName }: Awaited<ReturnType<typeof bookingRecipients>>
) {
  const { startsAt, invites, repeat, ...settings } = input
  const [room] = await tx
    .insert(rooms)
    .values({
      ...settings,
      hostUserId: userId,
      slug,
      phase: "scheduled",
      startsAt,
      repeatId: repeat?.id ?? null,
      occurrenceDate: repeat?.occurrenceDate ?? null,
    })
    .onConflictDoNothing()
    .returning()
  if (!room) return null
  if (invites.length) {
    await tx
      .insert(roomInvites)
      .values(invites.map((email) => ({ roomId: room.id, email })))
      .onConflictDoNothing()
  }
  await writeNotices(
    tx,
    invitees.map((invitee) => ({
      recipientUserId: invitee.userId,
      actorUserId: userId,
      kind: "room_invite" as const,
      message: roomInviteMessage(hostName, room.name),
      // In the reader's own timezone. The email names the host's, because
      // it cannot know the reader's; the bell can.
      detail: formatRoomStart(startsAt, invitee.timezone),
      roomId: room.id,
      href: roomHref(room.slug),
    }))
  )
  return room
}

/**
 * The accounts behind these invited addresses: verified addresses only, never
 * the host, nobody across a block with the host, each once. Somebody invited
 * by an address with no account gets the email and nothing else, as before.
 */
async function inviteeAccounts(
  hostUserId: string,
  emails: readonly string[],
  database: CustomShellDb
) {
  if (emails.length === 0) return []
  const [accounts, blocked] = await Promise.all([
    database
      .select({
        userId: users.id,
        timezone: sql<string>`coalesce(${pomodoroProfiles.timezone}, 'UTC')`,
      })
      .from(users)
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
      .where(
        and(
          inArray(sql`lower(${users.email})`, emails.map((email) => email.toLowerCase())),
          sql`${users.emailVerifiedAt} is not null`,
          sql`${users.id} <> ${hostUserId}`
        )
      ),
    blockedUserIdsFor(hostUserId),
  ])
  return accounts.filter((account) => !blocked.has(account.userId))
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
    return { cancelledInvites: await closeBookedRoom(tx, room, timestamp) }
  })
}

/**
 * Closes a locked, still-booked room and stops its unsent invitations.
 * Answers how many invitations were stopped.
 */
async function closeBookedRoom(tx: PomoderTransaction, room: Room, timestamp: Date) {
  const { set } = phaseUpdate(room, "closed", timestamp)
  await tx.update(rooms).set(set).where(eq(rooms.id, room.id))
  // An unread invitation to a room that will not happen goes with it.
  await dropUnreadRoomNotices(tx, [room.id], ["room_invite", "room_open"])
  const stopped = await tx
    .update(roomInvites)
    .set({ status: "cancelled" })
    .where(and(eq(roomInvites.roomId, room.id), eq(roomInvites.status, "queued")))
    .returning({ id: roomInvites.id })
  return stopped.length
}

export type UpcomingRoom = {
  id: string
  slug: string
  name: string
  visibility: string
  startsAt: Date
  focusMinutes: number
  /** The pair the room opens with, for the card's picture and sound line. */
  sound: string | null
  background: string | null
  hostName: string
  mine: boolean
  invitedCount: number
  emailedCount: number
  /** "every Tuesday at 09:00, Europe/London time" when a weekly rule booked this room. */
  repeatLabel: string | null
  /** The rule's id, for the host's own Cancel the series only. */
  repeatId: string | null
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
      sound: rooms.sound,
      background: rooms.background,
      hostUserId: rooms.hostUserId,
      hostName: displayName,
      repeatId: rooms.repeatId,
      repeatWeekdays: pomodoroRoomRepeats.weekdays,
      repeatStartMinute: pomodoroRoomRepeats.startMinute,
      repeatTimezone: pomodoroRoomRepeats.timezone,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, users.id))
    .leftJoin(pomodoroRoomRepeats, eq(pomodoroRoomRepeats.id, rooms.repeatId))
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

  return rows.flatMap(({ hostUserId, startsAt, repeatId, repeatWeekdays, repeatStartMinute, repeatTimezone, ...row }) => {
    // The column is nullable for every room that was never booked, but the
    // phase check constraint means a scheduled one always has it.
    if (!startsAt) return []
    const count = byRoom.get(row.id)
    const mine = hostUserId === userId
    return [
      {
        ...row,
        startsAt,
        mine,
        invitedCount: count?.invited ?? 0,
        emailedCount: count?.emailed ?? 0,
        // The host's clock, named, because the reader's may differ. The date
        // line on the card is already in the reader's own.
        repeatLabel:
          repeatWeekdays !== null && repeatStartMinute !== null
            ? `${describeRoomRepeat(repeatWeekdays, repeatStartMinute)}, ${repeatTimezone} time`
            : null,
        repeatId: mine ? repeatId : null,
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
  // Who hears that it is open: the host, and every invitee with an account
  // whose invitation was not cancelled. Read before the transaction.
  const recipients = await openNoticeRecipients(roomId, database)
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
    // "It's open" replaces "you're invited", so the tray does not hold both.
    await dropUnreadRoomNotices(tx, [room.id], ["room_invite"])
    await writeNotices(
      tx,
      recipients.map((recipientUserId) => ({
        recipientUserId,
        kind: "room_open" as const,
        message: roomOpenMessage(room.name),
        roomId: room.id,
        href: roomHref(room.slug),
      }))
    )
    return { kind: "opened", room: updated }
  })
}

/** The host plus the invitees with accounts, for the "is open now" notice. */
async function openNoticeRecipients(roomId: string, database: CustomShellDb) {
  const [room] = await database
    .select({ hostUserId: rooms.hostUserId })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1)
  if (!room) return []
  const invited = await database
    .select({ email: roomInvites.email })
    .from(roomInvites)
    .where(and(eq(roomInvites.roomId, roomId), sql`${roomInvites.status} <> 'cancelled'`))
  const invitees = await inviteeAccounts(
    room.hostUserId,
    invited.map((row) => row.email),
    database
  )
  return [room.hostUserId, ...invitees.map((invitee) => invitee.userId)]
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
  // Weekly rules first, so a day booked this pass has its invitations sent by
  // the same pass.
  const booked = await bookDueRepeatRooms(database, timestamp)
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
  return { booked, opened, emailed }
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

/**
 * How many one-off rooms this person already has booked and not yet
 * cancelled. A weekly rule's booked day is not counted: weekly rooms have
 * their own limit, MAX_ROOM_REPEATS_PER_HOST.
 */
export async function countScheduledRoomsHostedBy(
  userId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.hostUserId, userId), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`, isNull(rooms.repeatId)))
  return row?.total ?? 0
}

/* ------------------------------------------------------------------------ */
/* Weekly rooms                                                              */
/* ------------------------------------------------------------------------ */

const REPEATS_PER_PASS = 25
const LEAD_MS = ROOM_REPEAT_LEAD_HOURS * 60 * 60_000

export type RoomRepeatInput = RoomSettings & {
  weekdays: number
  startMinute: number
  timezone: string
  invites: string[]
}

/**
 * Saves a weekly rule and books its first day straight away when that day is
 * within the lead time, so a room for tomorrow morning is under Upcoming the
 * moment the window closes rather than fifteen seconds later.
 */
export async function createRoomRepeat(
  userId: string,
  input: RoomRepeatInput,
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  const [{ live }] = await database
    .select({ live: sql<number>`count(*)::int` })
    .from(pomodoroRoomRepeats)
    .where(and(eq(pomodoroRoomRepeats.hostUserId, userId), isNull(pomodoroRoomRepeats.cancelledAt)))
  if (live >= MAX_ROOM_REPEATS_PER_HOST) throw new Error("ROOM_REPEAT_LIMIT")
  const next = nextRoomOccurrence(input, timestamp)
  if (!next) throw new Error("ROOM_REPEAT_NO_OCCURRENCE")
  const [rule] = await database
    .insert(pomodoroRoomRepeats)
    .values({ ...input, hostUserId: userId, nextStartsAt: next.startsAt })
    .returning()
  await bookDueRepeatRooms(database, timestamp, rule.id)
  return { rule, next }
}

/**
 * The worker's half: books the day of every live rule whose next start is
 * within the lead time, then moves the rule on to the day after.
 *
 * Booking goes through writeBooking, the same insert a one-off booking
 * uses, so a weekly day is an ordinary booked room with its own invitation
 * rows, and the sender's claim stops any one of them going out twice. The unique index on the rule and the
 * day stops two passes booking the same day.
 *
 * A host who is no longer allowed to host is skipped, not cancelled: the rule
 * moves on without booking, and books again if the plan comes back. A day
 * whose start has already passed, because the worker was down, is skipped the
 * same way rather than opened late.
 */
export async function bookDueRepeatRooms(
  database: CustomShellDb = db,
  timestamp = new Date(),
  onlyRuleId?: string
) {
  const due = await database
    .select()
    .from(pomodoroRoomRepeats)
    .where(
      and(
        isNull(pomodoroRoomRepeats.cancelledAt),
        lte(pomodoroRoomRepeats.nextStartsAt, new Date(timestamp.getTime() + LEAD_MS)),
        onlyRuleId ? eq(pomodoroRoomRepeats.id, onlyRuleId) : undefined
      )
    )
    .orderBy(asc(pomodoroRoomRepeats.nextStartsAt))
    .limit(REPEATS_PER_PASS)

  let booked = 0
  for (const rule of due) {
    if (await bookRepeatDay(rule, database, timestamp)) booked += 1
  }
  return booked
}

async function bookRepeatDay(
  seen: PomodoroRoomRepeat,
  database: CustomShellDb,
  timestamp: Date
) {
  if (!seen.nextStartsAt) return false
  const day = occurrenceAt(seen, seen.nextStartsAt)
  const bookable = Boolean(day && day.startsAt > timestamp)
  // Read before the transaction, like every other read on the shared handle.
  const [allowed, recipients] = await Promise.all([
    bookable ? mayHost(seen.hostUserId, database) : false,
    bookable ? bookingRecipients(seen.hostUserId, seen.invites, database) : null,
  ])
  return database.transaction(async (tx) => {
    // Locked and matched on the cursor this pass read, so a skip or another
    // pass that moved it meanwhile wins and this one does nothing.
    const [rule] = await tx
      .select()
      .from(pomodoroRoomRepeats)
      .where(
        and(
          eq(pomodoroRoomRepeats.id, seen.id),
          isNull(pomodoroRoomRepeats.cancelledAt),
          eq(pomodoroRoomRepeats.nextStartsAt, seen.nextStartsAt!)
        )
      )
      .for("update")
      .limit(1)
    if (!rule?.nextStartsAt) return false

    let made = false
    if (day && recipients && allowed) {
      const room = await writeBooking(
        tx,
        rule.hostUserId,
        randomBytes(18).toString("base64url"),
        {
          name: rule.name,
          visibility: rule.visibility as RoomSettings["visibility"],
          focusMinutes: rule.focusMinutes,
          shortBreakMinutes: rule.shortBreakMinutes,
          longBreakMinutes: rule.longBreakMinutes,
          autoStart: rule.autoStart,
          // A rule saved before rooms carried a pair has none; its rooms
          // draw the default scene with no sound, like any older room.
          sound: rule.sound,
          background: rule.background,
          startsAt: day.startsAt,
          invites: rule.invites,
          repeat: { id: rule.id, occurrenceDate: day.date },
        },
        recipients
      )
      made = room !== null
    }
    // Move on from whichever is later, the day just handled or now, so a rule
    // that fell behind catches up in one step instead of booking the past.
    const from = rule.nextStartsAt > timestamp ? rule.nextStartsAt : timestamp
    await tx
      .update(pomodoroRoomRepeats)
      .set({ nextStartsAt: nextRoomOccurrence(rule, from)?.startsAt ?? null, updatedAt: timestamp })
      .where(eq(pomodoroRoomRepeats.id, rule.id))
    return made
  })
}

/** The rule's day that starts at exactly `startsAt`, worked out again from the rule. */
function occurrenceAt(rule: PomodoroRoomRepeat, startsAt: Date) {
  const day = nextRoomOccurrence(rule, new Date(startsAt.getTime() - 1))
  return day && day.startsAt.getTime() === startsAt.getTime() ? day : null
}

async function mayHost(userId: string, database: CustomShellDb) {
  try {
    await requirePomodoroPerk(userId, "hostRooms", database)
    return true
  } catch {
    return false
  }
}

export type MyRoomRepeat = {
  id: string
  name: string
  visibility: string
  label: string
  timezone: string
  inviteCount: number
  /** The next day that will happen, after any skipped one. */
  nextStartsAt: Date | null
  /** Whether that day already has its room under Upcoming. */
  nextIsBooked: boolean
  /** The pair every room the rule books opens with. */
  sound: string | null
  background: string | null
}

/** The host's own live weekly rules, soonest first. */
export async function listMyRoomRepeats(
  userId: string,
  database: CustomShellDb = db
): Promise<MyRoomRepeat[]> {
  const rules = await database
    .select()
    .from(pomodoroRoomRepeats)
    .where(and(eq(pomodoroRoomRepeats.hostUserId, userId), isNull(pomodoroRoomRepeats.cancelledAt)))
    .orderBy(asc(pomodoroRoomRepeats.nextStartsAt))
    .limit(MAX_ROOM_REPEATS_PER_HOST * 2)
  const ids = rules.map((rule) => rule.id)
  const bookedRows = ids.length
    ? await database
        .select({ repeatId: rooms.repeatId, startsAt: rooms.startsAt })
        .from(rooms)
        .where(and(inArray(rooms.repeatId, ids), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`))
    : []
  const bookedByRule = new Map(bookedRows.map((row) => [row.repeatId, row.startsAt]))
  return rules.map((rule) => {
    const bookedAt = bookedByRule.get(rule.id) ?? null
    return {
      id: rule.id,
      name: rule.name,
      visibility: rule.visibility,
      label: describeRoomRepeat(rule.weekdays, rule.startMinute),
      timezone: rule.timezone,
      inviteCount: rule.invites.length,
      nextStartsAt: bookedAt ?? rule.nextStartsAt,
      nextIsBooked: Boolean(bookedAt),
      sound: rule.sound,
      background: rule.background,
    }
  })
}

/**
 * Cancel this week: the series stays and only its next day is called off.
 *
 * When that day already has its room, the room is cancelled the way any
 * booking is, invitations and all. When it does not yet, the rule's cursor
 * moves past it, so the worker never books it.
 */
export async function skipNextRoomRepeat(
  userId: string,
  repeatId: string,
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  return database.transaction(async (tx) => {
    const rule = await lockOwnRule(tx, userId, repeatId)
    const [booked] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.repeatId, rule.id), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`))
      .orderBy(asc(rooms.startsAt))
      .for("update")
      .limit(1)
    if (booked?.startsAt) {
      const cancelledInvites = await closeBookedRoom(tx, booked, timestamp)
      return { skippedStartsAt: booked.startsAt, cancelledInvites }
    }
    if (!rule.nextStartsAt) throw new Error("ROOM_REPEAT_NO_OCCURRENCE")
    const skipped = rule.nextStartsAt
    const from = skipped > timestamp ? skipped : timestamp
    await tx
      .update(pomodoroRoomRepeats)
      .set({ nextStartsAt: nextRoomOccurrence(rule, from)?.startsAt ?? null, updatedAt: timestamp })
      .where(eq(pomodoroRoomRepeats.id, rule.id))
    return { skippedStartsAt: skipped, cancelledInvites: 0 }
  })
}

/**
 * Cancel the series: no more days are booked, and a day already booked but
 * not yet open is cancelled with it. Rooms that already ran, or are running
 * now, are not touched.
 */
export async function cancelRoomRepeat(
  userId: string,
  repeatId: string,
  database: CustomShellDb = db,
  timestamp = new Date()
) {
  return database.transaction(async (tx) => {
    const rule = await lockOwnRule(tx, userId, repeatId)
    await tx
      .update(pomodoroRoomRepeats)
      .set({ cancelledAt: timestamp, nextStartsAt: null, updatedAt: timestamp })
      .where(eq(pomodoroRoomRepeats.id, rule.id))
    const booked = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.repeatId, rule.id), eq(rooms.phase, "scheduled"), sql`${rooms.closedAt} is null`))
      .for("update")
    let cancelledInvites = 0
    for (const room of booked) cancelledInvites += await closeBookedRoom(tx, room, timestamp)
    return { name: rule.name, cancelledRooms: booked.length, cancelledInvites }
  })
}

async function lockOwnRule(tx: PomoderTransaction, userId: string, repeatId: string) {
  const [rule] = await tx
    .select()
    .from(pomodoroRoomRepeats)
    .where(eq(pomodoroRoomRepeats.id, repeatId))
    .for("update")
    .limit(1)
  // Somebody else's rule answers the same as no rule, so an id cannot be
  // probed for whether it exists.
  if (!rule || rule.hostUserId !== userId) throw new Error("ROOM_REPEAT_NOT_FOUND")
  if (rule.cancelledAt) throw new Error("ROOM_REPEAT_CANCELLED")
  return rule
}
