import { PGlite } from "@electric-sql/pglite"
import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { planSimulatedDay, type SimulatedHabits } from "@/lib/pomodoro/simulated-days"
import { type CustomShellDb } from "@/server/db"
import { saveAppSetting } from "@/server/pomodoro/app-settings"
import { blockAccount } from "@/server/pomodoro/blocks"
import {
  advanceExpiredRoom,
  applyHostRoomAction,
  createRoomWithHost,
  joinRoomBySlug,
  removeRoomMember,
  startCountedRooms,
} from "@/server/pomodoro/rooms"
import {
  dailyFocusStats,
  pomodoroCheers,
  pomodoroFollows,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedReach,
  pomodoroSimulatedRooms,
  roomMemberships,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import { makeSimulatedAccount } from "@/server/pomodoro/simulated-accounts"
import {
  MOST_IN_A_REAL_ROOM,
  cheerOneAnother,
  firstFollowDelayMs,
  followOneAnother,
  joinRealRooms,
  leaveRealRooms,
  reachRealMembers,
  realStayMs,
  timeFirstVisit,
  visitorsFor,
} from "@/server/pomodoro/simulated-social"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * How the made-up members touch real ones (live activity task 04), against a
 * real database: the follow graph among themselves, the cheer cap, the
 * follows and cheers a real member gets, joining and leaving a real host's
 * room, and every "no" a real member says holding.
 */

let client: PGlite
let db: CustomShellDb
let adminId: string

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Half past ten UTC on a Wednesday, inside every made-up member's working day here. */
const MORNING = new Date("2099-03-04T10:30:00Z")

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  adminId = (await insertUser(db, { role: "admin" })).id
  await saveAppSetting({ key: "simulated.accounts", value: { target: 200, hoursCap: 3, paused: false }, actorUserId: adminId })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await client.close()
})

/** `count` made-up members, all working in UTC every day from nine. */
async function makeAccounts(count: number) {
  for (let index = 0; index < count; index += 1)
    await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: MORNING }))
  const rows = await db.select().from(pomodoroSimulatedAccounts)
  for (const row of rows) {
    const habits: SimulatedHabits = { ...row.habits, timezone: "UTC", daysOff: [], startHour: 9 }
    await db.update(pomodoroSimulatedAccounts).set({ habits }).where(eq(pomodoroSimulatedAccounts.userId, row.userId))
  }
  return rows.map((row) => row.userId)
}

/** A real member with a public profile. */
async function realMember(handle: string, profile: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
  const user = await insertUser(db, { name: handle })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    handle,
    publicDisplayName: handle,
    timezone: "UTC",
    profilePublic: true,
    cheersEnabled: true,
    ...profile,
  })
  return user.id
}

/** The bell notices of one kind a member has. */
async function bell(userId: string, kind: string) {
  return db
    .select({ id: pomodoroNoticeLinks.noticeId })
    .from(pomodoroNoticeLinks)
    .innerJoin(customShellNotifications, eq(customShellNotifications.id, pomodoroNoticeLinks.noticeId))
    .where(and(eq(customShellNotifications.recipientUserId, userId), eq(pomodoroNoticeLinks.kind, kind as never)))
}

async function madeUpFollowersOf(userId: string) {
  return db
    .select({ userId: pomodoroFollows.followerUserId })
    .from(pomodoroFollows)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, pomodoroFollows.followerUserId))
    .where(eq(pomodoroFollows.followedUserId, userId))
}

/** A focused day for `userId`, `daysAgo` days before `at`. */
async function focusedDay(userId: string, at: Date, daysAgo: number) {
  const localDate = new Date(at.getTime() - daysAgo * DAY).toISOString().slice(0, 10)
  await db.insert(dailyFocusStats).values({ userId, localDate, focusSessions: 2, focusSeconds: 3_000 })
}

