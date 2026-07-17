import { and, desc, eq, sql } from "drizzle-orm"

import { db, pool, type PomoderDb } from "@/server/db"
import { roomBans, roomMemberships, roomMessages, rooms, users, type Room } from "@/server/schema"

type PomoderTransaction = Parameters<Parameters<PomoderDb["transaction"]>[0]>[0]

export type RoomPhase = "waiting" | "focus" | "short" | "long" | "closed"
export type RoomHostAction = "start_focus" | "start_break" | "next_phase" | "close"

const FOCUS_PERIODS_PER_CYCLE = 4
const TIMED_PHASES: readonly RoomPhase[] = ["focus", "short", "long"]

export function canJoinRoom(phase: string) { return ["waiting", "short", "long"].includes(phase) }

// Every fourth completed focus period earns the long break; the cycle resets
// once the long break ends.
export function breakPhaseAfterFocus(cycleFocusCount: number): RoomPhase {
  return cycleFocusCount + 1 >= FOCUS_PERIODS_PER_CYCLE ? "long" : "short"
}

// What a room becomes when its current timer expires. Breaks always follow
// focus automatically; the next focus only auto-starts when the host enabled
// autoStart, otherwise the room waits for the host.
export function nextTimedPhase(room: Pick<Room, "phase" | "autoStart" | "cycleFocusCount">): RoomPhase | null {
  if (room.phase === "focus") return breakPhaseAfterFocus(room.cycleFocusCount)
  if (room.phase === "short" || room.phase === "long") return room.autoStart ? "focus" : "waiting"
  return null
}

// Hosts move through the canonical sequence only; they cannot jump to an
// arbitrary phase. "next_phase" advances the same way the timer would.
export function resolveHostAction(room: Pick<Room, "phase" | "cycleFocusCount">, action: RoomHostAction): RoomPhase {
  if (action === "close") return "closed"
  if (action === "start_focus") {
    if (!canJoinRoom(room.phase)) throw new Error("ROOM_PHASE_INVALID")
    return "focus"
  }
  if (action === "start_break") {
    if (room.phase !== "focus") throw new Error("ROOM_PHASE_INVALID")
    return breakPhaseAfterFocus(room.cycleFocusCount)
  }
  return room.phase === "focus" ? breakPhaseAfterFocus(room.cycleFocusCount) : "focus"
}

function phaseUpdate(room: Room, nextPhase: RoomPhase, timestamp: Date) {
  const durationMinutes = nextPhase === "focus" ? room.focusMinutes : nextPhase === "short" ? room.shortBreakMinutes : nextPhase === "long" ? room.longBreakMinutes : 0
  const phaseEndsAt = TIMED_PHASES.includes(nextPhase) ? new Date(timestamp.getTime() + durationMinutes * 60_000) : null
  const cycleFocusCount = nextPhase === "closed" ? room.cycleFocusCount
    : room.phase === "focus" ? Math.min(FOCUS_PERIODS_PER_CYCLE, room.cycleFocusCount + 1)
    : room.phase === "long" ? 0
    : room.cycleFocusCount
  return {
    set: {
      phase: nextPhase,
      sequence: room.sequence + 1,
      cycleFocusCount,
      phaseStartedAt: phaseEndsAt ? timestamp : null,
      phaseEndsAt,
      closedAt: nextPhase === "closed" ? timestamp : room.closedAt,
      updatedAt: timestamp,
    },
    transitionAt: phaseEndsAt,
  }
}

export type RoomTransitionResult = { room: Room; transitionAt: Date | null }

export async function applyHostRoomAction(slug: string, userId: string, action: RoomHostAction, database: PomoderDb = db, timestamp = new Date()): Promise<RoomTransitionResult> {
  return database.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.slug, slug)).for("update").limit(1)
    if (!room) throw new Error("ROOM_NOT_FOUND")
    if (room.hostUserId !== userId) throw new Error("ROOM_HOST_REQUIRED")
    if (room.closedAt || room.phase === "closed") throw new Error("ROOM_CLOSED")
    const nextPhase = resolveHostAction(room, action)
    const { set, transitionAt } = phaseUpdate(room, nextPhase, timestamp)
    const [updated] = await tx.update(rooms).set(set).where(eq(rooms.id, room.id)).returning()
    if (nextPhase === "closed") await endActiveMemberships(tx, room.id, timestamp)
    return { room: updated, transitionAt }
  })
}

