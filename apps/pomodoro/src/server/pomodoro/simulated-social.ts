import { and, asc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"

import type { AppSettingValue } from "@/lib/pomodoro/app-settings"
import { CHEERS } from "@/lib/pomodoro/cheers"
import { MAX_FOLLOWING } from "@/lib/pomodoro/following"
import {
  drawFrom,
  drawInt,
  planSimulatedDay,
  seededRandom,
  shiftDate,
  zonedInstant,
  type SimulatedHabits,
} from "@/lib/pomodoro/simulated-days"
import { db } from "@/server/db"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { followByHandle, sendCheer } from "@/server/pomodoro/following"
import { localDateFor, loadFocusStreaks } from "@/server/pomodoro/productivity"
import { canJoinRoom, joinRoomBySlug, leaveRoom, notifyRoom } from "@/server/pomodoro/rooms"
import {
  dailyFocusStats,
  pomodoroBlocks,
  pomodoroFollows,
  pomodoroProfiles,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedReach,
  roomBans,
  roomMemberships,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import { sayArriving, sayLeaving } from "@/server/pomodoro/simulated-chat"
import { isReal } from "@/server/pomodoro/simulated-controls"
import { customShellUsers as users } from "@/server/schema"

/**
 * How the made-up members touch real ones (live activity task 04). See
 * "Touching real members" in `workspace/docs/made-up-members.md`.
 *
 * Four ways, each through the code a person's own button runs: they follow
 * and cheer one another so no count reads zero; they follow a real member who
 * publishes a profile and cheer a streak now and then; they join a real
 * host's public room and say hi; and any "no" a real member says holds.
 *
 * Tyler accepted on 9 Oct 2026 that a real member hears from accounts that do
 * not exist, joining a real host's room knowing it is the most deceptive item
 * on the list. This file keeps it to what he accepted: one or two follows, one
 * cheer a week, at most two in a room, public rooms only.
 *
 * A block in either direction is checked before every follow, cheer and join;
 * `blockAccount` drops a follow in the same step a block is made.
 */

const PASS_EVERY_MS = 60_000
const PASS_LEASE_KEY = "simulated.socialPass"
/** Joining real rooms is looked at every tick, so a visit lands within seconds of its time. */
const JOIN_LEASE_KEY = "simulated.joinPass"
const JOIN_LEASE_MS = 12_000
let lastPassAt = 0
let passRunning = false

/**
 * The `pomodoro-simulated-social` worker. Every tick (15 seconds) it looks
 * for real rooms due a visitor; once a minute it does the rest. Each part is
 * held by one server copy at a time.
 */
export async function runSimulatedSocialPass(now = new Date()) {
  if (passRunning) return
  passRunning = true
  try {
    if (await takeLease(JOIN_LEASE_KEY, JOIN_LEASE_MS, now)) await joinRealRooms(now)
    if (now.getTime() - lastPassAt < PASS_EVERY_MS) return
    lastPassAt = now.getTime()
    if (await takeLease(PASS_LEASE_KEY, PASS_EVERY_MS, now)) await runSimulatedSocial(now)
  } finally {
    passRunning = false
  }
}

async function takeLease(key: string, everyMs: number, now: Date) {
  const stale = new Date(now.getTime() - everyMs + 3_000)
  const taken = await db
    .insert(pomodoroSettings)
    .values({ key, value: {}, updatedAt: now })
    .onConflictDoUpdate({
      target: pomodoroSettings.key,
      set: { updatedAt: now },
      setWhere: sql`${pomodoroSettings.updatedAt} < ${stale.toISOString()}::timestamptz`,
    })
    .returning({ key: pomodoroSettings.key })
  return taken.length > 0
}

/**
 * One pass. Pause everything and the two switches stop anything new; made-up
 * members already in a real room still leave on time.
 */
export async function runSimulatedSocial(now = new Date()) {
  const settings = await loadAppSettings()
  const paused = settings["simulated.accounts"].paused
  const switches = settings["simulated.switches"]
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (error) {
      console.error(`made-up members: ${name} failed`, error)
    }
  }
  if (!paused && switches.follows) {
    await step("follow one another", () => followOneAnother(now))
    await step("cheer one another", () => cheerOneAnother(now))
    await step("reach real members", () => reachRealMembers(now))
  }
  await step("leave real rooms", () => leaveRealRooms(now))
  await step("join real rooms", () => joinRealRooms(now))
}

type Account = { userId: string; habits: SimulatedHabits; pausedAt: Date | null }

async function loadAccounts(): Promise<Account[]> {
  return db
    .select({
      userId: pomodoroSimulatedAccounts.userId,
      habits: pomodoroSimulatedAccounts.habits,
      pausedAt: pomodoroSimulatedAccounts.pausedAt,
    })
    .from(pomodoroSimulatedAccounts)
    .where(isNull(pomodoroSimulatedAccounts.removeRequestedAt))
}

/** Sets one key of a habit, so a write never wipes a key another pass wrote meanwhile. */
async function setHabit(userId: string, key: "followedAt" | "cheeredOn", value: string) {
  await db
    .update(pomodoroSimulatedAccounts)
    .set({ habits: sql`jsonb_set(${pomodoroSimulatedAccounts.habits}, ${`{${key}}`}::text[], ${JSON.stringify(value)}::jsonb)` })
    .where(eq(pomodoroSimulatedAccounts.userId, userId))
}

function localHour(timezone: string, at: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(at))
}

