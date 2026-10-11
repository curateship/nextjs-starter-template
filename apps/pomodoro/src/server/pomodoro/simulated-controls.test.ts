import { PGlite } from "@electric-sql/pglite"
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { planSimulatedDay, type SimulatedHabits } from "@/lib/pomodoro/simulated-days"
import { type CustomShellDb } from "@/server/db"
import { forgetAppSettings, loadAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import { listAdminFocusUsers } from "@/server/pomodoro/admin"
import { listAdminBoard } from "@/server/pomodoro/admin-leaderboard"
import { blockAccount } from "@/server/pomodoro/blocks"
import { listedProfilePaths, readPublicProfile } from "@/server/pomodoro/public-profile"
import {
  createRoomWithHost,
  joinRoomBySlug,
  postRoomMessage,
  reportRoomMessage,
} from "@/server/pomodoro/rooms"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAuditLogs,
  pomodoroFollows,
  pomodoroProfiles,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
  pomodoroSimulatedRooms,
  roomMemberships,
  roomMessageReactions,
  roomMessages,
  rooms,
} from "@/server/pomodoro/schema"
import { makeSimulatedAccount, runSimulatedDays } from "@/server/pomodoro/simulated-accounts"
import { runSimulatedChat, sayArriving } from "@/server/pomodoro/simulated-chat"
import {
  cancelGhostSessions,
  chatUnderCap,
  fadeDialOnceAWeek,
  noteRealVisit,
  readRealPresence,
  realWeekCeiling,
  secondsUnderCeiling,
} from "@/server/pomodoro/simulated-controls"
import { assignHosts, runSimulatedRooms } from "@/server/pomodoro/simulated-rooms"
import { runSimulatedSocial } from "@/server/pomodoro/simulated-social"
import { VOICE_PREVIEWED_KEY } from "@/server/pomodoro/simulated-voice"
import { readTodaySchedule, setSimulatedPaused } from "@/server/pomodoro/simulated-watch"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Tyler's controls over the made-up members (live activity task 05), against
 * a real database: real members kept on top and the fade, the chat cap, a
 * report's mute, the real-only figures, the "somebody real is here" mark, the
 * five switches, search engines, the restart cleanup and today's schedule.
 */

let client: PGlite
let db: CustomShellDb
let adminId: string

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** A Wednesday, far from any real date. */
const NOON = new Date("2099-03-04T12:00:00Z")

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  adminId = (await insertUser(db, { role: "admin" })).id
  await saveAppSetting({ key: "simulated.accounts", value: { target: 200, hoursCap: 3, paused: false }, actorUserId: adminId })
})

afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY
  await client.close()
})

async function makeAccounts(count: number) {
  for (let index = 0; index < count; index += 1)
    await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: NOON }))
  const rows = await db.select().from(pomodoroSimulatedAccounts)
  for (const row of rows) {
    const habits: SimulatedHabits = { ...row.habits, timezone: "UTC", daysOff: [], startHour: 9 }
    await db.update(pomodoroSimulatedAccounts).set({ habits }).where(eq(pomodoroSimulatedAccounts.userId, row.userId))
  }
  return db.select().from(pomodoroSimulatedAccounts)
}

/** A real member on the global board. */
async function realMember(handle: string) {
  const user = await insertUser(db, { name: handle })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    handle,
    publicDisplayName: handle,
    timezone: "UTC",
    profilePublic: true,
    listed: true,
    leaderboardOptIn: true,
  })
  return user.id
}

async function focused(userId: string, localDate: string, hours: number) {
  await db.insert(dailyFocusStats).values({ userId, localDate, focusSessions: 4, focusSeconds: Math.round(hours * 3_600) })
}

/** A made-up account's first session today, and a moment inside it. */
function firstSession(account: { userId: string; habits: SimulatedHabits }, hoursCap = 3) {
  const plan = planSimulatedDay(account.userId, account.habits, "2099-03-04", hoursCap)
  return plan.sessions[0] ?? null
}

