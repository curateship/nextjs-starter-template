import { PGlite } from "@electric-sql/pglite"
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { seededRandom, type SimulatedHabits } from "@/lib/pomodoro/simulated-days"
import { type CustomShellDb } from "@/server/db"
import { saveAppSetting } from "@/server/pomodoro/app-settings"
import {
  advanceExpiredRoom,
  createRoomWithHost,
  joinRoomBySlug,
  leaveRoom,
  postRoomMessage,
  startCountedRooms,
} from "@/server/pomodoro/rooms"
import {
  pomodoroProfiles,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
  pomodoroSimulatedRooms,
  roomMemberships,
  roomMessageReactions,
  roomMessages,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import { makeSimulatedAccount } from "@/server/pomodoro/simulated-accounts"
import { runSimulatedChat } from "@/server/pomodoro/simulated-chat"
import { assignHosts, runSimulatedRooms, startDueRoom } from "@/server/pomodoro/simulated-rooms"
import { VOICE_PREVIEWED_KEY } from "@/server/pomodoro/simulated-voice"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The made-up members' chat on a scripted room, with no AI key so the fixed
 * lines speak: the moments, never a line in a focus except to an @name, never
 * two made-up lines running, reactions only on real lines, and silence in a
 * room with nobody real in it.
 */

let client: PGlite
let db: CustomShellDb
let adminId: string
let realId: string

const MINUTE = 60_000
const NOON = new Date("2099-03-04T12:00:00Z")

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  adminId = (await insertUser(db, { role: "admin" })).id
  realId = (await insertUser(db, { name: "Sam Rivera" })).id
  await db.insert(pomodoroProfiles).values({ userId: realId, handle: "sam_r", publicDisplayName: "Sam Rivera" })
  await saveAppSetting({ key: "simulated.accounts", value: { target: 40, hoursCap: 3, paused: false }, actorUserId: adminId })
  const voice = (await import("@/lib/pomodoro/app-settings")).APP_SETTING_DEFAULTS["simulated.voice"]
  await saveAppSetting({ key: "simulated.voice", value: { ...voice, chattiness: "talkative" }, actorUserId: adminId })
  for (let index = 0; index < 4; index += 1)
    await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: NOON }))
  await assignHosts()
  // UTC and every day, and a host on 25 · 5 · 15, so a run has many breaks.
  for (const row of await db.select().from(pomodoroSimulatedAccounts)) {
    const host = row.habits.host ? { ...row.habits.host, focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15 } : undefined
    const habits: SimulatedHabits = { ...row.habits, timezone: "UTC", daysOff: [], startHour: 9, host }
    await db.update(pomodoroSimulatedAccounts).set({ habits }).where(eq(pomodoroSimulatedAccounts.userId, row.userId))
  }
})

afterEach(async () => {
  await client.close()
})

async function preview() {
  await db.insert(pomodoroSettings).values({ key: VOICE_PREVIEWED_KEY, value: {} })
}

/** Rows the database stamped with the real clock, moved onto the test's clock. */
async function onTestClock(at: Date) {
  const iso = at.toISOString()
  await db.execute(sql`update room_messages set created_at = ${iso}::timestamptz where created_at < '2090-01-01'`)
  await db.execute(sql`update pomodoro_simulated_lines set created_at = ${iso}::timestamptz where created_at < '2090-01-01'`)
  await db.execute(sql`update room_message_reactions set created_at = ${iso}::timestamptz where created_at < '2090-01-01'`)
}

async function advanceRooms(at: Date) {
  const due = await db
    .select({ id: rooms.id, sequence: rooms.sequence })
    .from(rooms)
    .where(and(isNull(rooms.closedAt), sql`${rooms.phaseEndsAt} <= ${at.toISOString()}::timestamptz`))
  for (const room of due) await advanceExpiredRoom(room.id, room.sequence, db, at)
  await startCountedRooms(at, db)
}