// ---------------------------------------------------------------------------
// Part 1: among themselves
// ---------------------------------------------------------------------------

/** One account in ten draws the crowd, so the graph is uneven the way real ones are. */
const POPULAR_SHARE = 0.1
/** How much likelier a popular account is to be followed. Tuned so one has about thirty followers in 130. */
const POPULAR_WEIGHT = 5
const FOLLOWS_MIN = 5
const FOLLOWS_MAX = 20

function isPopular(userId: string) {
  return seededRandom("popular", userId)() < POPULAR_SHARE
}

/**
 * How many others this account follows: five to twenty, mostly near five,
 * so the counts read like people's and not like a grid.
 */
function followsWanted(userId: string) {
  const roll = seededRandom("follows", userId)()
  return FOLLOWS_MIN + Math.floor((FOLLOWS_MAX - FOLLOWS_MIN + 1) * roll ** 4)
}

/**
 * Every made-up account that has not yet picked whom to follow picks five to
 * twenty of the others, weighted towards the popular few. Written straight as
 * follow rows, which is all a follow is, with no notice to anyone, the way
 * following works for everybody. Done once per account, marked on its habit,
 * so a follow an admin deletes is never put back. A new face arriving later
 * picks on the next pass.
 */
export async function followOneAnother(now: Date) {
  const accounts = await loadAccounts()
  if (accounts.length < 2) return 0
  const joined = new Map(
    (
      await db
        .select({ id: users.id, createdAt: users.createdAt })
        .from(users)
        .where(inArray(users.id, accounts.map((account) => account.userId)))
    ).map((row) => [row.id, row.createdAt.getTime()])
  )
  let picked = 0
  for (const account of accounts.filter((row) => !row.habits.followedAt)) {
    const random = seededRandom("follow-who", account.userId)
    const pool = accounts.filter((other) => other.userId !== account.userId)
    const chosen: string[] = []
    while (chosen.length < Math.min(followsWanted(account.userId), pool.length)) {
      const weights: number[] = pool.map((other) => (chosen.includes(other.userId) ? 0 : isPopular(other.userId) ? POPULAR_WEIGHT : 1))
      let roll = random() * weights.reduce((sum, weight) => sum + weight, 0)
      // The last one still open catches a roll that rounding carried past the end.
      let index = pool.length - 1
      while (weights[index] === 0) index -= 1
      for (let at = 0; at < pool.length; at += 1) {
        roll -= weights[at]
        if (weights[at] && roll < 0) {
          index = at
          break
        }
      }
      chosen.push(pool[index].userId)
    }
    // Each follow dated after both had joined, so none predates an account.
    const rows = chosen.map((followedUserId) => {
      const from = Math.max(joined.get(account.userId) ?? now.getTime(), joined.get(followedUserId) ?? now.getTime())
      return {
        followerUserId: account.userId,
        followedUserId,
        createdAt: new Date(from + random() * Math.max(0, now.getTime() - from)),
      }
    })
    if (rows.length) await db.insert(pomodoroFollows).values(rows).onConflictDoNothing()
    await setHabit(account.userId, "followedAt", now.toISOString())
    picked += 1
  }
  return picked
}

