import { and, eq, sql } from "drizzle-orm"

import { db, pool } from "@/server/db"
import { roomBans, roomMemberships, roomMessages, rooms } from "@/server/schema"

export type RoomPhase = "waiting" | "focus" | "short" | "long" | "closed"
export function canJoinRoom(phase: string) { return ["waiting", "short", "long"].includes(phase) }

export async function roomSnapshot(roomId: string, userId: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  if (!room) throw new Error("ROOM_NOT_FOUND")
  const membership = await db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`)).limit(1)
  if (!membership.length) throw new Error("ROOM_MEMBERSHIP_REQUIRED")
  const [members, messages] = await Promise.all([
    db.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), sql`${roomMemberships.leftAt} is null`)),
    db.select().from(roomMessages).where(and(eq(roomMessages.roomId, roomId), sql`${roomMessages.deletedAt} is null`)).orderBy(roomMessages.createdAt).limit(100),
  ])
  return { room, members, messages }
}

export async function notifyRoom(roomId: string, event: string) {
  const channel = roomChannel(roomId)
  await pool.query(`select pg_notify($1, $2)`, [channel, event])
}

export async function assertNotBanned(roomId: string, userId: string) {
  const banned = await db.select({ id: roomBans.id }).from(roomBans).where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId))).limit(1)
  if (banned.length) throw new Error("ROOM_BANNED")
}

export function roomChannel(roomId: string) { return `pomoder_room_${roomId.replaceAll("-", "")}` }