async function theRoom() {
  const [row] = await db
    .select({ room: rooms })
    .from(rooms)
    .innerJoin(pomodoroSimulatedRooms, eq(pomodoroSimulatedRooms.roomId, rooms.id))
    .where(isNull(rooms.closedAt))
    .orderBy(asc(rooms.createdAt))
    .limit(1)
  return row?.room ?? null
}

type Said = { id: string; userId: string; at: Date; phase: string; endsIn: number | null; kind: string; triggerKey: string | null; madeUp: boolean }

/** Runs the room for `minutes`, ten seconds at a time, calling `script` before each pass. */
async function run(from: Date, minutes: number, script?: (at: Date, room: Room) => Promise<void>) {
  const said: Said[] = []
  const seen = new Set<string>()
  for (let step = 0; step < minutes * 6; step += 1) {
    const at = new Date(from.getTime() + step * 10_000)
    await advanceRooms(at)
    if (step % 6 === 0) await runSimulatedRooms(at)
    const room = await theRoom()
    if (!room) continue
    await script?.(at, room)
    await onTestClock(at)
    await runSimulatedChat(at)
    await onTestClock(at)
    const fresh = await db
      .select({ id: roomMessages.id, userId: roomMessages.userId })
      .from(roomMessages)
      .where(eq(roomMessages.roomId, room.id))
    for (const message of fresh) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      const [line] = await db
        .select({ kind: pomodoroSimulatedLines.kind, triggerKey: pomodoroSimulatedLines.triggerKey })
        .from(pomodoroSimulatedLines)
        .where(eq(pomodoroSimulatedLines.messageId, message.id))
      said.push({
        id: message.id,
        userId: message.userId,
        at,
        phase: room.phase,
        endsIn: room.phaseEndsAt ? room.phaseEndsAt.getTime() - at.getTime() : null,
        kind: line?.kind ?? "real",
        triggerKey: line?.triggerKey ?? null,
        madeUp: message.userId !== realId,
      })
    }
  }
  return said
}