describe("among themselves", () => {
  it("follow five to twenty others, a few popular ones with about thirty followers, most with a handful", async () => {
    await makeAccounts(130)
    expect(await followOneAnother(MORNING)).toBe(130)
    const following = await db
      .select({ userId: pomodoroFollows.followerUserId, count: sql<number>`count(*)::int` })
      .from(pomodoroFollows)
      .groupBy(pomodoroFollows.followerUserId)
    expect(following).toHaveLength(130)
    for (const row of following) {
      expect(row.count).toBeGreaterThanOrEqual(5)
      expect(row.count).toBeLessThanOrEqual(20)
    }
    const followers = (
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pomodoroFollows)
        .groupBy(pomodoroFollows.followedUserId)
    )
      .map((row) => row.count)
      .sort((a, b) => a - b)
    const middle = followers[Math.floor(followers.length / 2)]
    expect(middle).toBeGreaterThanOrEqual(3)
    expect(middle).toBeLessThanOrEqual(8)
    expect(followers[followers.length - 1]).toBeGreaterThanOrEqual(25)
    // No follow is dated before the morning both accounts joined.
    const [early] = await db.select({ id: pomodoroFollows.id }).from(pomodoroFollows).where(sql`${pomodoroFollows.createdAt} > ${MORNING.toISOString()}::timestamptz`)
    expect(early).toBeUndefined()
  }, 120_000)

  it("pick once: a follow an admin deletes is not put back, and a new face picks on the next pass", async () => {
    await makeAccounts(12)
    await followOneAnother(MORNING)
    const [one] = await db.select().from(pomodoroFollows).limit(1)
    await db.delete(pomodoroFollows).where(eq(pomodoroFollows.id, one.id))
    const before = (await db.select().from(pomodoroFollows)).length
    expect(await followOneAnother(new Date(MORNING.getTime() + HOUR))).toBe(0)
    expect(await db.select().from(pomodoroFollows)).toHaveLength(before)
    await db.transaction((tx) => makeSimulatedAccount(tx, { historyDays: 0, hoursCap: 3, themes: [], now: MORNING }))
    expect(await followOneAnother(new Date(MORNING.getTime() + 2 * HOUR))).toBe(1)
  })

  it("send a handful of cheers a day, never more than three a day between one pair", async () => {
    await makeAccounts(40)
    await followOneAnother(MORNING)
    const start = new Date("2099-03-04T00:00:00Z").getTime()
    for (let at = start; at < start + 3 * DAY; at += 30 * MINUTE) await cheerOneAnother(new Date(at))
    const cheers = await db.select().from(pomodoroCheers)
    expect(cheers.length).toBeGreaterThan(0)
    // Each sender cheers at most once on each of its days.
    const perSender = new Map<string, number>()
    for (const cheer of cheers) perSender.set(cheer.fromUserId, (perSender.get(cheer.fromUserId) ?? 0) + 1)
    for (const count of perSender.values()) expect(count).toBeLessThanOrEqual(3)
    // Only to people they follow.
    for (const cheer of cheers) {
      const [follow] = await db
        .select({ id: pomodoroFollows.id })
        .from(pomodoroFollows)
        .where(and(eq(pomodoroFollows.followerUserId, cheer.fromUserId), eq(pomodoroFollows.followedUserId, cheer.toUserId)))
      expect(follow).toBeDefined()
    }
  })
})

