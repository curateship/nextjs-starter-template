import { randomBytes } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { getEntitlements } from "@/server/entitlements"
import { requireAppOrigin } from "@/server/origin"
import { enforceRateLimit } from "@/server/rate-limit"
import { assertNotBanned, canJoinRoom, notifyRoom, roomSnapshot } from "@/server/rooms"
import { roomMemberships, roomMessages, rooms, subscriptions, users } from "@/server/schema"
import { requireUser } from "@/server/security"

const createRoomSchema = z.object({ name: z.string().trim().min(2).max(80), visibility: z.enum(["public", "unlisted"]), focusMinutes: z.number().int().min(1).max(90).default(25), shortBreakMinutes: z.number().int().min(1).max(90).default(5), longBreakMinutes: z.number().int().min(1).max(90).default(15), autoStart: z.boolean().default(false) })
const slugSchema = z.object({ slug: z.string().min(12).max(80) })
const messageSchema = slugSchema.extend({ body: z.string().trim().min(1).max(500) })
const phaseSchema = slugSchema.extend({ phase: z.enum(["waiting", "focus", "short", "long", "closed"]) })

const listRoomsFn = createServerFn({ method: "GET" }).handler(async () => db
  .select({ room: getTableColumns(rooms), hostName: users.name, memberCount: sql<number>`count(${roomMemberships.id})::int` })
  .from(rooms)
  .innerJoin(users, eq(rooms.hostUserId, users.id))
  .leftJoin(roomMemberships, and(eq(roomMemberships.roomId, rooms.id), sql`${roomMemberships.leftAt} is null`))
  .where(and(eq(rooms.visibility, "public"), sql`${rooms.closedAt} is null`))
  .groupBy(rooms.id, users.name)
  .orderBy(desc(rooms.createdAt))
  .limit(50))

const createRoomFn = createServerFn({ method: "POST" }).inputValidator(createRoomSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1)
  if (!getEntitlements(subscription || null).canHostRooms) throw new Error("PRO_REQUIRED")
  const slug = randomBytes(18).toString("base64url")
  const room = await db.transaction(async (tx) => {
    await tx.update(roomMemberships).set({ leftAt: new Date() }).where(and(eq(roomMemberships.userId, user.id), sql`${roomMemberships.leftAt} is null`))
    const [created] = await tx.insert(rooms).values({ ...data, hostUserId: user.id, slug }).returning()
    await tx.insert(roomMemberships).values({ roomId: created.id, userId: user.id, role: "host" })
    return created
  })
  return roomSnapshot(room.id, user.id)
})

const joinRoomFn = createServerFn({ method: "POST" }).inputValidator(slugSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [room] = await db.select().from(rooms).where(eq(rooms.slug, data.slug)).limit(1)
  if (!room || room.closedAt) throw new Error("ROOM_NOT_FOUND")
  if (!canJoinRoom(room.phase)) throw new Error("ROOM_LOCKED")
  await assertNotBanned(room.id, user.id)
  await db.transaction(async (tx) => {
    await tx.update(roomMemberships).set({ leftAt: new Date() }).where(and(eq(roomMemberships.userId, user.id), sql`${roomMemberships.leftAt} is null`))
    await tx.insert(roomMemberships).values({ roomId: room.id, userId: user.id }).onConflictDoNothing()
  })
  await notifyRoom(room.id, "membership")
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
  const [message] = await db.insert(roomMessages).values({ roomId: room.id, userId: user.id, body: data.body }).returning()
  await notifyRoom(room.id, "message")
  return message
})

const setPhaseFn = createServerFn({ method: "POST" }).inputValidator(phaseSchema).handler(async ({ data }) => {
  requireAppOrigin()
  const user = await requireUser()
  const [room] = await db.select().from(rooms).where(and(eq(rooms.slug, data.slug), eq(rooms.hostUserId, user.id))).limit(1)
  if (!room) throw new Error("ROOM_NOT_FOUND")
  const duration = data.phase === "focus" ? room.focusMinutes : data.phase === "short" ? room.shortBreakMinutes : data.phase === "long" ? room.longBreakMinutes : 0
  const timestamp = new Date()
  const [updated] = await db.update(rooms).set({ phase: data.phase, sequence: room.sequence + 1, phaseStartedAt: duration ? timestamp : null, phaseEndsAt: duration ? new Date(timestamp.getTime() + duration * 60_000) : null, closedAt: data.phase === "closed" ? timestamp : null, updatedAt: timestamp }).where(eq(rooms.id, room.id)).returning()
  await notifyRoom(room.id, "phase")
  return updated
})

export const listRooms = () => listRoomsFn()
export const createRoom = (data: z.infer<typeof createRoomSchema>) => createRoomFn({ data })
export const joinRoom = (slug: string) => joinRoomFn({ data: { slug } })
export const sendRoomMessage = (slug: string, body: string) => sendMessageFn({ data: { slug, body } })
export const setRoomPhase = (slug: string, phase: z.infer<typeof phaseSchema>["phase"]) => setPhaseFn({ data: { slug, phase } })
