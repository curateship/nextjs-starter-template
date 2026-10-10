import { PGlite } from "@electric-sql/pglite"
import { and, eq, isNull, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type SimulatedHabits } from "@/lib/pomodoro/simulated-days"
import { type CustomShellDb } from "@/server/db"
import { saveAppSetting } from "@/server/pomodoro/app-settings"
import {
  advanceExpiredRoom,
  createRoomWithHost,
  startCountedRooms,
  joinRoomBySlug,
  leaveRoom,
  listPublicRooms,
} from "@/server/pomodoro/rooms"
import { openDueRooms } from "@/server/pomodoro/scheduled-rooms"
import { forgetMediaCatalog, loadMediaCatalog } from "@/server/pomodoro/catalog"
import {
  pomodoroCatalogItems,
  pomodoroRoomRepeats,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedLines,
  pomodoroSimulatedRooms,
  roomMemberships,
  rooms,
} from "@/server/pomodoro/schema"
import {
  makeSimulatedAccount,
  removeAllSimulated,
} from "@/server/pomodoro/simulated-accounts"
import {
  assignHosts,
  keepFeatured,
  runSimulatedRooms,
  startDueRoom,
  takePassLease,
} from "@/server/pomodoro/simulated-rooms"
import { VOICE_PREVIEWED_KEY } from "@/server/pomodoro/simulated-voice"
import { STARTING_SOON_WANTED, isStartingSoon } from "@/lib/pomodoro/room-countdown"
import { MIN_OPEN_ROOMS } from "@/lib/pomodoro/simulated-rooms"
import { customShellUsers } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The rooms the made-up members host and sit in, against a real database:
 * opening, joiners, closing, a real member keeping a room open, the featured
 * slot, a weekly booking, and Remove all around a real member.
 */

let client: PGlite
let db: CustomShellDb
let adminId: string
let realId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  adminId = (await insertUser(db, { role: "admin" })).id
  realId = (await insertUser(db, { name: "Real Person" })).id
  await saveAppSetting({
    key: "simulated.accounts",
    value: { target: 40, hoursCap: 3, paused: false },
    actorUserId: adminId,
  })
})

afterEach(async () => {
  await client.close()
})

const MINUTE = 60_000
/** Noon UTC on a Wednesday, far from any real date. */
const NOON = new Date("2099-03-04T12:00:00Z")

/** `count` accounts, all working in UTC every day so the clock is predictable. */
async function makeAccounts(count: number) {
  for (let index = 0; index < count; index += 1)
    await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: NOON }))
  const rows = await db.select().from(pomodoroSimulatedAccounts)
  for (const row of rows) {
    const habits: SimulatedHabits = { ...row.habits, timezone: "UTC", daysOff: [], startHour: 9 }
    await db.update(pomodoroSimulatedAccounts).set({ habits }).where(eq(pomodoroSimulatedAccounts.userId, row.userId))
  }
}

/**
 * The room clock at a given moment. `advanceDueRooms` asks the real clock, so
 * a test in 2099 moves the rooms itself, through the same step it takes.
 */
async function advanceRooms(at: Date) {
  const due = await db
    .select({ id: rooms.id, sequence: rooms.sequence })
    .from(rooms)
    .where(and(isNull(rooms.closedAt), sql`${rooms.phaseEndsAt} <= ${at.toISOString()}::timestamptz`))
  for (const room of due) await advanceExpiredRoom(room.id, room.sequence, db, at)
  await startCountedRooms(at, db)
}

/** The worker and the room clock, once a minute, the way the real loop runs. */
async function runMinutes(from: Date, minutes: number, each?: (at: Date) => Promise<void>) {
  for (let minute = 0; minute < minutes; minute += 1) {
    const at = new Date(from.getTime() + minute * MINUTE)
    await advanceRooms(at)
    await runSimulatedRooms(at)
    await each?.(at)
  }
}