describe("real members", () => {
  it("get one made-up follower within 48 hours, and a second a week later only if they focused", async () => {
    await makeAccounts(10)
    const sam = await realMember("sam_r")
    const ana = await realMember("ana_p")
    const hidden = await realMember("off_profile", { profilePublic: false })

    await reachRealMembers(MORNING)
    expect(await madeUpFollowersOf(sam)).toHaveLength(0)
    const delay = Math.max(firstFollowDelayMs(sam), firstFollowDelayMs(ana))
    expect(delay).toBeLessThanOrEqual(48 * HOUR)
    for (let at = MORNING.getTime() + HOUR; at <= MORNING.getTime() + 48 * HOUR; at += HOUR) await reachRealMembers(new Date(at))
    expect(await madeUpFollowersOf(sam)).toHaveLength(1)
    expect(await madeUpFollowersOf(ana)).toHaveLength(1)
    expect(await madeUpFollowersOf(hidden)).toHaveLength(0)
    // Nobody is told about a follow.
    expect(await db.select().from(pomodoroNoticeLinks)).toHaveLength(0)

    // A week on: Sam focused that week, Ana did not.
    const [reach] = await db.select().from(pomodoroSimulatedReach).where(eq(pomodoroSimulatedReach.userId, sam))
    const weekOn = new Date(reach.lastFollowAt!.getTime() + 7 * DAY + MINUTE)
    await focusedDay(sam, weekOn, 2)
    await reachRealMembers(weekOn)
    expect(await madeUpFollowersOf(sam)).toHaveLength(2)
    expect(await madeUpFollowersOf(ana)).toHaveLength(1)
    // Never a third.
    await focusedDay(sam, weekOn, -6)
    await reachRealMembers(new Date(weekOn.getTime() + 8 * DAY))
    expect(await madeUpFollowersOf(sam)).toHaveLength(2)
  })

  it("never follow from an account either of them blocked, and never send again a follow a block took away", async () => {
    const madeUp = await makeAccounts(3)
    const sam = await realMember("sam_r")
    await blockAccount(sam, madeUp[0])
    await blockAccount(madeUp[1], sam)
    await reachRealMembers(MORNING)
    await reachRealMembers(new Date(MORNING.getTime() + 48 * HOUR))
    const followers = await madeUpFollowersOf(sam)
    expect(followers.map((row) => row.userId)).toEqual([madeUp[2]])
    // Sam blocks that one too: the follow goes at once, and none comes back.
    await blockAccount(sam, madeUp[2])
    expect(await madeUpFollowersOf(sam)).toHaveLength(0)
    await reachRealMembers(new Date(MORNING.getTime() + 60 * HOUR))
    expect(await madeUpFollowersOf(sam)).toHaveLength(0)
  })

  it("get one cheer a week on a streak of three days, and none with cheers off", async () => {
    await makeAccounts(5)
    const sam = await realMember("sam_r")
    const quiet = await realMember("no_cheers", { cheersEnabled: false })
    const later = new Date(MORNING.getTime() + 48 * HOUR)
    for (const userId of [sam, quiet]) for (const back of [0, 1, 2]) await focusedDay(userId, later, back)
    await reachRealMembers(MORNING)
    await reachRealMembers(later)
    // The follow comes first, then the cheer from that follower.
    await reachRealMembers(new Date(later.getTime() + MINUTE))
    const cheersFor = async (userId: string) => db.select().from(pomodoroCheers).where(eq(pomodoroCheers.toUserId, userId))
    expect(await cheersFor(sam)).toHaveLength(1)
    expect(await cheersFor(quiet)).toHaveLength(0)
    expect(await bell(sam, "cheer")).toHaveLength(1)
    // Not again within the week, even on a longer streak.
    await focusedDay(sam, later, -1)
    await reachRealMembers(new Date(later.getTime() + 2 * DAY))
    expect(await cheersFor(sam)).toHaveLength(1)
  })
})