export type RoomAdvanceResult =
  | { kind: "advanced"; room: Room; transitionAt: Date | null }
  | { kind: "not_due"; phaseEndsAt: Date }
  | { kind: "stale" }

// Applies a queued timed transition. The sequence guard makes stale jobs
// harmless: any manual host action bumps the sequence, so the old job no-ops.
export async function advanceExpiredRoom(roomId: string, sequence: number, database: PomoderDb = db, timestamp = new Date()): Promise<RoomAdvanceResult> {
  return database.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.sequence, sequence))).for("update").limit(1)
    if (!room || !room.phaseEndsAt || room.closedAt) return { kind: "stale" }
    if (room.phaseEndsAt > timestamp) return { kind: "not_due", phaseEndsAt: room.phaseEndsAt }
    const nextPhase = nextTimedPhase(room)
    if (!nextPhase) return { kind: "stale" }
    const { set, transitionAt } = phaseUpdate(room, nextPhase, timestamp)
    const [updated] = await tx.update(rooms).set(set).where(eq(rooms.id, room.id)).returning()
    return { kind: "advanced", room: updated, transitionAt }
  })
}

export type RoomSettings = {
  name: string
  visibility: "public" | "unlisted"
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  autoStart: boolean
}

export async function createRoomWithHost(userId: string, slug: string, settings: RoomSettings, database: PomoderDb = db, timestamp = new Date()) {
  return database.transaction(async (tx) => {
    const closedRoomIds = await closeRoomsHostedBy(tx, userId, timestamp)
    await tx.update(roomMemberships).set({ leftAt: timestamp }).where(and(eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`))
    const [created] = await tx.insert(rooms).values({ ...settings, hostUserId: userId, slug }).returning()
    await tx.insert(roomMemberships).values({ roomId: created.id, userId, role: "host" })
    return { room: created, closedRoomIds }
  })
}

export async function joinRoomBySlug(slug: string, userId: string, database: PomoderDb = db, timestamp = new Date()) {
  // The room is locked and re-checked inside the transaction so a join cannot
  // race a concurrent host action past the closed/focus-lock rules.
  return database.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.slug, slug)).for("update").limit(1)
    if (!room) throw new Error("ROOM_NOT_FOUND")
    if (room.closedAt || room.phase === "closed") throw new Error("ROOM_CLOSED")
    if (!canJoinRoom(room.phase)) throw new Error("ROOM_LOCKED")
    await assertNotBanned(room.id, userId, tx)
    const closedRoomIds = await closeRoomsHostedBy(tx, userId, timestamp, room.id)
    await tx.update(roomMemberships).set({ leftAt: timestamp }).where(and(eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`))
    await tx.insert(roomMemberships).values({ roomId: room.id, userId, role: room.hostUserId === userId ? "host" : "member" }).onConflictDoNothing()
    return { room, closedRoomIds }
  })
}

// A room cannot run without its host, so a host leaving closes the room; a
// member leaving only ends their own membership.
export async function leaveRoom(slug: string, userId: string, database: PomoderDb = db, timestamp = new Date()) {
  return database.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.slug, slug)).for("update").limit(1)
    if (!room) throw new Error("ROOM_NOT_FOUND")
    if (room.hostUserId === userId && !room.closedAt && room.phase !== "closed") {
      const { set } = phaseUpdate(room, "closed", timestamp)
      const [updated] = await tx.update(rooms).set(set).where(eq(rooms.id, room.id)).returning()
      await endActiveMemberships(tx, room.id, timestamp)
      return { room: updated, closed: true, left: true }
    }
    const ended = await tx.update(roomMemberships).set({ leftAt: timestamp }).where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`)).returning({ id: roomMemberships.id })
    return { room, closed: false, left: ended.length > 0 }
  })
}

export async function findActiveRoomId(userId: string, database: PomoderDb = db) {
  const [membership] = await database.select({ roomId: roomMemberships.roomId }).from(roomMemberships).where(and(eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`)).limit(1)
  return membership?.roomId ?? null
}