/** About one account in twelve cheers one of the people it follows on a given day. */
const CHEER_DAY_CHANCE = 0.08

/**
 * A handful of cheers a day among the made-up members: an account whose day
 * draws one sends it at a local minute between 9am and 9pm, to somebody it
 * follows, mostly to somebody on a streak. Through `sendCheer`, so the three
 * a day per pair cap holds and the notice lands as it would for a person.
 */
export async function cheerOneAnother(now: Date) {
  const accounts = (await loadAccounts()).filter((account) => !account.pausedAt)
  let sent = 0
  for (const account of accounts) {
    const localDate = localDateFor(account.habits.timezone, now)
    if (account.habits.cheeredOn === localDate) continue
    const random = seededRandom("cheer-day", account.userId, localDate)
    if (random() >= CHEER_DAY_CHANCE) continue
    if (now < zonedInstant(localDate, drawInt(random, 9 * 60, 21 * 60), account.habits.timezone)) continue
    // Marked first, so a refused cheer is not tried again every minute.
    await setHabit(account.userId, "cheeredOn", localDate)
    const followed = await db
      .select({ userId: pomodoroProfiles.userId, handle: pomodoroProfiles.handle })
      .from(pomodoroFollows)
      .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, pomodoroFollows.followedUserId))
      .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroFollows.followedUserId))
      .where(and(eq(pomodoroFollows.followerUserId, account.userId), isNotNull(pomodoroProfiles.handle)))
    if (!followed.length) continue
    const streaking = await onAStreak(followed.map((row) => row.userId), now)
    const pool = followed.flatMap((row) => (streaking.has(row.userId) ? [row, row, row] : [row]))
    const target = drawFrom(random, pool)
    try {
      await sendCheer({ fromUserId: account.userId, handle: target.handle!, cheerId: drawFrom(random, CHEERS).id })
      sent += 1
    } catch (error) {
      console.error("a made-up member's cheer could not be sent", error)
    }
  }
  return sent
}

/** Who among these focused on each of the three UTC days before today. */
async function onAStreak(userIds: string[], now: Date) {
  if (!userIds.length) return new Set<string>()
  const today = localDateFor("UTC", now)
  const rows = await db
    .select({ userId: dailyFocusStats.userId })
    .from(dailyFocusStats)
    .where(
      and(
        inArray(dailyFocusStats.userId, userIds),
        gte(dailyFocusStats.localDate, shiftDate(today, -3)),
        sql`${dailyFocusStats.localDate} < ${today}`,
        sql`${dailyFocusStats.focusSeconds} > 0`
      )
    )
    .groupBy(dailyFocusStats.userId)
    .having(sql`count(*) >= 3`)
  return new Set(rows.map((row) => row.userId))
}

// ---------------------------------------------------------------------------
// Part 2: following and cheering real members
// ---------------------------------------------------------------------------

/** The first follow comes between one and forty hours after the profile was first seen public. */
export function firstFollowDelayMs(userId: string) {
  return drawInt(seededRandom("reach-follow", userId), 60, 40 * 60) * 60_000
}
const WEEK_MS = 7 * 86_400_000
/** A real member on a streak this long gets a cheer. */
const CHEER_STREAK_DAYS = 3

/**
 * Real members with a public profile, each looked after by these rules:
 *
 * - one follow from a made-up account within 48 hours of the profile first
 *   being seen public, and a second a week later if they focused that week;
 * - one cheer a week while they are on a streak of three days or more, never
 *   when cheers are off;
 * - nothing at all once the profile is off or hidden, and nothing from an
 *   account either of them has blocked.
 *
 * The follow is a plain row and nobody is told, which is how following works
 * for everybody.
 */