describe("a real host's public room", () => {
  async function realRoom(hostId: string, at: Date, visibility: "public" | "unlisted" = "public", slug = "real-room-slug-pad") {
    const { room } = await createRoomWithHost(hostId, slug, {
      name: "Real room",
      visibility,
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: true,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, at)
    // The database stamps the real clock; the test runs on its own.
    await db.update(rooms).set({ createdAt: at, updatedAt: at }).where(eq(rooms.id, room.id))
    return room
  }

  async function madeUpInside(roomId: string) {
    return db
      .select({ id: roomMemberships.id, userId: roomMemberships.userId, joinedAt: roomMemberships.joinedAt })
      .from(roomMemberships)
      .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
      .where(and(eq(roomMemberships.roomId, roomId), isNull(roomMemberships.leftAt)))
  }

  async function advance(at: Date) {
    const due = await db
      .select({ id: rooms.id, sequence: rooms.sequence })
      .from(rooms)
      .where(and(isNull(rooms.closedAt), sql`${rooms.phaseEndsAt} <= ${at.toISOString()}::timestamptz`))
    for (const room of due) await advanceExpiredRoom(room.id, room.sequence, db, at)
    await startCountedRooms(at, db)
  }

  it("gets one or two made-up visitors 10 to 60 seconds apart, never a third, and an unlisted room none", async () => {
    await makeAccounts(8)
    const hostId = await realMember("host_one")
    const otherHost = await realMember("host_two")
    const room = await realRoom(hostId, MORNING)
    const unlisted = await realRoom(otherHost, MORNING, "unlisted", "unlisted-room-pad")
    expect(await joinRealRooms(new Date(MORNING.getTime() + 5_000))).toBe(0)
    for (let at = MORNING.getTime() + 5_000; at <= MORNING.getTime() + 60_000; at += 5_000) await joinRealRooms(new Date(at))
    expect((await madeUpInside(room.id)).length).toBeGreaterThanOrEqual(1)
    for (let at = MORNING.getTime() + 60_000; at <= MORNING.getTime() + 3 * MINUTE; at += 5_000) await joinRealRooms(new Date(at))
    const inside = await madeUpInside(room.id)
    expect(inside).toHaveLength(visitorsFor(room.id))
    expect(inside.length).toBeLessThanOrEqual(MOST_IN_A_REAL_ROOM)
    expect(await madeUpInside(unlisted.id)).toHaveLength(0)
    // The host hears in the bell, since they do not have the room on screen.
    expect(await bell(hostId, "room_join")).toHaveLength(1)
  })

  it("keeps at least one with the host until three focuses pass, leaves only on a break, and never two in one minute", async () => {
    await makeAccounts(8)
    const hostId = await realMember("host_one")
    // Rooms until one draws two visitors, so both rules are tested.
    let room: Room | null = null
    for (let index = 0; index < 20 && !room; index += 1) {
      const candidate = await realRoom(hostId, MORNING, "public", `real-room-pad-${index}`)
      if (visitorsFor(candidate.id) === 2) room = candidate
    }
    if (!room) throw new Error("no room drew two visitors")
    for (let at = MORNING.getTime(); at <= MORNING.getTime() + 12 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    expect(await madeUpInside(room.id)).toHaveLength(2)

    const start = new Date(MORNING.getTime() + 12 * MINUTE)
    await applyHostRoomAction(room.slug, hostId, "start_focus", db, start, 5)
    const cycle = 30 * MINUTE
    const firstJoin = Math.min(...(await madeUpInside(room.id)).map((row) => row.joinedAt.getTime()))
    const leftAt: number[] = []
    for (let at = start.getTime(); at <= start.getTime() + 4 * cycle; at += 30_000) {
      const now = new Date(at)
      await advance(now)
      const before = (await madeUpInside(room.id)).length
      await leaveRealRooms(now)
      const after = (await madeUpInside(room.id)).length
      if (after < before) {
        const [current] = await db.select().from(rooms).where(eq(rooms.id, room.id))
        expect(["short", "long", "waiting"]).toContain(current.phase)
        leftAt.push(at)
        // The last one stays until three focuses have passed.
        if (after === 0) expect(at).toBeGreaterThanOrEqual(firstJoin + 3 * cycle)
      }
    }
    expect(leftAt.length).toBeGreaterThan(0)
    for (let index = 1; index < leftAt.length; index += 1) expect(leftAt[index] - leftAt[index - 1]).toBeGreaterThanOrEqual(MINUTE)
  })

  it("never brings back a member the host removed, to that room or the host's next one", async () => {
    await makeAccounts(6)
    const hostId = await realMember("host_one")
    const room = await realRoom(hostId, MORNING)
    for (let at = MORNING.getTime(); at <= MORNING.getTime() + 12 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    const [first] = await madeUpInside(room.id)
    await removeRoomMember(room.slug, hostId, first.id, db, new Date(MORNING.getTime() + 13 * MINUTE))
    const [habit] = await db.select({ habits: pomodoroSimulatedAccounts.habits }).from(pomodoroSimulatedAccounts).where(eq(pomodoroSimulatedAccounts.userId, first.userId))
    expect(habit.habits.removedFrom).toEqual([expect.objectContaining({ roomId: room.id, hostUserId: hostId })])
    // Nobody else comes into a room whose host said no.
    const afterRemoval = (await madeUpInside(room.id)).map((row) => row.userId)
    expect(afterRemoval).not.toContain(first.userId)
    for (let at = MORNING.getTime() + 14 * MINUTE; at <= MORNING.getTime() + 30 * MINUTE; at += MINUTE) await joinRealRooms(new Date(at))
    expect((await madeUpInside(room.id)).map((row) => row.userId)).toEqual(afterRemoval)

    // The host's next room, with every other made-up member busy elsewhere:
    // the removed one still never comes.
    const others = (await db.select({ userId: pomodoroSimulatedAccounts.userId }).from(pomodoroSimulatedAccounts)).map((row) => row.userId).filter((id) => id !== first.userId)
    await db.update(pomodoroSimulatedAccounts).set({ pausedAt: MORNING }).where(inArray(pomodoroSimulatedAccounts.userId, others))
    const next = await realRoom(hostId, new Date(MORNING.getTime() + HOUR), "public", "next-real-room-pad")
    for (let at = MORNING.getTime() + HOUR; at <= MORNING.getTime() + HOUR + 15 * MINUTE; at += MINUTE) await joinRealRooms(new Date(at))
    expect(await madeUpInside(next.id)).toHaveLength(0)
  })

  it("sends a blocked member out at once and never brings one into the blocker's rooms", async () => {
    await makeAccounts(6)
    const hostId = await realMember("host_one")
    // Everybody but one who is at work now is blocked by the host first. A
    // made-up member's day can be off, so the one kept is picked by its plan.
    const accounts = await db.select().from(pomodoroSimulatedAccounts)
    const working = accounts.filter((account) => {
      const plan = planSimulatedDay(account.userId, account.habits, "2099-03-04", 3)
      const last = plan.sessions[plan.sessions.length - 1]
      return plan.sessions.length && plan.sessions[0].startsAt <= MORNING && last.startsAt.getTime() + last.minutes * MINUTE > MORNING.getTime() + HOUR
    })
    const kept = working[0].userId
    const madeUp = [...accounts.map((account) => account.userId).filter((id) => id !== kept), kept]
    for (const userId of madeUp.slice(0, -1)) await blockAccount(hostId, userId)
    const room = await realRoom(hostId, MORNING)
    for (let at = MORNING.getTime(); at <= MORNING.getTime() + 12 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    const inside = await madeUpInside(room.id)
    expect(inside.map((row) => row.userId)).toEqual([kept])
    // Then the host blocks the last one, mid-focus: it leaves on the next pass.
    await applyHostRoomAction(room.slug, hostId, "start_focus", db, new Date(MORNING.getTime() + 13 * MINUTE), 5)
    await advance(new Date(MORNING.getTime() + 13 * MINUTE + 10_000))
    await blockAccount(hostId, kept)
    await leaveRealRooms(new Date(MORNING.getTime() + 14 * MINUTE))
    expect(await madeUpInside(room.id)).toHaveLength(0)
  })

  it("follows the card's soonest and latest, and comes to one room alone when asked for that room", async () => {
    await makeAccounts(6)
    await saveAppSetting({ key: "simulated.realRoomVisit", value: { minSeconds: 300, maxSeconds: 300 }, actorUserId: adminId })
    const room = await realRoom(await realMember("host_one"), MORNING)
    const other = await realRoom(await realMember("host_two"), MORNING, "public", "other-real-room-pad")
    await joinRealRooms(new Date(MORNING.getTime() + 299_000), room.id)
    expect(await madeUpInside(room.id)).toHaveLength(0)
    await joinRealRooms(new Date(MORNING.getTime() + 300_000), room.id)
    expect(await madeUpInside(room.id)).toHaveLength(1)
    expect(await madeUpInside(other.id)).toHaveLength(0)
    // A soonest later than the latest is refused.
    await expect(
      saveAppSetting({ key: "simulated.realRoomVisit", value: { minSeconds: 60, maxSeconds: 10 }, actorUserId: adminId })
    ).rejects.toThrow()
  })

  it("times the first visit when a public room opens, and not for an unlisted one", async () => {
    const real = globalThis.setTimeout
    const timed: number[] = []
    // Only the visit's own timer is caught; anything else runs as usual.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((run: () => void, ms?: number) => {
      if ((ms ?? 0) >= 1_000) {
        timed.push(ms!)
        return { unref() {} } as unknown as ReturnType<typeof setTimeout>
      }
      return real(run, ms)
    }) as typeof setTimeout)
    const now = new Date()
    const open = await realRoom(await realMember("host_one"), now)
    const unlisted = await realRoom(await realMember("host_two"), now, "unlisted", "unlisted-room-pad")
    await timeFirstVisit(open)
    await timeFirstVisit(unlisted)
    expect(timed).toHaveLength(1)
    expect(timed[0]).toBeGreaterThan(9_000)
    expect(timed[0]).toBeLessThanOrEqual(60_250)
  })

  it("moves somebody at work out of a made-up room when nobody free is at work, after a goodbye there", async () => {
    const madeUp = await makeAccounts(6)
    const [hostOfMadeUp, ...others] = madeUp
    const { room: madeUpRoom } = await createRoomWithHost(hostOfMadeUp, "made-up-room-pad", {
      name: "Made-up room",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    }, db, new Date(MORNING.getTime() - 30 * MINUTE))
    await db.insert(pomodoroSimulatedRooms).values({ roomId: madeUpRoom.id, hostUserId: hostOfMadeUp, focusTarget: 4, memberTarget: 5 })
    // Everybody else already sits in it, so nobody is free.
    for (const userId of others) await joinRoomBySlug(madeUpRoom.slug, userId, db, new Date(MORNING.getTime() - 20 * MINUTE))
    const hostId = await realMember("host_one")
    const room = await realRoom(hostId, MORNING)
    for (let at = MORNING.getTime(); at <= MORNING.getTime() + 7 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    const [moved] = await madeUpInside(room.id)
    expect(others).toContain(moved.userId)
    const [oldSeat] = await db
      .select({ leftAt: roomMemberships.leftAt })
      .from(roomMemberships)
      .where(and(eq(roomMemberships.roomId, madeUpRoom.id), eq(roomMemberships.userId, moved.userId)))
    expect(oldSeat.leftAt).not.toBeNull()
  })

  it("brings somebody awake on a day nobody works, such as a weekend", async () => {
    const madeUp = await makeAccounts(4)
    for (const userId of madeUp) {
      const [row] = await db.select().from(pomodoroSimulatedAccounts).where(eq(pomodoroSimulatedAccounts.userId, userId))
      await db.update(pomodoroSimulatedAccounts).set({ habits: { ...row.habits, daysOff: [0, 1, 2, 3, 4, 5, 6] } }).where(eq(pomodoroSimulatedAccounts.userId, userId))
    }
    const hostId = await realMember("host_one")
    const room = await realRoom(hostId, MORNING)
    for (let at = MORNING.getTime(); at <= MORNING.getTime() + 7 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    expect((await madeUpInside(room.id)).length).toBeGreaterThanOrEqual(1)
    // At three in the morning where they live, nobody comes.
    const night = new Date("2099-03-05T03:00:00Z")
    const late = await realRoom(await realMember("host_two"), night, "public", "late-real-room-pad")
    for (let at = night.getTime(); at <= night.getTime() + 7 * MINUTE; at += 30_000) await joinRealRooms(new Date(at))
    expect(await madeUpInside(late.id)).toHaveLength(0)
  })

  it("stays the drawn number of focuses", () => {
    const room = { focusMinutes: 25, shortBreakMinutes: 5 }
    for (const id of ["a", "b", "c", "d", "e"]) {
      const stay = realStayMs(id, room)
      expect([30, 60, 90].map((minutes) => minutes * MINUTE)).toContain(stay)
    }
  })
})
