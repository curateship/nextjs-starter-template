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
import { requirePomodoroPerk } from "@/server/pomodoro/entitlements"
import {
  applyHostRoomAction,
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
  toggleRoomReaction,
  type RoomHostAction,
} from "@/server/pomodoro/rooms"
import { ROOM_REACTION_EMOJIS } from "@/lib/pomodoro/room-reactions"
import {
  cancelScheduledRoom,
  countScheduledRoomsHostedBy,
  listUpcomingRooms,
  scheduleRoomWithInvites,
} from "@/server/pomodoro/scheduled-rooms"
import {
  parseInviteEmails,
  scheduleProblem,
  scheduleProblemMessage,
} from "@/lib/pomodoro/scheduled-rooms"

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

const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  visibility: z.enum(["public", "unlisted"]),
  focusMinutes: z.number().int().min(1).max(90).default(25),
  shortBreakMinutes: z.number().int().min(1).max(90).default(5),
  longBreakMinutes: z.number().int().min(1).max(90).default(15),
  autoStart: z.boolean().default(false),
})
// A booking is the same room settings plus when it opens and who to tell.
// The time arrives as an ISO instant, so the host's clock and the server's
// never have to agree about what "7pm" means.
const scheduleRoomSchema = createRoomSchema.extend({
  startsAt: z.string().datetime({ offset: true }),
  // Twenty addresses at the column's full 254 characters, plus separators.
  // The friendlier "that is too many people" answer comes from
  // scheduleProblem; this only stops a caller posting a novel.
  invitesTyped: z.string().max(6_000).default(""),
})
const slugSchema = z.object({ slug: z.string().min(12).max(80) })
const actionSchema = slugSchema.extend({
  action: z.enum(["start_focus", "start_break", "next_phase", "close"]),
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

const listRoomsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => listPublicRooms())

const currentRoomFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const roomId = await findActiveRoomId(context.user.id)
    return roomId ? roomSnapshot(roomId, context.user.id) : null
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
    const problem = scheduleProblem(startsAt, invites, new Date())
    if (problem) throw new Error(`SCHEDULE_REJECTED: ${scheduleProblemMessage(problem)}`)

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
    return roomSnapshot(room.id, context.user.id)
  })

const sendMessageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(messageSchema)
  .handler(async ({ data, context }) => {
    const { roomId } = await postRoomMessage(
      data.slug,
      context.user.id,
      data.body
    )
    await notifyRoom(roomId, "message")
    return { sent: true }
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
export const getCurrentRoom = () => currentRoomFn()
export const lookupRoom = (slug: string) => lookupRoomFn({ data: { slug } })
export const createRoom = (data: z.infer<typeof createRoomSchema>) =>
  createRoomFn({ data })
export const scheduleRoom = (data: z.infer<typeof scheduleRoomSchema>) =>
  scheduleRoomFn({ data })
export const listUpcoming = () => upcomingRoomsFn()
export const cancelBookedRoom = (slug: string) =>
  cancelScheduledRoomFn({ data: { slug } })
export const joinRoom = (slug: string) => joinRoomFn({ data: { slug } })
export const leaveActiveRoom = (slug: string) =>
  leaveRoomFn({ data: { slug } })
export const applyRoomAction = (slug: string, action: RoomHostAction) =>
  roomActionFn({ data: { slug, action } })
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