const displayName = sql<string>`coalesce(${users.publicDisplayName}, ${users.name})`

export async function listPublicRooms(database: PomoderDb = db) {
  return database
    .select({
      room: { id: rooms.id, slug: rooms.slug, name: rooms.name, phase: rooms.phase, phaseEndsAt: rooms.phaseEndsAt, focusMinutes: rooms.focusMinutes, cycleFocusCount: rooms.cycleFocusCount },
      hostName: displayName,
      memberCount: sql<number>`count(${roomMemberships.id})::int`,
    })
    .from(rooms)
    .innerJoin(users, eq(rooms.hostUserId, users.id))
    .leftJoin(roomMemberships, and(eq(roomMemberships.roomId, rooms.id), sql`${roomMemberships.leftAt} is null`))
    .where(and(eq(rooms.visibility, "public"), sql`${rooms.closedAt} is null`))
    .groupBy(rooms.id, users.id)
    .orderBy(desc(rooms.createdAt))
    .limit(50)
}

export type RoomSnapshot = {
  room: {
    slug: string
    name: string
    visibility: string
    phase: string
    sequence: number
    phaseStartedAt: Date | null
    phaseEndsAt: Date | null
    focusMinutes: number
    shortBreakMinutes: number
    longBreakMinutes: number
    autoStart: boolean
    cycleFocusCount: number
    closedAt: Date | null
  }
  you: { role: "host" | "member" }
  members: { id: string; name: string; role: string; avatarIndex: number; joinedAt: Date }[]
  messages: { id: string; body: string; authorName: string; mine: boolean; createdAt: Date }[]
}

