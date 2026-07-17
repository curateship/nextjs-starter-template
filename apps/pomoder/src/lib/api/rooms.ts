import { randomBytes } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { getEntitlements } from "@/server/entitlements"
import { requireAppOrigin } from "@/server/origin"
import { enforceRateLimit } from "@/server/rate-limit"
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
} from "@/server/rooms"
import { enqueueRoomTransition } from "@/server/queue"
import { roomMemberships, roomMessages, rooms, subscriptions } from "@/server/schema"
import { findCurrentUser, requireUser } from "@/server/security"

const createRoomSchema = z.object({ name: z.string().trim().min(2).max(80), visibility: z.enum(["public", "unlisted"]), focusMinutes: z.number().int().min(1).max(90).default(25), shortBreakMinutes: z.number().int().min(1).max(90).default(5), longBreakMinutes: z.number().int().min(1).max(90).default(15), autoStart: z.boolean().default(false) })
const slugSchema = z.object({ slug: z.string().min(12).max(80) })
const messageSchema = slugSchema.extend({ body: z.string().trim().min(1).max(500) })
const actionSchema = slugSchema.extend({ action: z.enum(["start_focus", "start_break", "next_phase", "close"]) })

const listRoomsFn = createServerFn({ method: "GET" }).handler(async () => listPublicRooms())

const currentRoomFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await findCurrentUser()
  if (!user) return null
  const roomId = await findActiveRoomId(user.id)
  return roomId ? roomSnapshot(roomId, user.id) : null
})

const lookupRoomFn = createServerFn({ method: "GET" }).inputValidator(slugSchema).handler(async ({ data }) => {
  const user = await findCurrentUser()
  return lookupRoomBySlug(data.slug, user?.id ?? null)
})

const createRoomFn = createServerFn({ method: "POST" }).inputValidator(createRoomSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  if (!getEntitlements(subscription || null).canHostRooms) throw new Error("PRO_REQUIRED")
  const slug = randomBytes(18).toString("base64url")
  const { room, closedRoomIds } = await createRoomWithHost(user.id, slug, data)
  for (const closedRoomId of closedRoomIds) await notifyRoom(closedRoomId, "phase")
  return roomSnapshot(room.id, user.id)
})

const joinRoomFn = createServerFn({ method: "POST" }).inputValidator(slugSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  await enforceRateLimit(`room-join:${user.id}`, { maxAttempts: 20, windowSeconds: 60 })
  const { room, closedRoomIds } = await joinRoomBySlug(data.slug, user.id)
  for (const closedRoomId of closedRoomIds) await notifyRoom(closedRoomId, "phase")
  await notifyRoom(room.id, "membership")
  return roomSnapshot(room.id, user.id)
})

const leaveRoomFn = createServerFn({ method: "POST" }).inputValidator(slugSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const { room, closed, left } = await leaveRoom(data.slug, user.id)
  // Only broadcast when a membership actually ended; otherwise anyone with a
  // slug could ping the room's channel by spamming leave.
  if (closed || left) await notifyRoom(room.id, closed ? "phase" : "membership")
  return { closed }
})

const roomActionFn = createServerFn({ method: "POST" }).inputValidator(actionSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const { room, transitionAt } = await applyHostRoomAction(data.slug, user.id, data.action)
  // Broadcast the committed phase before scheduling the follow-up job so
  // members see accurate state even if scheduling fails.
  await notifyRoom(room.id, "phase")
  if (transitionAt) await enqueueRoomTransition(room.id, room.sequence, transitionAt)
  return roomSnapshot(room.id, user.id)
})

const sendMessageFn = createServerFn({ method: "POST" }).inputValidator(messageSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [room] = await db.select().from(rooms).where(eq(rooms.slug, data.slug)).limit(1)
  if (!room) throw new Error("ROOM_NOT_FOUND")
  const membership = await db.select({ id: roomMemberships.id }).from(roomMemberships).where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, user.id), sql`${roomMemberships.leftAt} is null`)).limit(1)
  if (!membership.length) throw new Error("ROOM_MEMBERSHIP_REQUIRED")
  await enforceRateLimit(`room-chat:${room.id}:${user.id}`, { maxAttempts: 20, windowSeconds: 60 })
  const [message] = await db.insert(roomMessages).values({ roomId: room.id, userId: user.id, body: data.body }).returning({ id: roomMessages.id, body: roomMessages.body, createdAt: roomMessages.createdAt })
  await notifyRoom(room.id, "message")
  return message
})

export const listRooms = () => listRoomsFn()
export const getCurrentRoom = () => currentRoomFn()
export const lookupRoom = (slug: string) => lookupRoomFn({ data: { slug } })
export const createRoom = (data: z.infer<typeof createRoomSchema>) => createRoomFn({ data })
export const joinRoom = (slug: string) => joinRoomFn({ data: { slug } })
export const leaveActiveRoom = (slug: string) => leaveRoomFn({ data: { slug } })
export const sendRoomMessage = (slug: string, body: string) => sendMessageFn({ data: { slug, body } })
export const applyRoomAction = (slug: string, action: RoomHostAction) => roomActionFn({ data: { slug, action } })