describe("the made-up members' chat", () => {
  it("says nothing before a Preview has been read", async () => {
    const said = await run(NOON, 10)
    expect(said).toEqual([])
  }, 120_000)

  it("keeps talking in a room with nobody real in it, never one person twice running", async () => {
    await preview()
    // Ten real rooms waiting beside them, so made-up hosts see ten others on
    // Open to join and go ahead and start.
    for (let index = 0; index < 10; index += 1) {
      const owner = await insertUser(db)
      await createRoomWithHost(owner.id, `real-room-${index}-padding`, {
        name: `Real ${index}`,
        visibility: "public",
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        autoStart: false,
        sound: "curated:rain",
        background: "scene:plain",
      }, db, NOON)
    }
    const said = await run(NOON, 90)
    const kinds = new Set(said.map((line) => line.kind))
    expect(kinds).toContain("open")
    // The host speaks every time it presses Start, an "open" line before a
    // countdown of minutes, a "focus" line before a 5-second one.
    expect(said.filter((line) => line.triggerKey?.startsWith("start:")).length).toBeGreaterThan(1)
    // The host's line as it presses Start is the one exception: it is always said.
    for (let index = 1; index < said.length; index += 1)
      if (!said[index].triggerKey?.startsWith("start:")) expect(said[index].userId).not.toBe(said[index - 1].userId)
    for (const line of said) if (line.phase === "focus") expect(["focus", "mention", "greet"]).toContain(line.kind)
  }, 600_000)

  it("speaks at the right moments around a real member, and keeps the rules", async () => {
    await preview()
    let joined = false
    let breaksSeen = 0
    let lastPhase = ""
    let realLines = 0
    let mentioned = false
    const said = await run(NOON, 150, async (at, room) => {
      if (!joined && at.getTime() >= NOON.getTime() + 2 * MINUTE && room.phase === "waiting") {
        await joinRoomBySlug(room.slug, realId, db, at)
        joined = true
      }
      const onBreak = room.phase === "short" || room.phase === "long"
      if (onBreak && lastPhase !== room.phase) breaksSeen += 1
      // A line at the start of most breaks.
      if (joined && onBreak && room.phaseStartedAt && at.getTime() - room.phaseStartedAt.getTime() < 10_000 && breaksSeen % 2 === 1) {
        await postRoomMessage(room.slug, realId, realLines % 2 ? "this chapter will not end" : "anyone else dying")
        realLines += 1
      }
      // Once, mid-focus, somebody @names a made-up member.
      if (joined && !mentioned && room.phase === "focus" && breaksSeen >= 2) {
        const [inside] = await db
          .select({ handle: pomodoroProfiles.handle })
          .from(roomMemberships)
          .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, roomMemberships.userId))
          .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
          .where(and(eq(roomMemberships.roomId, room.id), isNull(roomMemberships.leftAt)))
          .limit(1)
        if (inside?.handle) {
          await postRoomMessage(room.slug, realId, `@${inside.handle} you still there`)
          mentioned = true
        }
      }
      lastPhase = room.phase
    })

    const kinds = new Set(said.map((line) => line.kind))
    for (const kind of ["open", "greet", "reply", "mention"]) expect(kinds).toContain(kind)

    // Never in a focus, except an answer to an @name, and the host's line
    // said as it starts the focus (and the hello that may come with it).
    for (const line of said.filter((row) => row.madeUp))
      if (line.phase === "focus") expect(["mention", "focus", "greet"]).toContain(line.kind)
    // Never two made-up lines running, except the exchange's answer, a
    // greeting, a goodbye and the line before a start.
    for (let index = 1; index < said.length; index += 1) {
      if (said[index].madeUp && said[index - 1].madeUp)
        expect(["exchange", "greet", "leave", "focus"]).toContain(said[index].kind)
    }

    // Reactions land on real lines only.
    const reacted = await db
      .select({ author: roomMessages.userId })
      .from(roomMessageReactions)
      .innerJoin(roomMessages, eq(roomMessages.id, roomMessageReactions.messageId))
    expect(reacted.every((row) => row.author === realId)).toBe(true)

    // Nothing a made-up member said was held, and every line it sent is logged.
    const madeUpIds = (await db.select({ id: pomodoroSimulatedAccounts.userId }).from(pomodoroSimulatedAccounts)).map((row) => row.id)
    const [held] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(roomMessages)
      .where(and(inArray(roomMessages.userId, madeUpIds), isNotNull(roomMessages.heldAt)))
    expect(held.count).toBe(0)
    const logged = new Set(
      (await db.select({ id: pomodoroSimulatedLines.messageId }).from(pomodoroSimulatedLines)).flatMap((row) => row.id ?? [])
    )
    for (const line of said.filter((row) => row.madeUp)) expect(logged.has(line.id)).toBe(true)

    // At most one exchange a break: one opening line and one answer.
    const sentTriggers = (await db.select().from(pomodoroSimulatedLines))
      .filter((row) => row.messageId && row.triggerKey.startsWith("exchange"))
      .map((row) => row.triggerKey)
    expect(new Set(sentTriggers).size).toBe(sentTriggers.length)
  }, 600_000)

  it("has the host speak as a break starts, and before it starts the next focus", async () => {
    await preview()
    // The room open, a real member in, and the first focus run.
    await run(NOON, 3)
    const room = (await theRoom())!
    await joinRoomBySlug(room.slug, realId, db, new Date(NOON.getTime() + 3 * MINUTE))
    // Step on until the first break starts.
    for (let at = NOON.getTime() + 3 * MINUTE; at < NOON.getTime() + 45 * MINUTE; at += 10_000) {
      await advanceRooms(new Date(at))
      if ((at - NOON.getTime()) % MINUTE === 0) await runSimulatedRooms(new Date(at))
      const now = (await theRoom())!
      if (now.phase === "short" || now.phase === "long") break
    }
    const inBreak = (await theRoom())!
    expect(["short", "long"]).toContain(inBreak.phase)
    const started = inBreak.phaseStartedAt!.getTime()
    const ends = inBreak.phaseEndsAt!.getTime()
    // Only the host and the real member, so no break-time exchange between
    // two made-up members takes the host's turn.
    const others = await db
      .select({ userId: roomMemberships.userId })
      .from(roomMemberships)
      .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
      .where(and(eq(roomMemberships.roomId, inBreak.id), isNull(roomMemberships.leftAt), sql`${roomMemberships.userId} <> ${inBreak.hostUserId}`))
    for (const other of others) await leaveRoom(inBreak.slug, other.userId, db, new Date(started))

    // Somebody real speaks at the start of the break and again two minutes
    // in, and the reply to each is already done, so the host's turn is free.
    const realLine = async (body: string, at: Date) => {
      await postRoomMessage(inBreak.slug, realId, body)
      await onTestClock(at)
      const [message] = await db.select({ id: roomMessages.id }).from(roomMessages).where(eq(roomMessages.body, body))
      const [host] = await db.select({ userId: rooms.hostUserId }).from(rooms).where(eq(rooms.id, inBreak.id))
      await db.insert(pomodoroSimulatedLines).values({ userId: host.userId, roomId: inBreak.id, triggerKey: `reply:${message.id}`, kind: "reply", source: "fixed", createdAt: at })
    }
    const kindsSaid = async () =>
      (await db.select({ kind: pomodoroSimulatedLines.kind, messageId: pomodoroSimulatedLines.messageId }).from(pomodoroSimulatedLines).where(eq(pomodoroSimulatedLines.roomId, inBreak.id)))
        .filter((row) => row.messageId)
        .map((row) => row.kind)
    const expected = (trigger: string) => seededRandom("chat-chance", trigger)() < 0.85

    await realLine("ok break", new Date(started + 1_000))
    for (let at = started + 10_000; at < started + 90_000; at += 10_000) {
      await runSimulatedChat(new Date(at))
      await onTestClock(new Date(at))
    }
    expect((await kindsSaid()).includes("break")).toBe(expected(`break:${inBreak.id}:${inBreak.sequence}`))

    // The break ends, the room waits, and with somebody real in it the host
    // says a line and starts about 10 seconds later.
    await advanceRooms(new Date(ends + 1_000))
    const waiting = (await theRoom())!
    expect(waiting.phase).toBe("waiting")
    expect(await startDueRoom(waiting.id, new Date(ends + 5_000))).toBe(false)
    expect(await startDueRoom(waiting.id, new Date(ends + 12_000))).toBe(true)
    await onTestClock(new Date(ends + 12_000))
    // The line went out as the host pressed Start; the countdown then runs.
    expect(await kindsSaid()).toContain("focus")
    const counting = (await theRoom())!
    expect(counting.startingAt).not.toBeNull()
    await advanceRooms(counting.startingAt!)
    expect((await theRoom())!.phase).toBe("focus")
  }, 300_000)

  it("reacts to five of twenty real lines", async () => {
    await preview()
    let written = 0
    await run(NOON, 60, async (at, room) => {
      if (room.phase === "waiting" && at.getTime() >= NOON.getTime() + MINUTE) {
        const [inside] = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from room_memberships where room_id = ${room.id} and user_id = ${realId} and left_at is null`
        ).then((result) => (Array.isArray(result) ? result : (result as { rows: { n: number }[] }).rows))
        if (!inside.n) await joinRoomBySlug(room.slug, realId, db, at)
      }
      if (written < 20 && at.getTime() % (20_000) === 0 && at.getTime() >= NOON.getTime() + 2 * MINUTE) {
        await postRoomMessage(room.slug, realId, `line ${written}`)
        written += 1
      }
    })
    expect(written).toBe(20)
    const [reactions] = await db.select({ count: sql<number>`count(*)::int` }).from(roomMessageReactions)
    expect(reactions.count).toBe(5)
  }, 600_000)
})