async function openMadeUpRooms() {
  return db
    .select({ room: rooms })
    .from(rooms)
    .innerJoin(pomodoroSimulatedRooms, eq(pomodoroSimulatedRooms.roomId, rooms.id))
    .where(and(isNull(rooms.closedAt), sql`${rooms.phase} <> 'closed'`))
}


describe("hosts", () => {
  it("are half the accounts, each with its own scene and sound", async () => {
    await makeAccounts(12)
    expect(await assignHosts()).toBe(6)
    expect(await assignHosts()).toBe(0)
    const hosts = (await db.select().from(pomodoroSimulatedAccounts)).flatMap((row) => row.habits.host ?? [])
    expect(hosts).toHaveLength(6)
    expect(new Set(hosts.map((host) => `${host.sound}|${host.background}`)).size).toBe(6)
    expect(new Set(hosts.map((host) => host.background)).size).toBe(6)
    expect(hosts.filter((host) => host.weekly)).toHaveLength(3)
  })
})

describe("themes", () => {
  it("follow the catalogue: a removed theme's rooms switch at once, and a new theme is spread over the hosts", async () => {
    // Two themes Live, so the six hosts share them, as fifty hosts share a
    // handful on the real site.
    const themes = await db.select({ key: pomodoroCatalogItems.key }).from(pomodoroCatalogItems).where(and(eq(pomodoroCatalogItems.kind, "theme"), eq(pomodoroCatalogItems.status, "live"))).orderBy(pomodoroCatalogItems.key)
    for (const { key } of themes.slice(2))
      await db.update(pomodoroCatalogItems).set({ status: "draft" }).where(and(eq(pomodoroCatalogItems.kind, "theme"), eq(pomodoroCatalogItems.key, key)))
    forgetMediaCatalog()
    await makeAccounts(12)
    await runMinutes(NOON, 10)
    const before = (await db.select().from(pomodoroSimulatedAccounts)).flatMap((row) => row.habits.host ?? [])
    const [{ room: open }] = await openMadeUpRooms()
    const gone = open.background!.replace("scene:", "")
    await db.update(pomodoroCatalogItems).set({ status: "draft" }).where(and(eq(pomodoroCatalogItems.kind, "theme"), eq(pomodoroCatalogItems.key, gone)))
    await db.insert(pomodoroCatalogItems).values({ kind: "theme", key: "new-theme", label: "New theme", status: "live", pictureUrl: "https://example.test/new.jpg", position: 99 })
    forgetMediaCatalog()
    await runSimulatedRooms(new Date(NOON.getTime() + 10 * MINUTE))

    const hosts = (await db.select().from(pomodoroSimulatedAccounts)).flatMap((row) => row.habits.host ?? [])
    expect(before.some((host) => host.background === `scene:${gone}`)).toBe(true)
    expect(hosts.filter((host) => host.background === `scene:${gone}`)).toEqual([])
    expect(hosts.some((host) => host.background === "scene:new-theme")).toBe(true)
    const rows = await openMadeUpRooms()
    expect(rows.filter(({ room }) => room.background === `scene:${gone}`)).toEqual([])
    const uses = new Map<string, number>()
    for (const host of hosts) uses.set(host.background, (uses.get(host.background) ?? 0) + 1)
    const live = (await loadMediaCatalog(db)).themes.map((theme) => `scene:${theme.key}`)
    const counts = live.map((scene) => uses.get(scene) ?? 0)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThan(2)
  })
})

describe("two passes at once", () => {
  it("never run: a second pass in the same minute is refused", async () => {
    expect(await takePassLease(NOON)).toBe(true)
    expect(await takePassLease(new Date(NOON.getTime() + 1_000))).toBe(false)
    expect(await takePassLease(new Date(NOON.getTime() + MINUTE))).toBe(true)
  })
})

/** What Open to join shows a real member: rooms waiting or on a break. */
async function listedForReal() {
  return (await listPublicRooms(realId)).filter((row) => row.room.phase !== "focus")
}

