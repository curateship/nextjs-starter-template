import { randomBytes } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { findCurrentUser } from "@/server/auth/security"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import {
  awardAchievements,
  loadLifetimeTotals,
} from "@/server/pomodoro/achievements"
import {
  loadPomodoroEntitlements,
  requirePomodoroPerk,
} from "@/server/pomodoro/entitlements"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { listRoomPresets } from "@/server/pomodoro/admin-rooms"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { markRoomNoticesRead } from "@/server/pomodoro/notices"
import {
  applyHostRoomAction,
  scheduleCountdownEnd,
  setRoomStartDelay,
  banRoomMember,
  createRoomWithHost,
  deleteRoomMessage,
  findActiveRoomId,
  joinRoomBySlug,
  leaveRoom,
  listPublicRooms,
  lookupRoomBySlug,
  notifyRoom,
  postRoomMessage,
  removeRoomMember,
  reportRoomMessage,
  roomSnapshot,
  saveRoomMedia,
  toggleRoomReaction,
  type RoomHostAction,
} from "@/server/pomodoro/rooms"
import { REAL_START_DELAY_MS, startDueRoom } from "@/server/pomodoro/simulated-rooms"
import { isStartDelay } from "@/lib/pomodoro/room-countdown"
import { ROOM_REACTION_EMOJIS } from "@/lib/pomodoro/room-reactions"
import {
  pairUsesPro,
  roomPairProblem,
  roomPairProblemMessage,
} from "@/lib/pomodoro/media-pair"
import {
  cancelRoomRepeat,
  cancelScheduledRoom,
  countScheduledRoomsHostedBy,
  createRoomRepeat,
  listMyRoomRepeats,
  listUpcomingRooms,
  scheduleRoomWithInvites,
  skipNextRoomRepeat,
} from "@/server/pomodoro/scheduled-rooms"
import { validTimezone } from "@/server/pomodoro/profile"
import {
  parseInviteEmails,
  scheduleProblem,
  scheduleProblemMessage,
} from "@/lib/pomodoro/scheduled-rooms"
import {
  roomRepeatProblem,
  roomRepeatProblemMessage,
} from "@/lib/pomodoro/room-repeats"

/**
 * The rooms endpoints, ported from the old app. No delayed-job queue here:
 * a host action commits the phase and broadcasts it, and the shell's
 * fifteen-second worker advances expired phases (advanceDueRooms), so no
 * enqueue follows an action. Hosting is Pro (requirePomodoroPerk).
 *
 * The public list and the invite lookup show member counts, never names —
 * the old privacy rule after a real leak — and the lookup works signed out
 * so the invite page can prompt guests to sign in.
 *
 * Chat, reactions, reports and the host's moderation all sit behind the same
 * userPost guard. Each one re-checks membership or host rights in
 * src/server/pomodoro/rooms.ts before it touches a rate limit, so a stranger
 * holding a slug cannot spend a member's budget.
 */

const INVITES_TYPED_MAX = 200 * 80

const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  visibility: z.enum(["public", "unlisted"]),
  focusMinutes: z.number().int().min(1).max(90).default(25),
  shortBreakMinutes: z.number().int().min(1).max(90).default(5),
  longBreakMinutes: z.number().int().min(1).max(90).default(15),
  autoStart: z.boolean().default(false),
  // The pair everyone in the room gets. Required; checked by assertRoomPair.
  sound: z.string().max(200),
  background: z.string().max(200),
})
// A booking is the same room settings plus when it opens and who to tell.
// The time arrives as an ISO instant, so the host's clock and the server's
// never have to agree about what "7pm" means.
const scheduleRoomSchema = createRoomSchema.extend({
  startsAt: z.string().datetime({ offset: true }),
  // The most invitations the room limits allow (200) at a long address each,
  // plus separators. The friendlier "that is too many people" answer comes
  // from scheduleProblem; this only stops a caller posting a novel.
  invitesTyped: z.string().max(INVITES_TYPED_MAX).default(""),
})
// A weekly room: the same settings, the days as the task repeats' seven-bit
// set, and the time as minutes after midnight on the clock of the device it
// was typed on, the same clock a one-off booking's date and time is read on.
const repeatRoomSchema = createRoomSchema.extend({
  weekdays: z.number().int().min(1).max(127),
  startMinute: z.number().int().min(0).max(1439),
  timezone: z.string().min(1).max(80),
  invitesTyped: z.string().max(INVITES_TYPED_MAX).default(""),
})
const repeatIdSchema = z.object({ repeatId: z.string().uuid() })
const slugSchema = z.object({ slug: z.string().min(12).max(80) })
const actionSchema = slugSchema.extend({
  action: z.enum(["start_focus", "start_break", "next_phase", "close", "cancel_start"]),
})
const startDelaySchema = slugSchema.extend({
  seconds: z.number().int().refine(isStartDelay),
})
const messageSchema = slugSchema.extend({
  body: z.string().trim().min(1).max(500),
})
const messageIdSchema = slugSchema.extend({ messageId: z.string().uuid() })
const reactionSchema = messageIdSchema.extend({
  emoji: z.enum(ROOM_REACTION_EMOJIS),
})
const reportSchema = messageIdSchema.extend({
  reason: z.string().trim().min(3).max(300),
})
const memberSchema = slugSchema.extend({ membershipId: z.string().uuid() })
const roomMediaSchema = slugSchema.extend({
  sound: z.string().max(200),
  background: z.string().max(200),
})