export async function reachRealMembers(now: Date) {
  const people = await db
    .select({
      userId: pomodoroProfiles.userId,
      handle: pomodoroProfiles.handle,
      timezone: pomodoroProfiles.timezone,
      cheersEnabled: pomodoroProfiles.cheersEnabled,
      seenPublicAt: pomodoroSimulatedReach.seenPublicAt,
      followsSent: pomodoroSimulatedReach.followsSent,
      lastFollowAt: pomodoroSimulatedReach.lastFollowAt,
      lastCheerAt: pomodoroSimulatedReach.lastCheerAt,
    })
    .from(pomodoroProfiles)
    .innerJoin(users, eq(users.id, pomodoroProfiles.userId))
    .leftJoin(pomodoroSimulatedReach, eq(pomodoroSimulatedReach.userId, pomodoroProfiles.userId))
    .where(
      and(
        eq(pomodoroProfiles.profilePublic, true),
        isNull(pomodoroProfiles.hiddenAt),
        isNotNull(pomodoroProfiles.handle),
        eq(users.status, "active"),
        isReal(pomodoroProfiles.userId)
      )
    )
  const unseen = people.filter((person) => !person.seenPublicAt)
  if (unseen.length)
    await db
      .insert(pomodoroSimulatedReach)
      .values(unseen.map((person) => ({ userId: person.userId, seenPublicAt: now })))
      .onConflictDoNothing()

  const accounts = (await loadAccounts()).filter((account) => !account.pausedAt)
  if (!accounts.length || !people.length) return { follows: 0, cheers: 0 }
  // What each of them focused lately, in one read for everybody, so a pass
  // asks nothing per member until a follow or a cheer is actually due.
  const recent = await recentFocus(people.map((person) => person.userId), now)
  let follows = 0
  let cheers = 0
  for (const person of people) {
    try {
      const seen = person.seenPublicAt ?? now
      const sent = person.followsSent ?? 0
      const focus = recent.get(person.userId)
      const due =
        sent === 0
          ? now.getTime() >= seen.getTime() + firstFollowDelayMs(person.userId)
          : sent === 1 &&
            person.lastFollowAt !== null &&
            now.getTime() >= person.lastFollowAt.getTime() + WEEK_MS &&
            Boolean(focus?.weekSeconds)
      if (due && (await followRealMember(person.userId, person.handle!, accounts, now))) follows += 1

      const cheerDue =
        person.cheersEnabled &&
        (focus?.recentDays ?? 0) >= CHEER_STREAK_DAYS &&
        (!person.lastCheerAt || now.getTime() >= person.lastCheerAt.getTime() + WEEK_MS)
      if (cheerDue && (await cheerRealMember(person.userId, person.handle!, person.timezone, now))) cheers += 1
    } catch (error) {
      console.error("a made-up member could not reach a real one", error)
    }
  }
  return { follows, cheers }
}

/**
 * Each member's focus over the last seven days, and on how many of the last
 * four days they focused: a streak of three needs three of them, whichever
 * side of UTC midnight their own days fall.
 */
async function recentFocus(userIds: string[], now: Date) {
  const today = localDateFor("UTC", now)
  const rows = await db
    .select({
      userId: dailyFocusStats.userId,
      weekSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
      recentDays: sql<number>`count(*) filter (where ${dailyFocusStats.localDate} >= ${shiftDate(today, -3)} and ${dailyFocusStats.focusSeconds} > 0)::int`,
    })
    .from(dailyFocusStats)
    .where(and(inArray(dailyFocusStats.userId, userIds), gte(dailyFocusStats.localDate, shiftDate(today, -7))))
    .groupBy(dailyFocusStats.userId)
  return new Map(rows.map((row) => [row.userId, row]))
}

/** Every account with a block either way with this person. */
async function blockedWith(userId: string) {
  const rows = await db
    .select({ a: pomodoroBlocks.blockerUserId, b: pomodoroBlocks.blockedUserId })
    .from(pomodoroBlocks)
    .where(or(eq(pomodoroBlocks.blockerUserId, userId), eq(pomodoroBlocks.blockedUserId, userId)))
  return new Set(rows.map((row) => (row.a === userId ? row.b : row.a)))
}