describe("real members stay on top", () => {
  it("lets no made-up week past the top real member's once they pass eight hours, and never takes hours away", async () => {
    const accounts = await makeAccounts(2)
    const sam = await realMember("sam_r")
    await focused(sam, "2099-03-03", 7)
    expect(await realWeekCeiling(NOON)).toBeNull()

    await focused(sam, "2099-03-02", 3)
    expect(await realWeekCeiling(NOON)).toBe(10 * 3_600 - 15 * 60)
    const ceiling = await realWeekCeiling(NOON)
    const [busy, light] = accounts
    await focused(busy.userId, "2099-03-02", 9.8)
    await focused(light.userId, "2099-03-02", 2)
    expect(await secondsUnderCeiling(busy.userId, 3_000, ceiling, NOON)).toBeLessThan(60)
    expect(await secondsUnderCeiling(light.userId, 3_000, ceiling, NOON)).toBe(3_000)

    // Through the worker: at the busy one's session it starts nothing.
    const session = firstSession(busy)
    if (session) {
      await runSimulatedDays(new Date(session.startsAt.getTime() + MINUTE))
      const running = await db.select().from(focusSessions).where(and(eq(focusSessions.userId, busy.userId), eq(focusSessions.status, "running")))
      expect(running).toHaveLength(0)
    }
    // Its past rows are untouched.
    const [week] = await db.select().from(dailyFocusStats).where(eq(dailyFocusStats.userId, busy.userId))
    expect(week.focusSeconds).toBe(Math.round(9.8 * 3_600))
  })

  it("fades Hours a day a quarter of an hour the week after real members pass 100 hours, once a week, never under one", async () => {
    const sam = await realMember("sam_r")
    const ana = await realMember("ana_p")
    // The week of Monday 23 Feb 2099 to Sunday 1 Mar: 120 real hours.
    for (const date of ["2099-02-23", "2099-02-24", "2099-02-25", "2099-02-26"]) {
      await focused(sam, date, 15)
      await focused(ana, date, 15)
    }
    const fade = await fadeDialOnceAWeek(NOON)
    expect(fade).toMatchObject({ week: "2099-03-02", realHours: 120, from: 3, to: 2.75 })
    forgetAppSettings()
    expect((await loadAppSettings())["simulated.accounts"].hoursCap).toBe(2.75)
    // The same week again changes nothing.
    expect(await fadeDialOnceAWeek(new Date(NOON.getTime() + DAY))).toBeNull()
    forgetAppSettings()
    expect((await loadAppSettings())["simulated.accounts"].hoursCap).toBe(2.75)
    // A quiet week leaves it.
    const nextWeek = new Date(NOON.getTime() + 7 * DAY)
    expect(await fadeDialOnceAWeek(nextWeek)).toMatchObject({ from: 2.75, to: 2.75 })
    // At one hour it stays at one.
    await saveAppSetting({ key: "simulated.accounts", value: { target: 200, hoursCap: 1, paused: false }, actorUserId: adminId })
    for (const date of ["2099-03-09", "2099-03-10", "2099-03-11", "2099-03-12"]) {
      await focused(sam, date, 15)
      await focused(ana, date, 15)
    }
    expect(await fadeDialOnceAWeek(new Date(NOON.getTime() + 14 * DAY))).toMatchObject({ from: 1, to: 1 })
  })
})