/**
 * Every room, booking and weekly rule needs a catalogue sound and a catalogue
 * theme. A host who cannot use Pro media cannot hand it to a room either,
 * although hosting is already Pro, so in practice this only ever fires on a
 * hand-made request.
 */
async function assertRoomPair(
  userId: string,
  pair: { sound: string; background: string }
) {
  const catalog = await loadMediaCatalog()
  const problem = roomPairProblem(catalog, pair.sound, pair.background)
  if (problem) throw new Error(`ROOM_PAIR_REJECTED: ${roomPairProblemMessage(problem)}`)
  if (pairUsesPro(catalog, pair.sound, pair.background)) {
    const entitlements = await loadPomodoroEntitlements(userId)
    if (!entitlements.canUsePremiumMedia)
      throw new Error("UPGRADE_REQUIRED:premiumMedia")
  }
}

/**
 * What the host window needs before a room is made: the house presets an
 * admin keeps (admin task 04) and the invite limit, so the window checks the
 * same number the server will.
 */
const hostingOptionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => {
    const [presets, settings] = await Promise.all([listRoomPresets(), loadAppSettings()])
    return { presets, maxInvitesPerRoom: settings["rooms.limits"].maxInvitesPerRoom }
  })

const listRoomsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listPublicRooms(context.user.id))

/**
 * The same list for somebody not signed in: no account names (see
 * `listPublicRooms`). Needs no sign-in, so one copy is kept for 15 seconds
 * and shared by every visitor, however often the page asks.
 */
let guestRooms: { at: number; rows: Promise<Awaited<ReturnType<typeof listPublicRooms>>> } | null = null
const listGuestRoomsFn = createServerFn({ method: "GET" }).handler(() => {
  if (!guestRooms || Date.now() - guestRooms.at > 15_000) {
    const rows = listPublicRooms(null)
    guestRooms = { at: Date.now(), rows }
    // A failed read is not kept, so the next visitor tries again.
    rows.catch(() => {
      if (guestRooms?.rows === rows) guestRooms = null
    })
  }
  return guestRooms.rows
})

/**
 * Marks a room's bell notices read, and never stands between somebody and the
 * room. The marking is bookkeeping: a failure is logged and the room opens
 * anyway, with the notices still unread in the bell.
 */
async function clearRoomNotices(userId: string, roomId: string) {
  try {
    await markRoomNoticesRead(userId, roomId)
  } catch (error) {
    console.error("room notices could not be marked read", error)
  }
}

const currentRoomFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const roomId = await findActiveRoomId(context.user.id)
    if (!roomId) return null
    // The Rooms page opening on your room is you opening it, so the bell's
    // notices about it are read. See `workspace/docs/notifications.md`.
    await clearRoomNotices(context.user.id, roomId)
    return roomSnapshot(roomId, context.user.id)
  })

// Signed-out on purpose: the invite page names the room and prompts guests
// to sign in. It answers with a status, a name and a member count — nothing
// personal — and lives in appOpenEndpoints for the guard test.
const lookupRoomFn = createServerFn({ method: "GET" })
  .inputValidator(slugSchema)
  .handler(async ({ data }) => {
    const user = await findCurrentUser()
    return lookupRoomBySlug(data.slug, user?.id ?? null)
  })

const createRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createRoomSchema)
  .handler(async ({ data, context }) => {
    await requirePomodoroPerk(context.user.id, "hostRooms")
    await assertRoomPair(context.user.id, data)
    const slug = randomBytes(18).toString("base64url")
    const { room, closedRoomIds } = await createRoomWithHost(
      context.user.id,
      slug,
      data
    )
    for (const closedRoomId of closedRoomIds)
      await notifyRoom(closedRoomId, "phase")
    // Opening a room is the other moment a badge counter moves. The room is
    // already committed, so a failed award must not take the room down with
    // it; the next finished focus checks the same badges again.
    await awardRoomsHosted(context.user.id)
    return roomSnapshot(room.id, context.user.id)
  })

/** One person may have this many rooms booked and not yet opened. */
const MAX_SCHEDULED_ROOMS_PER_HOST = 10

/**
 * Books a room for later. Hosting is Pro, so booking is too.
 *
 * The clock is the server's: the host's chosen instant is checked against
 * `new Date()` here, not against anything the browser said the time was. The
 * addresses are parsed and checked by the same rules the dialog used, so a
 * request that skipped the dialog cannot queue a thousand emails.
 */
const scheduleRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(scheduleRoomSchema)
  .handler(async ({ data, context }) => {
    await requirePomodoroPerk(context.user.id, "hostRooms")
    await assertRoomPair(context.user.id, data)
    // Every booking costs an attempt whether or not it emails anyone, and the
    // limit comes before the reads below so a burst cannot spend the
    // database on requests that were never going to be allowed.
    await enforceRateLimit(`room-schedule:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 3_600,
    })

    const { startsAt: startsAtText, invitesTyped, ...settings } = data
    const startsAt = new Date(startsAtText)
    const invites = parseInviteEmails(invitesTyped)
    const { maxInvitesPerRoom } = (await loadAppSettings())["rooms.limits"]
    const problem = scheduleProblem(startsAt, invites, new Date(), maxInvitesPerRoom)
    if (problem)
      throw new Error(`SCHEDULE_REJECTED: ${scheduleProblemMessage(problem, maxInvitesPerRoom)}`)

    if ((await countScheduledRoomsHostedBy(context.user.id)) >= MAX_SCHEDULED_ROOMS_PER_HOST) {
      throw new Error(
        `SCHEDULE_REJECTED: You already have ${MAX_SCHEDULED_ROOMS_PER_HOST} rooms booked. Cancel one to book another.`
      )
    }

    const slug = randomBytes(18).toString("base64url")
    const room = await scheduleRoomWithInvites(context.user.id, slug, {
      ...settings,
      startsAt,
      invites,
    })
    return { slug: room.slug, name: room.name, startsAt: room.startsAt, invited: invites.length }
  })

/**
 * Saves a room that repeats every week. Hosting is Pro, so this is too, and
 * it spends the same hourly booking allowance a one-off booking does.
 *
 * The days and time are read on the timezone of the device the host typed
 * them on, because that is the clock they were looking at. The invitation
 * email still writes the time in the host's profile timezone and names it,
 * so the instant agrees even when the two zones differ.
 */
const repeatRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(repeatRoomSchema)
  .handler(async ({ data, context }) => {
    await requirePomodoroPerk(context.user.id, "hostRooms")
    await assertRoomPair(context.user.id, data)
    await enforceRateLimit(`room-schedule:${context.user.id}`, {
      maxAttempts: 10,
      windowSeconds: 3_600,
    })
    const { invitesTyped, ...settings } = data
    const invites = parseInviteEmails(invitesTyped)
    const { maxInvitesPerRoom } = (await loadAppSettings())["rooms.limits"]
    const problem = roomRepeatProblem(
      settings.weekdays,
      settings.startMinute,
      invites,
      maxInvitesPerRoom
    )
    if (problem)
      throw new Error(
        `SCHEDULE_REJECTED: ${roomRepeatProblemMessage(problem, maxInvitesPerRoom)}`
      )
    if (!validTimezone(settings.timezone)) {
      throw new Error("SCHEDULE_REJECTED: This device's timezone is not one we recognise. Set a timezone in Settings and try again.")
    }

    try {
      const { rule, next } = await createRoomRepeat(context.user.id, {
        ...settings,
        invites,
      })
      return { name: rule.name, timezone: rule.timezone, nextStartsAt: next.startsAt }
    } catch (cause) {
      if (cause instanceof Error && cause.message === "ROOM_REPEAT_LIMIT") {
        const { maxRepeatsPerHost } = (await loadAppSettings())["rooms.limits"]
        throw new Error(
          `SCHEDULE_REJECTED: You already have ${maxRepeatsPerHost} weekly rooms. Cancel a series to start another.`
        )
      }
      throw cause
    }
  })

const myRepeatsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listMyRoomRepeats(context.user.id))

const skipRepeatFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(repeatIdSchema)
  .handler(async ({ data, context }) =>
    skipNextRoomRepeat(context.user.id, data.repeatId)
  )

const cancelRepeatFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(repeatIdSchema)
  .handler(async ({ data, context }) =>
    cancelRoomRepeat(context.user.id, data.repeatId)
  )

const upcomingRoomsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listUpcomingRooms(context.user.id))

const cancelScheduledRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(slugSchema)
  .handler(async ({ data, context }) =>
    cancelScheduledRoom(data.slug, context.user.id)
  )

async function awardRoomsHosted(userId: string) {
  try {
    const totals = await loadLifetimeTotals(userId)
    await awardAchievements(userId, {
      ...totals,
      // Hosting moves no streak, so the cheapest safe value is the one that
      // earns no streak badge. A streak badge is awarded on the path that
      // actually changes a streak, which is a focus finishing.
      bestStreak: 0,
    })
  } catch {
    // A badge is never worth failing the action that earned it.
  }
}

const joinRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(slugSchema)
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`room-join:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 60,
    })
    const { room, closedRoomIds } = await joinRoomBySlug(
      data.slug,
      context.user.id
    )
    for (const closedRoomId of closedRoomIds)
      await notifyRoom(closedRoomId, "phase")
    await notifyRoom(room.id, "membership")
    await clearRoomNotices(context.user.id, room.id)
    // A made-up host presses Start about 10 seconds after somebody comes in,
    // unless its countdown is already running. The timer is the fast path;
    // the worker's 15-second pass covers a restart.
    if (room.phase === "waiting") {
      setTimeout(() => {
        startDueRoom(room.id).catch((error) => console.error("a made-up room could not start for a join", error))
      }, REAL_START_DELAY_MS + 500).unref?.()
    }
    return roomSnapshot(room.id, context.user.id)
  })

const leaveRoomFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(slugSchema)
  .handler(async ({ data, context }) => {
    const { room, closed, left } = await leaveRoom(data.slug, context.user.id)
    // Only broadcast when a membership actually ended; otherwise anyone
    // with a slug could ping the room's channel by spamming leave.
    if (closed || left)
      await notifyRoom(room.id, closed ? "phase" : "membership")
    return { closed }
  })

const roomActionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(actionSchema)
  .handler(async ({ data, context }) => {
    const { room } = await applyHostRoomAction(
      data.slug,
      context.user.id,
      data.action
    )
    await notifyRoom(room.id, "phase")
    // A "Starting in" countdown began: start the focus the moment it ends.
    // The room clock's 15-second loop covers a server restart.
    if (room.phase === "waiting" && room.startingAt) scheduleCountdownEnd(room.id, room.startingAt)
    return roomSnapshot(room.id, context.user.id)
  })

/** The host picks the room's "Starting in" countdown: 5 seconds, or 1 to 5 minutes. */
const setStartDelayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(startDelaySchema)
  .handler(async ({ data, context }) => {
    const roomId = await setRoomStartDelay(data.slug, context.user.id, data.seconds)
    await notifyRoom(roomId, "phase")
    return roomSnapshot(roomId, context.user.id)
  })

/**
 * The host changes the room's sound and theme from Sounds or Backgrounds.
 * Everybody in the room gets the new pair on the snapshot this sends.
 */
const saveRoomMediaFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(roomMediaSchema)
  .handler(async ({ data, context }) => {
    await assertRoomPair(context.user.id, data)
    const roomId = await saveRoomMedia(data.slug, context.user.id, {
      sound: data.sound,
      background: data.background,
    })
    await notifyRoom(roomId, "media")
    return roomSnapshot(roomId, context.user.id)
  })

const sendMessageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(messageSchema)
  .handler(async ({ data, context }) => {
    const { roomId, held } = await postRoomMessage(
      data.slug,
      context.user.id,
      data.body
    )
    // A held line reaches only its writer, whose own snapshot shows it.
    await notifyRoom(roomId, "message")
    return { sent: true, held }
  })