/**
 * One more made-up follower: not one already following, not across a block,
 * not at the follow limit, and awake where it lives when one is. Through
 * `followByHandle`, which checks the block and the profile again.
 */
async function followRealMember(userId: string, handle: string, accounts: Account[], now: Date) {
  const [blocked, already, full] = await Promise.all([
    blockedWith(userId),
    db.select({ id: pomodoroFollows.followerUserId }).from(pomodoroFollows).where(eq(pomodoroFollows.followedUserId, userId)),
    db
      .select({ id: pomodoroFollows.followerUserId })
      .from(pomodoroFollows)
      .groupBy(pomodoroFollows.followerUserId)
      .having(sql`count(*) >= ${MAX_FOLLOWING}`),
  ])
  const skip = new Set([...blocked, ...already.map((row) => row.id), ...full.map((row) => row.id)])
  const free = accounts.filter((account) => !skip.has(account.userId))
  const awake = free.filter((account) => {
    const hour = localHour(account.habits.timezone, now)
    return hour >= 8 && hour < 22
  })
  const pool = awake.length ? awake : free
  if (!pool.length) return false
  const follower = drawFrom(seededRandom("reach-who", userId, now.getTime()), pool)
  try {
    await followByHandle(follower.userId, handle)
  } catch {
    // The profile went off or a block came in a moment ago: nothing to send.
    return false
  }
  await db
    .update(pomodoroSimulatedReach)
    .set({ followsSent: sql`${pomodoroSimulatedReach.followsSent} + 1`, lastFollowAt: now })
    .where(eq(pomodoroSimulatedReach.userId, userId))
  return true
}

/**
 * The week's cheer for a streak of three days or more, from a made-up account
 * that follows them, through `sendCheer` so it lands in the bell under Social.
 */
async function cheerRealMember(userId: string, handle: string, timezone: string | null, now: Date) {
  const { currentStreak } = await loadFocusStreaks(userId, localDateFor(timezone ?? "UTC", now))
  if (currentStreak < CHEER_STREAK_DAYS) return false

  const blocked = await blockedWith(userId)
  const followers = await db
    .select({ userId: pomodoroFollows.followerUserId })
    .from(pomodoroFollows)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, pomodoroFollows.followerUserId))
    .where(and(eq(pomodoroFollows.followedUserId, userId), isNull(pomodoroSimulatedAccounts.pausedAt), isNull(pomodoroSimulatedAccounts.removeRequestedAt)))
    .orderBy(asc(pomodoroFollows.createdAt))
  const from = followers.find((row) => !blocked.has(row.userId))
  if (!from) return false
  await sendCheer({ fromUserId: from.userId, handle, cheerId: "nice-streak" })
  await db.update(pomodoroSimulatedReach).set({ lastCheerAt: now }).where(eq(pomodoroSimulatedReach.userId, userId))
  return true
}

// ---------------------------------------------------------------------------
// Parts 3 and 4: a real host's public room
// ---------------------------------------------------------------------------

/** What `joinRoomBySlug` answers for a room that cannot take anybody right now. */
const EXPECTED_REFUSALS = new Set(["ROOM_FULL", "ROOM_LOCKED", "ROOM_CLOSED", "ROOM_NOT_FOUND", "ROOM_BANNED"])

/** No more than this many made-up members in one real room at a time. */
export const MOST_IN_A_REAL_ROOM = 2

/** One or two made-up visitors per real room, drawn once per room. */
export function visitorsFor(roomId: string) {
  return seededRandom("real-room", roomId)() < 0.5 ? 1 : 2
}

type VisitDelay = AppSettingValue<"simulated.realRoomVisit">

/**
 * How long after the room opens the first visitor comes, and after the first
 * the second: drawn once per room and visit between the card's soonest and
 * latest, 10 to 60 seconds to start.
 */
function arrivalAfterMs(roomId: string, arrived: number, delay: VisitDelay) {
  return drawInt(seededRandom("real-room-arrival", roomId, arrived), delay.minSeconds, delay.maxSeconds) * 1_000
}

/** One to three focuses with their breaks, drawn per visit. */
export function realStayMs(membershipId: string, room: Pick<Room, "focusMinutes" | "shortBreakMinutes">) {
  return drawInt(seededRandom("real-stay", membershipId), 1, 3) * cycleMs(room)
}