describe("the chat", () => {
  async function madeUpInRealRoom() {
    const [account] = await makeAccounts(1)
    const host = await realMember("host_one")
    const { room } = await createRoomWithHost(host, "real-room-slug-pad", {
      name: "Real room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, NOON)
    await joinRoomBySlug(room.slug, account.userId, db, NOON)
    await db.insert(pomodoroSettings).values({ key: VOICE_PREVIEWED_KEY, value: {} })
    return { room, account }
  }

  it("writes a fixed line once the day's AI spend reaches the cap", async () => {
    process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY = "test-key"
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({ content: [{ type: "text", text: "hey, joining for a bit" }], stop_reason: "end_turn", usage: { input_tokens: 400, output_tokens: 12 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    await saveAppSetting({ key: "simulated.chatCap", value: { centsPerDay: 1 }, actorUserId: adminId })
    const now = new Date()
    expect(await chatUnderCap(now)).toBe(true)
    const { room, account } = await madeUpInRealRoom()
    await sayArriving(room, account.userId, now)
    const [first] = await db.select().from(pomodoroSimulatedLines)
    expect(first.source).toBe("ai")
    // A day's spend of a cent: the next line is a fixed one, and no call goes out.
    await db.update(pomodoroSimulatedLines).set({ costCents: 1 })
    expect(await chatUnderCap(now)).toBe(false)
    const calls = vi.mocked(globalThis.fetch).mock.calls.length
    const [second] = await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: NOON })).then((made) => [made])
    await joinRoomBySlug(room.slug, second.userId, db, now)
    await sayArriving(room, second.userId, now)
    const lines = await db.select().from(pomodoroSimulatedLines)
    expect(lines).toHaveLength(2)
    expect(lines.find((line) => line.id !== first.id)?.source).toBe("fixed")
    expect(vi.mocked(globalThis.fetch).mock.calls.length).toBe(calls)
  })

  it("says nothing with the Chat switch off", async () => {
    const { room, account } = await madeUpInRealRoom()
    await saveAppSetting({
      key: "simulated.switches",
      value: { sessions: true, rooms: true, chat: false, follows: true, joinReal: true },
      actorUserId: adminId,
    })
    await sayArriving(room, account.userId, NOON)
    expect(await db.select().from(pomodoroSimulatedLines)).toHaveLength(0)
  })

  it("never greets, answers or reacts to a real member across a block", async () => {
    const [host] = await makeAccounts(1)
    const sam = await realMember("sam_r")
    const ana = await realMember("ana_p")
    await saveAppSetting({
      key: "simulated.voice",
      value: { ...(await loadAppSettings())["simulated.voice"], chattiness: "talkative" },
      actorUserId: adminId,
    })
    await db.insert(pomodoroSettings).values({ key: VOICE_PREVIEWED_KEY, value: {} })
    const { room } = await createRoomWithHost(host.userId, "made-up-room-pad", {
      name: "Made-up room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, NOON)
    await db.insert(pomodoroSimulatedRooms).values({ roomId: room.id, hostUserId: host.userId, focusTarget: 4, memberTarget: 0, createdAt: new Date(NOON.getTime() - HOUR) })
    await blockAccount(sam, host.userId)
    await joinRoomBySlug(room.slug, sam, db, NOON)
    for (const line of ["one", "two", "three", "four"]) await postRoomMessage(room.slug, sam, line)
    await joinRoomBySlug(room.slug, ana, db, NOON)
    for (const line of ["five", "six", "seven", "eight"]) await postRoomMessage(room.slug, ana, line)
    await db.update(roomMessages).set({ createdAt: NOON })
    for (let at = NOON.getTime(); at <= NOON.getTime() + 4 * MINUTE; at += 10_000) {
      await runSimulatedChat(new Date(at))
      await db.execute(sql`update room_messages set created_at = ${new Date(at).toISOString()}::timestamptz where created_at < '2090-01-01'`)
    }
    const reactions = await db
      .select({ author: roomMessages.userId })
      .from(roomMessageReactions)
      .innerJoin(roomMessages, eq(roomMessages.id, roomMessageReactions.messageId))
    expect(reactions.every((row) => row.author !== sam)).toBe(true)
    const triggers = (await db.select({ key: pomodoroSimulatedLines.triggerKey }).from(pomodoroSimulatedLines)).map((row) => row.key)
    const [samSeat] = await db.select().from(roomMemberships).where(eq(roomMemberships.userId, sam))
    const [anaSeat] = await db.select().from(roomMemberships).where(eq(roomMemberships.userId, ana))
    expect(triggers).not.toContain(`greet:${samSeat.id}`)
    expect(triggers).toContain(`greet:${anaSeat.id}`)
  })
})

describe("a report", () => {
  it("pauses the made-up author in the same step, and a real author is untouched", async () => {
    const [account] = await makeAccounts(1)
    const host = await realMember("host_one")
    const sam = await realMember("sam_r")
    const { room } = await createRoomWithHost(host, "real-room-slug-pad", {
      name: "Real room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, NOON)
    await joinRoomBySlug(room.slug, account.userId, db, NOON)
    await joinRoomBySlug(room.slug, sam, db, NOON)
    await postRoomMessage(room.slug, account.userId, "hey all")
    await postRoomMessage(room.slug, sam, "hi")
    const lines = await db.select().from(roomMessages)
    const madeUpLine = lines.find((line) => line.userId === account.userId)!
    const realLine = lines.find((line) => line.userId === sam)!
    await reportRoomMessage(room.slug, host, realLine.id, "rude")
    expect((await db.select().from(pomodoroSimulatedAccounts).where(isNotNull(pomodoroSimulatedAccounts.pausedAt)))).toHaveLength(0)
    await reportRoomMessage(room.slug, host, madeUpLine.id, "sounds like a bot")
    const [after] = await db.select().from(pomodoroSimulatedAccounts).where(eq(pomodoroSimulatedAccounts.userId, account.userId))
    expect(after.pausedAt).not.toBeNull()
  })
})

describe("the admin's own figures", () => {
  it("leave every made-up member out of the focus list, its totals and the board with Real members only on", async () => {
    const [made] = await makeAccounts(1)
    const sam = await realMember("sam_r")
    await focused(sam, "2099-03-03", 2)
    await focused(made.userId, "2099-03-03", 3)
    const all = await listAdminFocusUsers({ search: "", sort: "focus", direction: "desc", page: 1, pageSize: 25, now: NOON })
    const real = await listAdminFocusUsers({ search: "", sort: "focus", direction: "desc", page: 1, pageSize: 25, realOnly: true, now: NOON })
    expect(all.sums.weekSeconds).toBe(5 * 3_600)
    expect(real.sums.weekSeconds).toBe(2 * 3_600)
    expect(real.sums.focusSeconds).toBe(2 * 3_600)
    expect(real.rows.map((row) => row.userId)).not.toContain(made.userId)
    expect(real.total).toBe(all.total - 1)
    const board = await listAdminBoard({ window: "week", page: 1, pageSize: 25, realOnly: true, now: NOON })
    expect(board.rows.map((row) => row.userId)).toEqual([sam])
    const fullBoard = await listAdminBoard({ window: "week", page: 1, pageSize: 25, now: NOON })
    expect(fullBoard.rows[0].userId).toBe(made.userId)
  })
})

describe("somebody real on the site", () => {
  it("is here for two minutes after a visit and gone after an hour; with nobody for an hour no room opens", async () => {
    await makeAccounts(10)
    await assignHosts()
    expect(await readRealPresence(NOON)).toMatchObject({ looking: false, quiet: false, lastSeenAt: null })
    const visit = new Date(NOON.getTime() - 2 * HOUR)
    await noteRealVisit(visit)
    expect(await readRealPresence(new Date(visit.getTime() + MINUTE))).toMatchObject({ looking: true, quiet: false })
    expect(await readRealPresence(new Date(visit.getTime() + 30 * MINUTE))).toMatchObject({ looking: false, quiet: false })
    expect(await readRealPresence(NOON)).toMatchObject({ looking: false, quiet: true })
    // Weekly bookings are saved either way; they are not rooms opening.
    const opened = () => db.select().from(rooms).where(sql`${rooms.phase} <> 'scheduled'`)
    await runSimulatedRooms(NOON)
    expect(await opened()).toHaveLength(0)
    // A real poll, and the next pass opens rooms.
    await noteRealVisit(NOON)
    await runSimulatedRooms(new Date(NOON.getTime() + MINUTE))
    expect((await opened()).length).toBeGreaterThan(0)
  })
})

describe("one switch per behaviour", () => {
  it("Rooms off opens no room; Sessions off starts no session; Follows off makes no follow; Join real rooms off joins none", async () => {
    const accounts = await makeAccounts(10)
    await assignHosts()
    const host = await realMember("host_one")
    const { room: real } = await createRoomWithHost(host, "real-room-slug-pad", {
      name: "Real room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, NOON)
    await db.update(rooms).set({ createdAt: new Date(NOON.getTime() - HOUR) }).where(eq(rooms.id, real.id))
    await saveAppSetting({
      key: "simulated.switches",
      value: { sessions: false, rooms: false, chat: true, follows: false, joinReal: false },
      actorUserId: adminId,
    })
    await runSimulatedRooms(NOON)
    expect(await db.select().from(rooms).where(sql`${rooms.phase} <> 'scheduled'`)).toHaveLength(1)
    await runSimulatedDays(NOON)
    const [running] = await db.select().from(focusSessions).where(eq(focusSessions.status, "running"))
    expect(running).toBeUndefined()
    await runSimulatedSocial(NOON)
    expect(await db.select().from(pomodoroFollows)).toHaveLength(0)
    const madeUpIds = accounts.map((account) => account.userId)
    expect(await db.select().from(roomMemberships).where(inArray(roomMemberships.userId, madeUpIds))).toHaveLength(0)

    // All on again: rooms open and follows are picked on the next pass.
    await saveAppSetting({
      key: "simulated.switches",
      value: { sessions: true, rooms: true, chat: true, follows: true, joinReal: true },
      actorUserId: adminId,
    })
    await runSimulatedRooms(new Date(NOON.getTime() + MINUTE))
    await runSimulatedSocial(new Date(NOON.getTime() + MINUTE))
    expect((await db.select().from(rooms).where(sql`${rooms.phase} <> 'scheduled'`)).length).toBeGreaterThan(1)
    expect((await db.select().from(pomodoroFollows)).length).toBeGreaterThan(0)
  })
})

describe("search engines", () => {
  it("never list a made-up page in the sitemap, and mark it noindex while a real page is not", async () => {
    const [made] = await makeAccounts(1)
    await realMember("sam_r")
    const [profile] = await db.select().from(pomodoroProfiles).where(eq(pomodoroProfiles.userId, made.userId))
    const paths = (await listedProfilePaths()).map((row) => row.path)
    expect(paths).toContain("/u/sam_r")
    expect(paths).not.toContain(`/u/${profile.handle}`)
    expect((await readPublicProfile(profile.handle!))?.noindex).toBe(true)
    expect((await readPublicProfile("sam_r"))?.noindex).toBe(false)
  })
})

describe("a restart", () => {
  it("cancels a made-up session that ended over an hour ago and leaves a recent one for the day pass", async () => {
    const [made] = await makeAccounts(1)
    const sam = await realMember("sam_r")
    const now = new Date()
    const row = (userId: string, endsAgo: number, key: string) => ({
      userId,
      mode: "focus" as const,
      status: "running" as const,
      plannedSeconds: 1_500,
      targetEndsAt: new Date(now.getTime() - endsAgo),
      idempotencyKey: key,
    })
    await db.insert(focusSessions).values([
      row(made.userId, 2 * HOUR, "ghost-old"),
      row(made.userId, 10 * MINUTE, "ghost-new"),
      row(sam, 2 * HOUR, "real-old"),
    ])
    expect(await cancelGhostSessions(now)).toBe(1)
    const left = await db.select({ key: focusSessions.idempotencyKey, status: focusSessions.status }).from(focusSessions)
    expect(Object.fromEntries(left.map((session) => [session.key, session.status]))).toEqual({
      "ghost-old": "cancelled",
      "ghost-new": "running",
      "real-old": "running",
    })
  })
})

describe("today's schedule", () => {
  it("names in each hour the members who then start a focus in it", async () => {
    const accounts = await makeAccounts(12)
    const from = new Date("2099-03-04T08:30:00Z")
    const schedule = await readTodaySchedule(from)
    const tenOClock = schedule.find((hour) => hour.startsAt === "2099-03-04T10:00:00.000Z")!
    const planned = new Set(tenOClock.focusing.map((person) => person.userId))
    expect(planned.size).toBeGreaterThan(0)
    // The worker runs from before the schedule was read, as it does on a
    // server, and the starts it makes between ten and eleven are counted.
    const started = new Set<string>()
    for (let at = from.getTime(); at < Date.parse("2099-03-04T11:00:00Z"); at += MINUTE) {
      const before = new Set((await db.select({ id: focusSessions.id }).from(focusSessions)).map((row) => row.id))
      await runSimulatedDays(new Date(at))
      if (at < Date.parse("2099-03-04T10:00:00Z")) continue
      for (const session of await db.select().from(focusSessions)) if (!before.has(session.id)) started.add(session.userId)
    }
    // Everybody due at ten started at ten, and nobody started who was not due.
    expect([...started].sort()).toEqual([...planned].sort())
    void accounts
  })
})

describe("the pause switch", () => {
  it("pauses and unpauses in one request, each change an audit row", async () => {
    const accounts = await makeAccounts(2)
    const ids = accounts.map((account) => account.userId)
    expect(await setSimulatedPaused({ userIds: ids, paused: true, actorUserId: adminId })).toMatchObject({ changed: expect.arrayContaining(ids), skipped: [] })
    expect(await setSimulatedPaused({ userIds: ids, paused: true, actorUserId: adminId })).toMatchObject({ changed: [], skipped: ids })
    expect(await setSimulatedPaused({ userIds: [ids[0]], paused: false, actorUserId: adminId })).toMatchObject({ changed: [ids[0]] })
    const audits = await db.select().from(pomodoroAuditLogs).where(eq(pomodoroAuditLogs.resource, "simulated"))
    expect(audits.map((row) => row.action).sort()).toEqual(["simulated_pause_account", "simulated_unpause_account"])
  })
})