describe("130 accounts over a day", () => {
  it("keep six rooms on Open to join and three under Starting soon all day, none alone for long, in varied rhythms and scenes", async () => {
    // Their own cities this time, spread round the world: 130, the default
    // since Tyler's "Add 30 more made up profiles" on 10 Oct 2026.
    for (let index = 0; index < 130; index += 1)
      await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: NOON }))
    const start = new Date("2099-03-04T00:00:00Z")
    const thin: string[] = []
    const lonely: string[] = []
    const aloneFor = new Map<string, number>()
    const soonCounts: number[] = []
    for (let minute = 0; minute < 24 * 60; minute += 2) {
      const at = new Date(start.getTime() + minute * MINUTE)
      await advanceRooms(at)
      await runSimulatedRooms(at)
      // From the first hour on: the rooms have had time to open.
      if (minute < 60) continue
      const listed = await listedForReal()
      if (listed.length < MIN_OPEN_ROOMS) thin.push(`${at.toISOString()}: ${listed.length}`)
      soonCounts.push(listed.filter((row) => isStartingSoon(row.room, at.getTime())).length)
      // A listed room older than five minutes has somebody besides its host,
      // or gets somebody within ten minutes: at the quietest hour a room can
      // wait a few minutes for somebody awake to come free.
      for (const row of listed) {
        const [opened] = await db.select({ createdAt: pomodoroSimulatedRooms.createdAt }).from(pomodoroSimulatedRooms).where(eq(pomodoroSimulatedRooms.roomId, row.room.id))
        const alone = opened && at.getTime() - opened.createdAt.getTime() >= 5 * MINUTE && row.memberCount < 2
        aloneFor.set(row.room.id, alone ? (aloneFor.get(row.room.id) ?? 0) + 2 : 0)
        if ((aloneFor.get(row.room.id) ?? 0) > 10) lonely.push(`${at.toISOString()} ${row.room.name}`)
      }
    }
    expect(thin).toEqual([])
    expect(lonely).toEqual([])
    // Starting soon shows its three nearly always: one ends and the next
    // host's countdown can take up to a pass to begin. It is empty only when
    // the list is down to six and no room may start: measured at none to four
    // checks of 690 in a day, so at most one in a hundred here.
    expect(soonCounts.filter((count) => count === 0).length / soonCounts.length).toBeLessThan(0.01)
    expect(soonCounts.filter((count) => count >= STARTING_SOON_WANTED).length / soonCounts.length).toBeGreaterThan(0.95)

    const hosts = (await db.select().from(pomodoroSimulatedAccounts)).flatMap((row) => row.habits.host ?? [])
    const [{ themes, sounds }] = await db.execute<{ themes: number; sounds: number }>(
      sql`select
        (select count(*)::int from pomodoro_catalog_items where kind = 'theme' and status = 'live' and picture_url is not null) as themes,
        (select count(*)::int from pomodoro_catalog_items where kind = 'sound' and status = 'live') as sounds`
    ).then((result) => (Array.isArray(result) ? result : (result as { rows: { themes: number; sounds: number }[] }).rows))
    // Half host, as far as the catalogue's scene and sound pairs go: every
    // host has a pair of its own, and the test catalogue has fewer pairs than
    // 65 hosts would need.
    expect(hosts).toHaveLength(Math.min(65, themes * sounds))
    expect(new Set(hosts.map((host) => `${host.focusMinutes}/${host.shortBreakMinutes}/${host.longBreakMinutes}`)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(hosts.map((host) => host.background)).size).toBe(Math.min(40, themes))

    // People arrive minutes apart, and some leave before their room closes.
    const joins = await db
      .select({ joinedAt: roomMemberships.joinedAt, leftAt: roomMemberships.leftAt, closedAt: rooms.closedAt })
      .from(roomMemberships)
      .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
      .where(eq(roomMemberships.role, "member"))
    expect(new Set(joins.map((row) => row.joinedAt.getTime())).size).toBeGreaterThan(10)
    expect(joins.some((row) => row.leftAt && (!row.closedAt || row.leftAt < row.closedAt))).toBe(true)

    // Nobody is ever in two rooms.
    const [twice] = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from (select user_id from room_memberships where left_at is null group by user_id having count(*) > 1) t`
    ).then((result) => (Array.isArray(result) ? result : (result as { rows: { n: number }[] }).rows))
    expect(twice.n).toBe(0)
  }, 900_000)
})

describe("a real member joining", () => {
  it("gets a line from the host, who presses Start about 10 seconds later, and the countdown runs out", async () => {
    await makeAccounts(8)
    await db.insert(pomodoroSettings).values({ key: VOICE_PREVIEWED_KEY, value: {} })
    await runSimulatedRooms(NOON)
    const [{ room }] = await openMadeUpRooms()
    expect(room.phase).toBe("waiting")
    const joinedAt = new Date(NOON.getTime() + MINUTE)
    await joinRoomBySlug(room.slug, realId, db, joinedAt)

    expect(await startDueRoom(room.id, new Date(joinedAt.getTime() + 5_000))).toBe(false)
    expect(await startDueRoom(room.id, new Date(joinedAt.getTime() + 11_000))).toBe(true)
    // The host pressed Start: the room counts down, and the join does not
    // cut the countdown short.
    const [counting] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(counting.phase).toBe("waiting")
    expect(counting.startingAt).not.toBeNull()
    expect(counting.countdownSeconds).toBe(counting.startDelaySeconds)
    expect(await startDueRoom(room.id, new Date(joinedAt.getTime() + 20_000))).toBe(false)
    await startCountedRooms(new Date(counting.startingAt!.getTime() - 1_000), db)
    expect((await db.select().from(rooms).where(eq(rooms.id, room.id)))[0].phase).toBe("waiting")
    await startCountedRooms(counting.startingAt!, db)
    const [started] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(started.phase).toBe("focus")
    expect(started.startingAt).toBeNull()
    // The host spoke first: a hello to the newcomer and a line about starting.
    const said = await db
      .select({ kind: pomodoroSimulatedLines.kind, messageId: pomodoroSimulatedLines.messageId })
      .from(pomodoroSimulatedLines)
      .where(eq(pomodoroSimulatedLines.roomId, room.id))
    expect(said.filter((row) => row.messageId).map((row) => row.kind)).toEqual(expect.arrayContaining(["greet", "focus"]))
  }, 120_000)

  it("is never left in a room the worker closes, night included", async () => {
    await makeAccounts(4)
    await runMinutes(NOON, 2)
    const [{ room }] = await openMadeUpRooms()
    await joinRoomBySlug(room.slug, realId, db, new Date(NOON.getTime() + 2 * MINUTE))
    // Through the evening and past 1am UTC, the host's own night.
    await runMinutes(new Date(NOON.getTime() + 2 * MINUTE), 15 * 60)
    const [still] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(still.closedAt).toBeNull()
    const [mine] = await db
      .select()
      .from(roomMemberships)
      .where(and(eq(roomMemberships.roomId, room.id), eq(roomMemberships.userId, realId)))
    expect(mine.leftAt).toBeNull()

    // Once they leave, the host goes to bed.
    const leftAt = new Date(NOON.getTime() + 15 * 60 * MINUTE + 3 * MINUTE)
    await leaveRoom(room.slug, realId, db, leftAt)
    await runMinutes(leftAt, 120)
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.closedAt).not.toBeNull()
  }, 600_000)
})

describe("the featured slot", () => {
  it("goes to the fullest made-up room until a real room is featured, and never past an admin", async () => {
    await makeAccounts(8)
    await runMinutes(NOON, 6)
    const featured = async () =>
      db.select({ id: rooms.id }).from(rooms).where(and(isNull(rooms.closedAt), sql`${rooms.featuredAt} is not null`))
    expect(await featured()).toHaveLength(1)
    expect((await listPublicRooms(realId))[0].featured).toBe(true)

    // An admin features a real room: the made-up one lets go.
    const realHost = await insertUser(db, { name: "Real Host" })
    const { room: real } = await createRoomWithHost(realHost.id, "real-room-slug-pad", {
      name: "Real room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    })
    await db.update(rooms).set({ featuredAt: new Date() }).where(eq(rooms.id, real.id))
    await keepFeatured()
    expect((await featured()).map((row) => row.id)).toEqual([real.id])

    // The admin un-features it: the slot goes back to a made-up room.
    await db.update(rooms).set({ featuredAt: null }).where(eq(rooms.id, real.id))
    await keepFeatured()
    const back = await featured()
    expect(back).toHaveLength(1)

    // The admin takes that one off too: it is never put back.
    await db.update(rooms).set({ featuredAt: null }).where(eq(rooms.id, back[0].id))
    await keepFeatured()
    expect((await featured()).map((row) => row.id)).not.toContain(back[0].id)
  }, 120_000)
})

describe("weekly rooms", () => {
  it("are booked for made-up hosts without a plan, open on time, and get their host", async () => {
    await makeAccounts(4)
    await runSimulatedRooms(NOON)
    // Four accounts make two hosts, and both keep a weekly room.
    const rules = await db.select().from(pomodoroRoomRepeats)
    expect(rules).toHaveLength(2)
    const [rule] = rules
    expect(rule.autoStart).toBe(false)
    // Saving the rule may already have booked its first day; otherwise the
    // existing worker books it within the lead time.
    const scheduled = () =>
      db
        .select()
        .from(rooms)
        .where(and(eq(rooms.repeatId, rule.id), eq(rooms.phase, "scheduled")))
        .orderBy(rooms.startsAt)
    if (!(await scheduled()).length) await openDueRooms(db, new Date(rule.nextStartsAt!.getTime() - 60 * MINUTE))
    const [booked] = await scheduled()
    expect(booked).toBeDefined()
    // Close the host's other rooms so the booking is the one that runs.
    for (const { room } of await openMadeUpRooms())
      if (room.hostUserId === rule.hostUserId) await leaveRoom(room.slug, rule.hostUserId, db, booked.startsAt!)
    await openDueRooms(db, booked.startsAt!)
    await runSimulatedRooms(new Date(booked.startsAt!.getTime() + MINUTE))
    const hostIn = await db
      .select()
      .from(roomMemberships)
      .where(and(eq(roomMemberships.roomId, booked.id), eq(roomMemberships.userId, rule.hostUserId), isNull(roomMemberships.leftAt)))
    expect(hostIn).toHaveLength(1)
    expect((await listPublicRooms(realId)).some((row) => row.room.id === booked.id)).toBe(true)
  }, 120_000)
})

describe("Remove all", () => {
  it("keeps a host whose room has a real person in it until they leave", async () => {
    await makeAccounts(4)
    await runMinutes(NOON, 2)
    const [{ room }] = await openMadeUpRooms()
    await joinRoomBySlug(room.slug, realId, db, new Date(NOON.getTime() + 2 * MINUTE))

    expect(await removeAllSimulated(adminId)).toEqual({ removed: 3, leaving: 1 })
    const [host] = await db.select().from(customShellUsers).where(eq(customShellUsers.id, room.hostUserId))
    expect(host).toBeDefined()

    const leftAt = new Date(NOON.getTime() + 10 * MINUTE)
    await leaveRoom(room.slug, realId, db, leftAt)
    await runMinutes(leftAt, 300)
    const gone = await db.select().from(customShellUsers).where(eq(customShellUsers.id, room.hostUserId))
    expect(gone).toHaveLength(0)
    const [realStill] = await db.select().from(customShellUsers).where(eq(customShellUsers.id, realId))
    expect(realStill).toBeDefined()
  }, 300_000)
})