function cycleMs(room: Pick<Room, "focusMinutes" | "shortBreakMinutes">) {
  return (room.focusMinutes + room.shortBreakMinutes) * 60_000
}

/** Public rooms open now whose host is a real member. An unlisted room is somebody's private choice. */
function openRealRooms(onlyRoomId?: string) {
  return db
    .select()
    .from(rooms)
    .where(
      and(
        onlyRoomId ? eq(rooms.id, onlyRoomId) : undefined,
        eq(rooms.visibility, "public"),
        isNull(rooms.closedAt),
        sql`${rooms.phase} not in ('scheduled', 'closed')`,
        isReal(rooms.hostUserId)
      )
    )
}

type Visit = { id: string; userId: string; joinedAt: Date; leftAt: Date | null }

/** Every visit a made-up member has paid this room, the ones that ended included. */
async function madeUpVisits(roomId: string): Promise<Visit[]> {
  return db
    .select({ id: roomMemberships.id, userId: roomMemberships.userId, joinedAt: roomMemberships.joinedAt, leftAt: roomMemberships.leftAt })
    .from(roomMemberships)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
    .where(eq(roomMemberships.roomId, roomId))
    .orderBy(asc(roomMemberships.joinedAt))
}

/**
 * When a real member hosts a public room, one or two made-up members join it
 * while it waits or rests (who, in `pickRealRoomJoiner`), the first between
 * the card's soonest and latest after it opens, and say hi. Never more than
 * two at once, never a third visitor, and none at all once its host has
 * removed or banned one of them from it. Pause everything and the "Join real
 * rooms" switch stop it.
 */
export async function joinRealRooms(now: Date, onlyRoomId?: string) {
  const settings = await loadAppSettings()
  if (settings["simulated.accounts"].paused || !settings["simulated.switches"].joinReal) return 0
  const delay = settings["simulated.realRoomVisit"]
  let joined = 0
  for (const room of await openRealRooms(onlyRoomId)) {
    try {
      if (await visitRealRoom(room, delay, now)) joined += 1
    } catch (error) {
      // A full room, or one that closed or started a moment ago: nobody joins
      // it this time, and the next pass looks again without a word in the log.
      if (!(error instanceof Error && EXPECTED_REFUSALS.has(error.message)))
        console.error("a made-up member could not join a real room", error)
    }
  }
  return joined
}

/** One more visitor for this room, if one is due. True when somebody came. */
async function visitRealRoom(room: Room, delay: VisitDelay, now: Date) {
  if (!canJoinRoom(room.phase)) return false
  const visits = await madeUpVisits(room.id)
  const inside = visits.filter((visit) => !visit.leftAt)
  if (visits.length >= visitorsFor(room.id) || inside.length >= MOST_IN_A_REAL_ROOM) return false
  if (await hostSaidNo(room)) return false
  const since = visits.length ? visits[visits.length - 1].joinedAt.getTime() : openedAt(room)
  if (now.getTime() < since + arrivalAfterMs(room.id, visits.length, delay)) return false
  const pick = await pickRealRoomJoiner(room, new Set(visits.map((visit) => visit.userId)), now)
  if (!pick) return false
  const joiner = pick.userId
  // Somebody moving over from a made-up room says goodbye there first.
  const [from] = pick.fromRoomId ? await db.select().from(rooms).where(eq(rooms.id, pick.fromRoomId)).limit(1) : []
  if (from) {
    try {
      await sayLeaving(from, joiner, now)
    } catch (error) {
      console.error("a made-up member's goodbye could not be said", error)
    }
  }
  // The join ends their seat in the other room in the same step.
  await joinRoomBySlug(room.slug, joiner, db, now)
  await notifyRoom(room.id, "membership")
  if (from) await notifyRoom(from.id, "membership")
  try {
    await sayArriving(room, joiner, now)
  } catch (error) {
    console.error("a made-up member's hello could not be said", error)
  }
  return true
}

function openedAt(room: Room) {
  return Math.max(room.createdAt.getTime(), room.startsAt?.getTime() ?? 0)
}