// Toggling a reaction flips one row; the refreshed counts reach everyone
// through the same SSE snapshot the rest of the room already relies on.
const toggleReactionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reactionSchema)
  .handler(async ({ data, context }) => {
    const { room, added } = await toggleRoomReaction(
      data.slug,
      context.user.id,
      data.messageId,
      data.emoji
    )
    await notifyRoom(room.id, "reaction")
    return { added }
  })

// Reports never notify the room: they are private to the reporter and the
// operators, so nothing changes in anyone else's snapshot.
const reportMessageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(reportSchema)
  .handler(async ({ data, context }) =>
    reportRoomMessage(data.slug, context.user.id, data.messageId, data.reason)
  )

const deleteMessageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(messageIdSchema)
  .handler(async ({ data, context }) => {
    const { room } = await deleteRoomMessage(
      data.slug,
      context.user.id,
      data.messageId
    )
    await notifyRoom(room.id, "message")
    return roomSnapshot(room.id, context.user.id)
  })

const removeMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(memberSchema)
  .handler(async ({ data, context }) => {
    const { room } = await removeRoomMember(
      data.slug,
      context.user.id,
      data.membershipId
    )
    await notifyRoom(room.id, "membership")
    return roomSnapshot(room.id, context.user.id)
  })

const banMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(memberSchema)
  .handler(async ({ data, context }) => {
    const { room } = await banRoomMember(
      data.slug,
      context.user.id,
      data.membershipId
    )
    await notifyRoom(room.id, "membership")
    return roomSnapshot(room.id, context.user.id)
  })

export const listRooms = () => listRoomsFn()
export const listRoomsForGuest = () => listGuestRoomsFn()
export const getCurrentRoom = () => currentRoomFn()
export const lookupRoom = (slug: string) => lookupRoomFn({ data: { slug } })
export const createRoom = (data: z.infer<typeof createRoomSchema>) =>
  createRoomFn({ data })
export const scheduleRoom = (data: z.infer<typeof scheduleRoomSchema>) =>
  scheduleRoomFn({ data })
export const listUpcoming = () => upcomingRoomsFn()
export const repeatRoom = (data: z.infer<typeof repeatRoomSchema>) =>
  repeatRoomFn({ data })
export const listMyRepeats = () => myRepeatsFn()
export const skipNextRepeat = (repeatId: string) =>
  skipRepeatFn({ data: { repeatId } })
export const cancelRepeat = (repeatId: string) =>
  cancelRepeatFn({ data: { repeatId } })
export const cancelBookedRoom = (slug: string) =>
  cancelScheduledRoomFn({ data: { slug } })
export const joinRoom = (slug: string) => joinRoomFn({ data: { slug } })
export const leaveActiveRoom = (slug: string) =>
  leaveRoomFn({ data: { slug } })
export const saveHostedRoomMedia = (
  slug: string,
  pair: { sound: string; background: string }
) => saveRoomMediaFn({ data: { slug, ...pair } })
export const applyRoomAction = (slug: string, action: RoomHostAction) =>
  roomActionFn({ data: { slug, action } })
export const setRoomStartCountdown = (slug: string, seconds: number) =>
  setStartDelayFn({ data: { slug, seconds } })
export const sendRoomMessage = (slug: string, body: string) =>
  sendMessageFn({ data: { slug, body } })
// Callers pass a raw string (from the palette, or from a message's own
// reaction summary); the schema re-checks it against the five allowed emoji,
// so the cast is a boundary detail, not a trusted claim.
export const toggleReaction = (
  slug: string,
  messageId: string,
  emoji: string
) =>
  toggleReactionFn({
    data: {
      slug,
      messageId,
      emoji: emoji as (typeof ROOM_REACTION_EMOJIS)[number],
    },
  })
export const reportMessage = (
  slug: string,
  messageId: string,
  reason: string
) => reportMessageFn({ data: { slug, messageId, reason } })
export const deleteMessage = (slug: string, messageId: string) =>
  deleteMessageFn({ data: { slug, messageId } })
export const removeMember = (slug: string, membershipId: string) =>
  removeMemberFn({ data: { slug, membershipId } })
export const banMember = (slug: string, membershipId: string) =>
  banMemberFn({ data: { slug, membershipId } })
export const loadHostingOptions = () => hostingOptionsFn()
