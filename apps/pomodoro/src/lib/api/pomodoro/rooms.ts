import { randomBytes } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { findCurrentUser } from "@/server/auth/security"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { requirePomodoroPerk } from "@/server/pomodoro/entitlements"
import {
  applyHostRoomAction,
  createRoomWithHost,
  findActiveRoomId,
  joinRoomBySlug,
  leaveRoom,
  listPublicRooms,
  lookupRoomBySlug,
  notifyRoom,
  roomSnapshot,
  type RoomHostAction,
} from "@/server/pomodoro/rooms"

/**
 * The rooms endpoints, ported from the old app. No delayed-job queue here:
 * a host action commits the phase and broadcasts it, and the shell's
 * fifteen-second worker advances expired phases (advanceDueRooms), so no
 * enqueue follows an action. Hosting is Pro (requirePomodoroPerk).
 *
 * The public list and the invite lookup show member counts, never names —
 * the old privacy rule after a real leak — and the lookup works signed out
 * so the invite page can prompt guests to sign in.
 */

const createRoomSchema = z.object({
  name: z.string().trim().min(2).max(80),
  visibility: z.enum(["public", "unlisted"]),
  focusMinutes: z.number().int().min(1).max(90).default(25),
  shortBreakMinutes: z.number().int().min(1).max(90).default(5),
  longBreakMinutes: z.number().int().min(1).max(90).default(15),
  autoStart: z.boolean().default(false),
})
const slugSchema = z.object({ slug: z.string().min(12).max(80) })
const actionSchema = slugSchema.extend({
  action: z.enum(["start_focus", "start_break", "next_phase", "close"]),
})

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
    return roomSnapshot(room.id, context.user.id)
  })

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

export const listRooms = () => listRoomsFn()
export const getCurrentRoom = () => currentRoomFn()
export const lookupRoom = (slug: string) => lookupRoomFn({ data: { slug } })
export const createRoom = (data: z.infer<typeof createRoomSchema>) =>
  createRoomFn({ data })
export const joinRoom = (slug: string) => joinRoomFn({ data: { slug } })
export const leaveActiveRoom = (slug: string) =>
  leaveRoomFn({ data: { slug } })
export const applyRoomAction = (slug: string, action: RoomHostAction) =>
  roomActionFn({ data: { slug, action } })