/**
 * A real member just opened a public room: the first visit is timed for the
 * moment it is due, so it lands on the second rather than at the next
 * 15-second pass. The pass covers a server restart. Called by the
 * open-a-room endpoint; answers nothing and never throws.
 */
export async function timeFirstVisit(room: Room) {
  try {
    if (room.visibility !== "public") return
    const settings = await loadAppSettings()
    if (settings["simulated.accounts"].paused || !settings["simulated.switches"].joinReal) return
    const dueIn = openedAt(room) + arrivalAfterMs(room.id, 0, settings["simulated.realRoomVisit"]) - Date.now()
    const timer = setTimeout(() => {
      joinRealRooms(new Date(), room.id).catch((error) => console.error("a made-up member could not visit a new room", error))
    }, Math.max(0, dueIn) + 250)
    // A pending visit never keeps the server from shutting down.
    timer.unref?.()
  } catch (error) {
    console.error("a made-up member's visit could not be timed", error)
  }
}

/** The host removed or banned a made-up member from this room: nobody else comes. */
async function hostSaidNo(room: Room) {
  const [banned] = await db
    .select({ id: roomBans.id })
    .from(roomBans)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomBans.userId))
    .where(eq(roomBans.roomId, room.id))
    .limit(1)
  if (banned) return true
  const [removed] = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
    .where(sql`${pomodoroSimulatedAccounts.habits} -> 'removedFrom' @> ${JSON.stringify([{ roomId: room.id }])}::jsonb`)
    .limit(1)
  return Boolean(removed)
}

/** Seated this long in a made-up room before being moved to a real one. */
const SEATED_BEFORE_MOVING_MS = 10 * 60_000

/**
 * Who visits, in this order of preference. Everybody here has no "no" from
 * this host (no block either way, never banned from or removed from any of
 * its rooms), is not paused or leaving, and hosts no open room.
 *
 * 1. Free and at work by its own day right now.
 * 2. At work but sitting in a made-up room with nobody real in it, not in a
 *    focus, for ten minutes or more: a real host matters more than a made-up
 *    room, so it moves over. Found 11 Oct 2026: on a Sunday afternoon in UTC
 *    every member at work was already in a made-up room, and a real room got
 *    nobody.
 * 3. Free and awake where it lives (7am to 11pm), the same fallback the
 *    made-up rooms use when nobody is at work, such as a weekend.
 *
 * Nobody awake and free means nobody comes.
 */