// The snapshot is broadcast over SSE, so it carries only what the room UI
// renders: display names, roles, and chat bodies — never account fields.
export async function roomSnapshot(roomId: string, userId: string, database: PomoderDb = db): Promise<RoomSnapshot> {
  const [room] = await database.select().from(rooms).where(eq(rooms.id, roomId)).limit(1)
  if (!room) throw new Error("ROOM_NOT_FOUND")
  const safeRoom = {
    slug: room.slug,
    name: room.name,
    visibility: room.visibility,
    phase: room.phase,
    sequence: room.sequence,
    phaseStartedAt: room.phaseStartedAt,
    phaseEndsAt: room.phaseEndsAt,
    focusMinutes: room.focusMinutes,
    shortBreakMinutes: room.shortBreakMinutes,
    longBreakMinutes: room.longBreakMinutes,
    autoStart: room.autoStart,
    cycleFocusCount: room.cycleFocusCount,
    closedAt: room.closedAt,
  }
  const role: "host" | "member" = room.hostUserId === userId ? "host" : "member"
  if (room.closedAt || room.phase === "closed") {
    return { room: safeRoom, you: { role }, members: [], messages: [] }
  }
  const [membership] = await database.select({ role: roomMemberships.role }).from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`)).limit(1)
  if (!membership) throw new Error("ROOM_MEMBERSHIP_REQUIRED")
  const [memberRows, messageRows] = await Promise.all([
    database
      .select({ id: roomMemberships.id, userId: roomMemberships.userId, role: roomMemberships.role, joinedAt: roomMemberships.joinedAt, name: displayName })
      .from(roomMemberships)
      .innerJoin(users, eq(roomMemberships.userId, users.id))
      .where(and(eq(roomMemberships.roomId, roomId), sql`${roomMemberships.leftAt} is null`))
      .orderBy(roomMemberships.joinedAt),
    database
      .select({ id: roomMessages.id, userId: roomMessages.userId, body: roomMessages.body, createdAt: roomMessages.createdAt, authorName: displayName })
      .from(roomMessages)
      .innerJoin(users, eq(roomMessages.userId, users.id))
      .where(and(eq(roomMessages.roomId, roomId), sql`${roomMessages.deletedAt} is null`))
      .orderBy(roomMessages.createdAt)
      .limit(100),
  ])
  return {
    room: safeRoom,
    you: { role: membership.role as "host" | "member" },
    members: memberRows.map(({ userId: memberUserId, ...member }) => ({ ...member, avatarIndex: avatarIndexFor(memberUserId) })),
    messages: messageRows.map(({ userId: authorUserId, ...message }) => ({ ...message, mine: authorUserId === userId })),
  }
}

export type RoomLookup =
  | { status: "not_found" }
  | { status: "closed"; name: string }
  | { status: "banned"; name: string }
  | { status: "member"; name: string; memberCount: number }
  | { status: "locked"; name: string; memberCount: number }
  | { status: "joinable"; name: string; memberCount: number; phase: string; focusMinutes: number }

// Direct-entry contract for invite links: unlisted slugs resolve here but
// never appear in listPublicRooms. Works signed-out so the invite page can
// prompt guests to sign in.
export async function lookupRoomBySlug(slug: string, userId: string | null, database: PomoderDb = db): Promise<RoomLookup> {
  const [room] = await database.select().from(rooms).where(eq(rooms.slug, slug)).limit(1)
  if (!room) return { status: "not_found" }
  if (room.closedAt || room.phase === "closed") return { status: "closed", name: room.name }
  if (userId) {
    const banned = await database.select({ id: roomBans.id }).from(roomBans).where(and(eq(roomBans.roomId, room.id), eq(roomBans.userId, userId))).limit(1)
    if (banned.length) return { status: "banned", name: room.name }
  }
  const [{ memberCount }] = await database.select({ memberCount: sql<number>`count(*)::int` }).from(roomMemberships).where(and(eq(roomMemberships.roomId, room.id), sql`${roomMemberships.leftAt} is null`))
  if (userId) {
    const [membership] = await database.select({ id: roomMemberships.id }).from(roomMemberships).where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, userId), sql`${roomMemberships.leftAt} is null`)).limit(1)
    if (membership) return { status: "member", name: room.name, memberCount }
  }
  if (!canJoinRoom(room.phase)) return { status: "locked", name: room.name, memberCount }
  return { status: "joinable", name: room.name, memberCount, phase: room.phase, focusMinutes: room.focusMinutes }
}

export async function notifyRoom(roomId: string, event: string) {
  const channel = roomChannel(roomId)
  await pool.query(`select pg_notify($1, $2)`, [channel, event])
}

export async function assertNotBanned(roomId: string, userId: string, database: PomoderDb | PomoderTransaction = db) {
  const banned = await database.select({ id: roomBans.id }).from(roomBans).where(and(eq(roomBans.roomId, roomId), eq(roomBans.userId, userId))).limit(1)
  if (banned.length) throw new Error("ROOM_BANNED")
}

export function roomChannel(roomId: string) { return `pomoder_room_${roomId.replaceAll("-", "")}` }

async function endActiveMemberships(tx: PomoderTransaction, roomId: string, timestamp: Date) {
  await tx.update(roomMemberships).set({ leftAt: timestamp }).where(and(eq(roomMemberships.roomId, roomId), sql`${roomMemberships.leftAt} is null`))
}

// Hosting is single-tenancy: starting or joining another room abandons any
// room the user still hosts, closing it so members are not stranded in a
// hostless room.
async function closeRoomsHostedBy(tx: PomoderTransaction, userId: string, timestamp: Date, exceptRoomId?: string) {
  const hosted = await tx.select().from(rooms).where(and(eq(rooms.hostUserId, userId), sql`${rooms.closedAt} is null`)).for("update")
  const closedRoomIds: string[] = []
  for (const room of hosted) {
    if (room.id === exceptRoomId) continue
    const { set } = phaseUpdate(room, "closed", timestamp)
    await tx.update(rooms).set(set).where(eq(rooms.id, room.id))
    await endActiveMemberships(tx, room.id, timestamp)
    closedRoomIds.push(room.id)
  }
  return closedRoomIds
}

function avatarIndexFor(userId: string) {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997
  return hash % 4
}