async function pickRealRoomJoiner(room: Room, beenHere: Set<string>, now: Date) {
  // Named in full: in a select with no join the column comes out bare, and a
  // bare "user_id" inside these subqueries means their own row, not this one.
  const account = sql.raw("pomodoro_simulated_accounts.user_id")
  const seatedBefore = new Date(now.getTime() - SEATED_BEFORE_MOVING_MS).toISOString()
  const candidates = await db
    .select({
      userId: pomodoroSimulatedAccounts.userId,
      habits: pomodoroSimulatedAccounts.habits,
      // The made-up room it may be moved out of, or null when it is in no room.
      fromRoomId: sql<string | null>`(
        select m.room_id from room_memberships m
        join rooms r on r.id = m.room_id
        join pomodoro_simulated_rooms t on t.room_id = r.id
        where m.user_id = ${account} and m.left_at is null
          and r.host_user_id <> ${account}
          and r.phase in ('waiting', 'short', 'long')
          and m.joined_at < ${seatedBefore}::timestamptz
          and not exists (
            select 1 from room_memberships x
            where x.room_id = r.id and x.left_at is null
              and not exists (select 1 from pomodoro_simulated_accounts xs where xs.user_id = x.user_id))
        limit 1
      )`,
      seated: sql<boolean>`exists (select 1 from room_memberships m where m.user_id = ${account} and m.left_at is null)`,
    })
    .from(pomodoroSimulatedAccounts)
    .where(
      and(
        isNull(pomodoroSimulatedAccounts.pausedAt),
        isNull(pomodoroSimulatedAccounts.removeRequestedAt),
        sql`not exists (select 1 from rooms h where h.host_user_id = ${account} and h.closed_at is null and h.phase not in ('scheduled', 'closed'))`,
        sql`not exists (select 1 from pomodoro_blocks b where (b.blocker_user_id = ${room.hostUserId} and b.blocked_user_id = ${account}) or (b.blocked_user_id = ${room.hostUserId} and b.blocker_user_id = ${account}))`,
        sql`not exists (select 1 from room_bans x join rooms xr on xr.id = x.room_id where x.user_id = ${account} and xr.host_user_id = ${room.hostUserId})`,
        sql`not coalesce(${pomodoroSimulatedAccounts.habits} -> 'removedFrom' @> ${JSON.stringify([{ hostUserId: room.hostUserId }])}::jsonb, false)`
      )
    )
  const { hoursCap } = (await loadAppSettings())["simulated.accounts"]
  const atWork = (habits: SimulatedHabits, userId: string) => {
    const plan = planSimulatedDay(userId, habits, localDateFor(habits.timezone, now), hoursCap)
    const first = plan.sessions[0]
    const last = plan.sessions[plan.sessions.length - 1]
    return Boolean(first) && now >= first.startsAt && now.getTime() < last.startsAt.getTime() + last.minutes * 60_000
  }
  const awake = (habits: SimulatedHabits) => {
    const hour = localHour(habits.timezone, now)
    return hour >= 7 && hour < 23
  }
  const open = candidates.filter((row) => !beenHere.has(row.userId))
  const free = open.filter((row) => !row.seated)
  const movable = open.filter((row) => row.fromRoomId)
  const pool = [
    free.filter((row) => atWork(row.habits, row.userId)),
    movable.filter((row) => atWork(row.habits, row.userId)),
    free.filter((row) => awake(row.habits)),
  ].find((rows) => rows.length)
  if (!pool) return null
  const chosen = drawFrom(Math.random, pool)
  return { userId: chosen.userId, fromRoomId: chosen.seated ? chosen.fromRoomId : null }
}

/**
 * Made-up members leave a real room during a break with a line, never mid
 * focus, one per room per minute so the host is never left alone all at
 * once. Each stays one to three focuses, and the last one stays until three
 * focuses have passed since the first came. A block with the host sends one
 * out at once; a pause on the watch page sends one out at the next break.
 */
export async function leaveRealRooms(now: Date) {
  let left = 0
  for (const room of await openRealRooms()) {
    try {
      const visits = await madeUpVisits(room.id)
      const inside = visits.filter((visit) => !visit.leftAt)
      if (!inside.length) continue
      // One goes per minute at most.
      if (visits.some((visit) => visit.leftAt && now.getTime() - visit.leftAt.getTime() < 60_000)) continue
      const [blocked, paused] = await Promise.all([blockedWith(room.hostUserId), pausedOf(inside.map((visit) => visit.userId))])
      const onBreak = room.phase === "short" || room.phase === "long" || room.phase === "waiting"
      const company = now.getTime() < visits[0].joinedAt.getTime() + 3 * cycleMs(room)
      const leaving = inside.find((visit) => {
        if (blocked.has(visit.userId)) return true
        if (!onBreak) return false
        if (paused.has(visit.userId)) return true
        if (now.getTime() < visit.joinedAt.getTime() + realStayMs(visit.id, room)) return false
        // The last one keeps the host company until three focuses have passed.
        return !(inside.length === 1 && company)
      })
      if (!leaving) continue
      if (!blocked.has(leaving.userId)) {
        try {
          await sayLeaving(room, leaving.userId, now)
        } catch (error) {
          console.error("a made-up member's goodbye could not be said", error)
        }
      }
      await leaveRoom(room.slug, leaving.userId, db, now)
      await notifyRoom(room.id, "membership")
      left += 1
    } catch (error) {
      console.error("a made-up member could not leave a real room", error)
    }
  }
  return left
}

async function pausedOf(userIds: string[]) {
  const rows = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
    .where(and(inArray(pomodoroSimulatedAccounts.userId, userIds), isNotNull(pomodoroSimulatedAccounts.pausedAt)))
  return new Set(rows.map((row) => row.userId))
}
