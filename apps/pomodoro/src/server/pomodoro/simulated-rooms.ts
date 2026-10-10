import { randomBytes } from "node:crypto"

import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import {
  drawFrom,
  offsetMinutes,
  planSimulatedDay,
  shuffled,
  zonedInstant,
  type SimulatedHabits,
} from "@/lib/pomodoro/simulated-days"
import {
  HOST_SHARE,
  MIN_OPEN_ROOMS,
  TARGET_OPEN_ROOMS,
  ROOM_NAMES,
  ROOM_RHYTHMS,
  WEEKLY_HOSTS,
  arrivalDelayMs,
  betweenRoundsMs,
  longCountdownFor,
  firstFocusDelayMs,
  focusTargetFor,
  memberTargetFor,
  offsetDistance,
  roomNameFor,
  stayMs,
  type SimulatedHost,
} from "@/lib/pomodoro/simulated-rooms"
import { db } from "@/server/db"
import {
  awardAchievements,
  loadAchievementCounters,
} from "@/server/pomodoro/achievements"
import { listRoomPresets } from "@/server/pomodoro/admin-rooms"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import { localDateFor, startProductivitySession } from "@/server/pomodoro/productivity"
import {
  applyHostRoomAction,
  canJoinRoom,
  scheduleCountdownEnd,
  createRoomWithHost,
  joinRoomBySlug,
  leaveRoom,
  notifyRoom,
  saveRoomMedia,
} from "@/server/pomodoro/rooms"
import { createRoomRepeat } from "@/server/pomodoro/scheduled-rooms"
import {
  dailyFocusStats,
  pomodoroRoomRepeats,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  pomodoroSimulatedRooms,
  roomMemberships,
  rooms,
  type Room,
} from "@/server/pomodoro/schema"
import { ensureDayTasks } from "@/server/pomodoro/simulated-accounts"
import { sayBeforeStart, sayLeaving } from "@/server/pomodoro/simulated-chat"
import {
  DEFAULT_START_DELAY,
  STARTING_SOON_MIN_SECONDS,
  STARTING_SOON_WANTED,
} from "@/lib/pomodoro/room-countdown"
import { customShellUsers as users } from "@/server/schema"

/**
 * The rooms the made-up members host and sit in (live activity task 02). See
 * "Rooms" in `workspace/docs/made-up-members.md`.
 *
 * Every action goes through the same functions a person's buttons call:
 * `createRoomWithHost`, `applyHostRoomAction`, `joinRoomBySlug`, `leaveRoom`,
 * `createRoomRepeat`. The room clock, the booked-room worker and the featured
 * slot do the rest exactly as they do for real rooms.
 *
 * Tyler, 9 Oct 2026: rooms with nobody in them are worse than no rooms. The
 * one rule that outranks everything here: a room with a real person in it is
 * never closed by this worker. The host runs another cycle instead.
 */

/** A room is looked after by one pass at a time; a dead pass lets go after this. */
const CLAIM_TIMEOUT_MS = 5 * 60_000
/** A host who closed a room opens a covering one no sooner than this. */
const COVER_GAP_MS = 20 * 60_000
/** A host opens its day's room only this soon after its working day starts. */
const OPEN_WINDOW_MS = 60 * 60_000
/** Covering rooms are opened by hosts between these local hours. */
const COVER_FROM_HOUR = 7
const COVER_UNTIL_HOUR = 22
/** How long after leaving a made-up member may come back into the same room. */
const RETURN_AFTER_MS = 60 * 60_000

type HostAccount = {
  userId: string
  habits: SimulatedHabits
  pausedAt: Date | null
  removeRequestedAt: Date | null
}

const PASS_EVERY_MS = 60_000
let lastPassAt = 0
let passRunning = false

/** The pomodoro_settings row that holds the lease on the rooms pass. */
const PASS_LEASE_KEY = "simulated.roomsPass"

/**
 * Takes the rooms pass for this minute, or answers false when another server
 * copy, or an overlapping tick in this one, already has it. Without it two
 * passes both see a host short and both make one, or both save a weekly rule.
 */
export async function takePassLease(now: Date) {
  const stale = new Date(now.getTime() - PASS_EVERY_MS + 5_000)
  const taken = await db
    .insert(pomodoroSettings)
    .values({ key: PASS_LEASE_KEY, value: {}, updatedAt: now })
    .onConflictDoUpdate({
      target: pomodoroSettings.key,
      set: { updatedAt: now },
      setWhere: sql`${pomodoroSettings.updatedAt} < ${stale.toISOString()}::timestamptz`,
    })
    .returning({ key: pomodoroSettings.key })
  return taken.length > 0
}

/**
 * The `pomodoro-simulated-rooms` worker. Every tick it starts the waiting
 * rooms that are due, so a real person waits about 10 seconds rather than a
 * minute; the rest runs once a minute, never two at once.
 */
export async function runSimulatedRoomsPass(now = new Date()) {
  if (passRunning) return
  passRunning = true
  try {
    await startDueRooms(now)
    if (now.getTime() - lastPassAt < PASS_EVERY_MS) return
    lastPassAt = now.getTime()
    if (await takePassLease(now)) await runSimulatedRooms(now)
  } finally {
    passRunning = false
  }
}

/**
 * One pass. Pause everything
 * stops new rooms, new joins and new weekly rules; rooms already open run on
 * and close as planned.
 */
export async function runSimulatedRooms(now = new Date()) {
  const settings = await loadAppSettings()
  const { hoursCap } = settings["simulated.accounts"]
  // Pause everything, or the admin's "Pause new rooms": nothing new opens or
  // is booked, and nothing new joins. Rooms already open run on.
  const paused = settings["simulated.accounts"].paused || settings["safety.pause"].newRooms
  // Each step on its own, so one that fails (a room closed between a read and
  // a write, say) is logged and the rest of the minute's work still runs.
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run()
    } catch (error) {
      console.error(`made-up rooms: ${name} failed`, error)
    }
  }
  await step("assign hosts", assignHosts)
  await step("keep scenes live", keepScenesLive)
  if (!paused) await step("weekly rules", () => keepWeeklyRules(now))
  await step("record open rooms", recordOpenRooms)
  await step("tend rooms", () => tendRooms(now, paused))
  await step("start due rooms", () => startDueRooms(now))
  await step("room sessions", () => runRoomSessions(now, hoursCap))
  await step("featured", keepFeatured)
  if (!paused) await step("open rooms", () => openHostRooms(now, hoursCap))
  await step("remove left hosts", removeLeftHosts)
}

// ---------------------------------------------------------------------------
// Hosts
// ---------------------------------------------------------------------------

/**
 * Makes half of the made-up accounts hosts (`HOST_SHARE`), spread across the clock so
 * that somebody is awake to host at any hour. Each gets a rhythm, a room name
 * and a scene and sound pair no other host has, saved on its habit.
 */
export async function assignHosts() {
  const accounts = await db
    .select({ userId: pomodoroSimulatedAccounts.userId, habits: pomodoroSimulatedAccounts.habits })
    .from(pomodoroSimulatedAccounts)
    .where(isNull(pomodoroSimulatedAccounts.removeRequestedAt))
  const wanted = Math.round(accounts.length / HOST_SHARE)
  const hosts = accounts.filter((account) => account.habits.host)
  if (hosts.length >= wanted) return 0

  const catalog = await loadMediaCatalog()
  if (!catalog.themes.length || !catalog.sounds.length) return 0
  const presets = await listRoomPresets()
  const rhythms = [
    ...ROOM_RHYTHMS,
    ...presets.map((preset) => [preset.focusMinutes, preset.shortBreakMinutes, preset.longBreakMinutes] as const),
  ]
  const now = Date.now()
  const offsetOf = (habits: SimulatedHabits) => offsetMinutes(habits.timezone, now)
  let made = 0
  for (let index = hosts.length; index < wanted; index += 1) {
    const taken = hosts.map((host) => host.habits.host!)
    const candidates = shuffled(Math.random, accounts.filter((account) => !account.habits.host))
    if (!candidates.length) break
    // The account furthest round the clock from every host so far.
    const spread = (habits: SimulatedHabits) =>
      hosts.length ? Math.min(...hosts.map((host) => offsetDistance(offsetOf(host.habits), offsetOf(habits)))) : 0
    const chosen = candidates.reduce((best, account) => (spread(account.habits) > spread(best.habits) ? account : best))
    const usedScenes = new Set(taken.map((host) => host.background))
    const usedPairs = new Set(taken.map((host) => `${host.sound}|${host.background}`))
    const scenes = shuffled(Math.random, catalog.themes.map((theme) => `scene:${theme.key}`))
    const sounds = shuffled(Math.random, catalog.sounds.map((sound) => `curated:${sound.key}`))
    const pairs = [...scenes.filter((scene) => !usedScenes.has(scene)), ...scenes.filter((scene) => usedScenes.has(scene))]
      .flatMap((background) => sounds.map((sound) => ({ sound, background })))
      .filter((pair) => !usedPairs.has(`${pair.sound}|${pair.background}`))
    if (!pairs.length) break
    const usedNames = new Set(taken.map((host) => host.roomName))
    const names = ROOM_NAMES.map((name) => roomNameFor(name, chosen.habits.city)).filter((name) => !usedNames.has(name))
    // The rhythm fewest hosts have, so the open rooms never all keep one beat.
    const uses = (rhythm: readonly number[]) =>
      taken.filter((other) => other.focusMinutes === rhythm[0] && other.shortBreakMinutes === rhythm[1] && other.longBreakMinutes === rhythm[2]).length
    const fewest = Math.min(...rhythms.map(uses))
    const [focusMinutes, shortBreakMinutes, longBreakMinutes] = drawFrom(
      Math.random,
      rhythms.filter((rhythm) => uses(rhythm) === fewest)
    )
    const host: SimulatedHost = {
      roomName: names.length ? drawFrom(Math.random, names) : `${chosen.habits.city} focus`,
      focusMinutes,
      shortBreakMinutes,
      longBreakMinutes,
      ...pairs[0],
      weekly: taken.filter((other) => other.weekly).length < WEEKLY_HOSTS,
    }
    const habits = { ...chosen.habits, host }
    await db
      .update(pomodoroSimulatedAccounts)
      .set({ habits })
      .where(eq(pomodoroSimulatedAccounts.userId, chosen.userId))
    chosen.habits = habits
    hosts.push(chosen)
    made += 1
  }
  return made
}

/**
 * Keeps the hosts on the scenes and sounds that are Live now. Tyler, 9 Oct
 * 2026: "the rooms is not taking on the new themes I added". A host got its
 * pair when it was made, so a theme added later was never used, and a theme
 * taken out left its rooms drawing a plain gradient until they next opened.
 * Each pass:
 *
 * - a host on a scene or sound no longer Live gets the Live one fewest hosts
 *   have;
 * - while one Live scene has two more hosts than another, one host moves
 *   across, so a new theme is spread over the hosts within a pass;
 * - an open made-up room takes its host's pair at once when its scene is gone,
 *   and otherwise only while nobody real is in it, so a real person's room
 *   never changes under them;
 * - a weekly booking takes it too, so the room it books opens on it.
 */
async function keepScenesLive() {
  const catalog = await loadMediaCatalog()
  if (!catalog.themes.length || !catalog.sounds.length) return
  const scenes = catalog.themes.map((theme) => `scene:${theme.key}`)
  const sounds = new Set(catalog.sounds.map((sound) => `curated:${sound.key}`))
  const hosts = (await loadHosts()).filter((host) => !host.removeRequestedAt)
  const uses = new Map(scenes.map((scene) => [scene, 0]))
  for (const host of hosts) {
    const scene = host.habits.host!.background
    if (uses.has(scene)) uses.set(scene, uses.get(scene)! + 1)
  }
  const fewest = () => shuffled(Math.random, scenes).reduce((best, scene) => (uses.get(scene)! < uses.get(best)! ? scene : best))
  const changed = new Set<HostAccount>()
  for (const host of shuffled(Math.random, hosts)) {
    const pair = host.habits.host!
    const sceneLive = uses.has(pair.background)
    const soundLive = sounds.has(pair.sound)
    if (sceneLive && soundLive) continue
    const background = sceneLive ? pair.background : fewest()
    if (!sceneLive) uses.set(background, uses.get(background)! + 1)
    const sound = soundLive ? pair.sound : `curated:${drawFrom(Math.random, catalog.sounds).key}`
    host.habits = { ...host.habits, host: { ...pair, background, sound } }
    changed.add(host)
  }
  for (;;) {
    const most = scenes.reduce((best, scene) => (uses.get(scene)! > uses.get(best)! ? scene : best))
    const least = fewest()
    if (uses.get(most)! - uses.get(least)! < 2) break
    const mover = shuffled(Math.random, hosts).find((host) => host.habits.host!.background === most)
    if (!mover) break
    // Keeps "a pair no other host has": a sound nobody uses with that scene.
    const taken = new Set(hosts.flatMap((host) => (host.habits.host!.background === least ? [host.habits.host!.sound] : [])))
    const sound = taken.has(mover.habits.host!.sound)
      ? (shuffled(Math.random, [...sounds]).find((candidate) => !taken.has(candidate)) ?? mover.habits.host!.sound)
      : mover.habits.host!.sound
    mover.habits = { ...mover.habits, host: { ...mover.habits.host!, background: least, sound } }
    uses.set(most, uses.get(most)! - 1)
    uses.set(least, uses.get(least)! + 1)
    changed.add(mover)
  }
  for (const host of changed)
    await db.update(pomodoroSimulatedAccounts).set({ habits: host.habits }).where(eq(pomodoroSimulatedAccounts.userId, host.userId))

  const pairs = new Map(hosts.map((host) => [host.userId, host.habits.host!]))
  for (const { room } of await openHostedRooms()) {
    const pair = pairs.get(room.hostUserId)
    if (!pair || (room.background === pair.background && room.sound === pair.sound)) continue
    const sceneGone = !uses.has(room.background ?? "")
    if (!sceneGone && (await activeMembers(room.id)).some((member) => !member.madeUp)) continue
    try {
      await saveRoomMedia(room.slug, room.hostUserId, { sound: pair.sound, background: pair.background })
      await notifyRoom(room.id, "media")
    } catch (error) {
      // Closed since it was read: nothing to change.
      if (!(error instanceof Error && error.message === "ROOM_CLOSED")) throw error
    }
  }
  // One write for every weekly booking whose pair differs from its host's.
  await db.execute(sql`
    update ${pomodoroRoomRepeats} r
    set sound = a.habits -> 'host' ->> 'sound', background = a.habits -> 'host' ->> 'background'
    from ${pomodoroSimulatedAccounts} a
    where a.user_id = r.host_user_id and a.habits -> 'host' is not null
      and (r.sound is distinct from a.habits -> 'host' ->> 'sound'
        or r.background is distinct from a.habits -> 'host' ->> 'background')
  `)
}

async function loadHosts(): Promise<HostAccount[]> {
  const rows = await db
    .select({
      userId: pomodoroSimulatedAccounts.userId,
      habits: pomodoroSimulatedAccounts.habits,
      pausedAt: pomodoroSimulatedAccounts.pausedAt,
      removeRequestedAt: pomodoroSimulatedAccounts.removeRequestedAt,
    })
    .from(pomodoroSimulatedAccounts)
    .where(sql`${pomodoroSimulatedAccounts.habits} -> 'host' is not null`)
  return rows
}

/**
 * The room settings a host's room opens with. A pair that has since left the
 * Live catalogue is swapped for a Live one, so no room opens on a scene that
 * would not draw.
 */
async function hostRoomSettings(host: HostAccount) {
  const settings = host.habits.host!
  const catalog = await loadMediaCatalog()
  const sceneLive = catalog.themes.some((theme) => `scene:${theme.key}` === settings.background)
  const soundLive = catalog.sounds.some((sound) => `curated:${sound.key}` === settings.sound)
  if (!catalog.themes.length || !catalog.sounds.length) return null
  const background = sceneLive ? settings.background : `scene:${drawFrom(Math.random, catalog.themes).key}`
  const sound = soundLive ? settings.sound : `curated:${drawFrom(Math.random, catalog.sounds).key}`
  if (!sceneLive || !soundLive) {
    await db
      .update(pomodoroSimulatedAccounts)
      .set({ habits: { ...host.habits, host: { ...settings, sound, background } } })
      .where(eq(pomodoroSimulatedAccounts.userId, host.userId))
  }
  return {
    name: settings.roomName,
    visibility: "public" as const,
    focusMinutes: settings.focusMinutes,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    // The host starts each focus by hand, so the room waits, and stays on
    // Open to join, between rounds.
    autoStart: false,
    sound,
    background,
  }
}

/**
 * Three hosts keep a weekly booked room, on one of their working days at the
 * hour their day starts. It is saved with auto-start off, so it opens waiting
 * and this worker brings the host in and starts the first focus, the same as
 * a room it opens itself.
 */
async function keepWeeklyRules(now: Date) {
  const weekly = (await loadHosts()).filter(
    (host) => host.habits.host?.weekly && !host.pausedAt && !host.removeRequestedAt
  )
  if (!weekly.length) return
  const live = await db
    .select({ hostUserId: pomodoroRoomRepeats.hostUserId })
    .from(pomodoroRoomRepeats)
    .where(and(inArray(pomodoroRoomRepeats.hostUserId, weekly.map((host) => host.userId)), isNull(pomodoroRoomRepeats.cancelledAt)))
  const keeping = new Set(live.map((row) => row.hostUserId))
  for (const host of weekly) {
    if (keeping.has(host.userId)) continue
    const settings = await hostRoomSettings(host)
    if (!settings) return
    const workdays = [0, 1, 2, 3, 4, 5, 6].filter((day) => !host.habits.daysOff.includes(day))
    const weekday = drawFrom(Math.random, workdays.length ? workdays : [2])
    try {
      await createRoomRepeat(
        host.userId,
        {
          ...settings,
          autoStart: false,
          weekdays: 1 << weekday,
          startMinute: Math.min(1425, Math.round((host.habits.startHour * 60) / 15) * 15),
          timezone: host.habits.timezone,
          invites: [],
        },
        db,
        now
      )
    } catch (error) {
      console.error("a made-up host's weekly room could not be saved", error)
    }
  }
}

// ---------------------------------------------------------------------------
// The rooms already open
// ---------------------------------------------------------------------------

/** Open, running rooms hosted by made-up members. */
function openHostedRooms() {
  return db
    .select({ room: rooms })
    .from(rooms)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, rooms.hostUserId))
    .where(and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('scheduled', 'closed')`))
}

/** Writes the worker's row for every made-up host's open room it has not seen yet. */
async function recordOpenRooms() {
  const open = await openHostedRooms()
  if (!open.length) return
  await db
    .insert(pomodoroSimulatedRooms)
    .values(
      open.map(({ room }) => ({
        roomId: room.id,
        hostUserId: room.hostUserId,
        // A room first seen past waiting is taken to be in its first round.
        focusesRun: room.phase === "waiting" ? 0 : 1,
        focusTarget: focusTargetFor(room.id, room.focusMinutes),
        memberTarget: memberTargetFor(room.id),
      }))
    )
    .onConflictDoNothing()
}

type Member = { id: string; userId: string; joinedAt: Date; madeUp: boolean }

async function activeMembers(roomId: string): Promise<Member[]> {
  const rows = await db
    .select({
      id: roomMemberships.id,
      userId: roomMemberships.userId,
      joinedAt: roomMemberships.joinedAt,
      madeUp: sql<boolean>`${pomodoroSimulatedAccounts.userId} is not null`,
    })
    .from(roomMemberships)
    .leftJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
    .where(and(eq(roomMemberships.roomId, roomId), isNull(roomMemberships.leftAt)))
  return rows
}

/**
 * Moves every made-up room on by one step: the host comes in and starts the
 * first focus, made-up members arrive and leave, and a room whose host has
 * run its focuses closes, unless a real person is in it.
 */
async function tendRooms(now: Date, paused: boolean) {
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS)
  const claimed = await db
    .update(pomodoroSimulatedRooms)
    .set({ claimedAt: now })
    .where(
      sql`${pomodoroSimulatedRooms.roomId} in (
        select r.room_id from pomodoro_simulated_rooms r
        join rooms on rooms.id = r.room_id
        where rooms.closed_at is null and rooms.phase not in ('scheduled', 'closed')
          and (r.claimed_at is null or r.claimed_at < ${staleBefore.toISOString()}::timestamptz)
        for update of r skip locked
      )`
    )
    .returning()
  if (!claimed.length) return
  // The emptiest rooms first, so newcomers spread out rather than all
  // arriving in the first rooms looked at.
  const people = await db
    .select({ roomId: roomMemberships.roomId, count: sql<number>`count(*)::int` })
    .from(roomMemberships)
    .where(and(inArray(roomMemberships.roomId, claimed.map((row) => row.roomId)), isNull(roomMemberships.leftAt)))
    .groupBy(roomMemberships.roomId)
  const inside = new Map(people.map((row) => [row.roomId, row.count]))
  claimed.sort((a, b) => (inside.get(a.roomId) ?? 0) - (inside.get(b.roomId) ?? 0))
  try {
    for (const tended of claimed) {
      try {
        await tendRoom(tended, now, paused)
      } catch (error) {
        console.error("a made-up room could not move on", error)
      }
    }
  } finally {
    await db
      .update(pomodoroSimulatedRooms)
      .set({ claimedAt: null })
      .where(inArray(pomodoroSimulatedRooms.roomId, claimed.map((row) => row.roomId)))
  }
}

type TendedRoom = typeof pomodoroSimulatedRooms.$inferSelect

async function tendRoom(tended: TendedRoom, now: Date, paused: boolean) {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, tended.roomId)).limit(1)
  if (!room || room.closedAt || room.phase === "closed") return
  const [host] = await db
    .select({ removeRequestedAt: pomodoroSimulatedAccounts.removeRequestedAt })
    .from(pomodoroSimulatedAccounts)
    .where(eq(pomodoroSimulatedAccounts.userId, room.hostUserId))
  const members = await activeMembers(room.id)
  const realInside = members.some((member) => !member.madeUp)

  // Remove all left this host for the real person in its room. With them
  // gone, the host goes too, without finishing its planned focuses.
  if (host?.removeRequestedAt && !realInside) {
    if (await closeRoom(room, now)) await deleteLeftHost(room.hostUserId)
    return
  }

  // A booked room opens with nobody in it, its host included.
  if (!members.some((member) => member.userId === room.hostUserId)) {
    if (!canJoinRoom(room.phase)) return
    await joinRoomBySlug(room.slug, room.hostUserId, db, now)
    await notifyRoom(room.id, "membership")
  }

  if (room.phase === "short" || room.phase === "long") {
    for (const member of members) {
      if (!member.madeUp || member.userId === room.hostUserId) continue
      if (now.getTime() - member.joinedAt.getTime() < stayMs(member.id, room.focusMinutes, room.shortBreakMinutes)) continue
      // "gotta run" first (task 03).
      try {
        await sayLeaving(room, member.userId, now)
      } catch (error) {
        console.error("a made-up member's goodbye could not be said", error)
      }
      await leaveRoom(room.slug, member.userId, db, now)
      await notifyRoom(room.id, "membership")
    }
  }

  if (canJoinRoom(room.phase) && !paused && !host?.removeRequestedAt) await maybeJoin(room, tended, now)
}

// ---------------------------------------------------------------------------
// Starting and closing: what keeps a few rooms open at all times
// ---------------------------------------------------------------------------

/**
 * Public rooms that will stay on Open to join, real or made up: waiting or on
 * a break, and not counting down to a focus, because a room counting down
 * leaves the list when its countdown ends. Read afresh before each start, so
 * hosts deciding in the same pass see each other's starts.
 */
async function listedRooms(exceptRoomId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rooms)
    .where(
      and(
        eq(rooms.visibility, "public"),
        isNull(rooms.closedAt),
        sql`${rooms.phase} in ('waiting', 'short', 'long')`,
        isNull(rooms.startingAt),
        sql`${rooms.id} <> ${exceptRoomId}`
      )
    )
  return row?.count ?? 0
}

/**
 * Every made-up room waiting to start, looked at every tick (15 seconds) and
 * 10 seconds after a real person joins one. Tyler, 9 Oct 2026: "there needs
 * to be a few rooms open at all times" and "if one enters a room. it should
 * take about 10 seconds to start. Also the host should say something before
 * he starts".
 *
 * - With a real person in it, the host presses Start about 10 seconds after
 *   they came in, or after the break ended, with a 5-second countdown, and
 *   says a line while it runs.
 * - With nobody real in it, the host presses Start only while six other rooms
 *   (`MIN_OPEN_ROOMS`) stay on Open to join. While fewer than three rooms
 *   count down, a room with company starts an 8-to-15-minute one at once;
 *   otherwise it waits its own short wait and for nine others to be listed.
 * - A room whose focuses are done, or whose host's night has come, closes,
 *   but only with nobody real in it and six other rooms still listed, or
 *   once it is past 1am where the host lives.
 */
export async function startDueRooms(now = new Date()) {
  const waiting = await db
    .select({ room: rooms, tended: pomodoroSimulatedRooms })
    .from(rooms)
    .innerJoin(pomodoroSimulatedRooms, eq(pomodoroSimulatedRooms.roomId, rooms.id))
    .where(and(isNull(rooms.closedAt), eq(rooms.phase, "waiting")))
  let started = 0
  for (const { room, tended } of waiting) {
    try {
      if (await tendWaiting(room, tended, now)) started += 1
    } catch (error) {
      console.error("a made-up room could not start", error)
    }
  }
  return started
}

/** The same for one room, 10 seconds after a real person joined it. */
export async function startDueRoom(roomId: string, now = new Date()) {
  const [row] = await db
    .select({ room: rooms, tended: pomodoroSimulatedRooms })
    .from(rooms)
    .innerJoin(pomodoroSimulatedRooms, eq(pomodoroSimulatedRooms.roomId, rooms.id))
    .where(and(eq(rooms.id, roomId), isNull(rooms.closedAt), eq(rooms.phase, "waiting")))
  return row ? tendWaiting(row.room, row.tended, now) : false
}

/** How long after a real person came in, or the break ended, the host starts. */
export const REAL_START_DELAY_MS = 10_000

async function tendWaiting(room: Room, tended: TendedRoom, now: Date) {
  // A countdown is running: the room starts when it ends, whoever joins.
  // Tyler, 9 Oct 2026: joining "should obey the starting in... timer".
  if (room.startingAt) return false
  const members = await activeMembers(room.id)
  if (!members.some((member) => member.userId === room.hostUserId)) return false
  const real = members.filter((member) => !member.madeUp)
  // When the room fell into waiting: its open, or the end of the last break.
  const waitingSince = tended.focusesRun === 0 ? tended.createdAt : room.updatedAt

  if (real.length) {
    const lastCame = Math.max(waitingSince.getTime(), ...real.map((member) => member.joinedAt.getTime()))
    if (now.getTime() < lastCame + REAL_START_DELAY_MS) return false
    // Nobody real is ever left waiting for a host who has run its focuses.
    if (tended.focusesRun >= tended.focusTarget)
      await db
        .update(pomodoroSimulatedRooms)
        .set({ focusTarget: tended.focusesRun + 4 })
        .where(eq(pomodoroSimulatedRooms.roomId, room.id))
    // Somebody real is waiting, so the 5-second default, never minutes.
    return hostStarts(room, tended, now, "short")
  }

  const [host] = await db
    .select({ habits: pomodoroSimulatedAccounts.habits })
    .from(pomodoroSimulatedAccounts)
    .where(eq(pomodoroSimulatedAccounts.userId, room.hostUserId))
  const hour = host ? localHour(host.habits.timezone, now) : 12
  const night = hour >= 23 || hour < 6
  // From 1am to 6am the host goes to bed whatever the list says; hosts in
  // other cities are awake to keep three rooms on it.
  const deepNight = hour >= 1 && hour < 6
  const others = await listedRooms(room.id)
  const enoughOthers = others >= MIN_OPEN_ROOMS
  if (tended.focusesRun >= tended.focusTarget || night) {
    if (enoughOthers || deepNight) await closeRoom(room, now)
    return false
  }
  // "At least 3 starting in...": while fewer than three rooms count down a
  // minute or more, this one starts an 8-to-15-minute countdown now
  // (`longCountdownFor` says why so long). It stays listed while it counts,
  // so it needs no six others to start: asking for them left Starting soon
  // short a tenth of the day. Tyler, 10 Oct 2026: "the starting in... always
  // have 3+ rooms"; measured over a simulated day at 130 members, three or
  // more went from 90 checks in 100 to 99. Only once somebody besides the
  // host is in: a card under Starting soon with one face on it looks dead.
  if (members.length >= 2 && (await startingSoonCount(now)) < STARTING_SOON_WANTED)
    return hostStarts(room, tended, now, "long")
  // Any other start leaves six other rooms on the list.
  if (!enoughOthers) return false
  // An ordinary start keeps three more listed than that, spare for the next
  // countdowns, so rooms do not all slip into focus where nobody sees them.
  if (others < MIN_OPEN_ROOMS + STARTING_SOON_WANTED) return false
  const wait = tended.focusesRun === 0 ? firstFocusDelayMs(room.id) : betweenRoundsMs(room.id, tended.focusesRun)
  if (now.getTime() < waitingSince.getTime() + wait) return false
  return hostStarts(room, tended, now, "short")
}

/** Rooms counting down a minute or more right now: what "Starting soon" draws from. */
async function startingSoonCount(now: Date) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rooms)
    .where(
      and(
        eq(rooms.visibility, "public"),
        isNull(rooms.closedAt),
        eq(rooms.phase, "waiting"),
        sql`${rooms.startingAt} > ${now.toISOString()}::timestamptz`,
        sql`${rooms.countdownSeconds} >= ${STARTING_SOON_MIN_SECONDS}`
      )
    )
  return row?.count ?? 0
}

/**
 * The host says a line and starts the focus. The count goes up first, matched
 * on the count this pass read, so two passes or the join timer and a pass
 * never start one round twice.
 */
async function hostStarts(room: Room, tended: TendedRoom, now: Date, countdown: "short" | "long") {
  const [claimed] = await db
    .update(pomodoroSimulatedRooms)
    .set({ focusesRun: tended.focusesRun + 1 })
    .where(and(eq(pomodoroSimulatedRooms.roomId, room.id), eq(pomodoroSimulatedRooms.focusesRun, tended.focusesRun)))
    .returning({ roomId: pomodoroSimulatedRooms.roomId })
  if (!claimed) return false
  try {
    // Start begins the host's "Starting in" countdown for this round; the
    // room clock starts the focus when it ends.
    const seconds = countdown === "long" ? longCountdownFor(room.id, tended.focusesRun) : DEFAULT_START_DELAY
    const { room: counting } = await applyHostRoomAction(room.slug, room.hostUserId, "start_focus", db, now, seconds)
    if (counting.startingAt) scheduleCountdownEnd(counting.id, counting.startingAt)
  } catch (error) {
    await db
      .update(pomodoroSimulatedRooms)
      .set({ focusesRun: tended.focusesRun })
      .where(eq(pomodoroSimulatedRooms.roomId, room.id))
    throw error
  }
  await notifyRoom(room.id, "phase")
  // The line is said during the countdown, still before the focus, and after
  // Start, so a slow AI call never keeps somebody real waiting to begin.
  try {
    await sayBeforeStart(room, tended.focusesRun, now, countdown)
  } catch (error) {
    console.error("a made-up host's line before starting could not be said", error)
  }
  return true
}

/**
 * The host leaves, which closes its room, unless somebody real is in it. The
 * check and the close hold the room's lock, the one a join takes, so a real
 * person who joins after the worker looked is never shut out. True if closed.
 */
async function closeRoom(room: Room, now: Date) {
  const closed = await db.transaction(async (tx) => {
    await tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, room.id)).for("update")
    const [real] = await tx
      .select({ id: roomMemberships.id })
      .from(roomMemberships)
      .leftJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
      .where(and(eq(roomMemberships.roomId, room.id), isNull(roomMemberships.leftAt), isNull(pomodoroSimulatedAccounts.userId)))
      .limit(1)
    if (real) return false
    await leaveRoom(room.slug, room.hostUserId, tx, now)
    return true
  })
  if (closed) await notifyRoom(room.id, "phase")
  return closed
}

/**
 * One more made-up member, when the room is short of its target and the next
 * arrival is due: the first one to four minutes after the room opened, each
 * later one one to eight minutes after the last. A seat that empties is filled
 * again, because a room may wait a long while on the list.
 */
async function maybeJoin(room: Room, tended: TendedRoom, now: Date) {
  const arrivals = await db
    .select({ userId: roomMemberships.userId, joinedAt: roomMemberships.joinedAt, leftAt: roomMemberships.leftAt })
    .from(roomMemberships)
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
    .where(and(eq(roomMemberships.roomId, room.id), sql`${roomMemberships.userId} <> ${room.hostUserId}`))
    .orderBy(desc(roomMemberships.joinedAt))
  const inside = arrivals.filter((row) => !row.leftAt).length
  if (inside >= tended.memberTarget) return
  const since = arrivals[0]?.joinedAt ?? tended.createdAt
  if (now.getTime() < since.getTime() + arrivalDelayMs(room.id, arrivals.length)) return
  // Somebody who left may come back after an hour, as people do; never
  // straight back in.
  const recently = arrivals.filter((row) => !row.leftAt || now.getTime() - row.leftAt.getTime() < RETURN_AFTER_MS)
  const joiner = await pickJoiner(room, new Set(recently.map((row) => row.userId)), now)
  if (joiner) {
    await joinRoomBySlug(room.slug, joiner, db, now)
    await notifyRoom(room.id, "membership")
    return
  }
  // Nobody awake is free, which happens in the quiet hours: a room with only
  // its host borrows somebody from a room with company to spare, the way
  // people hop rooms, so no listed room sits with one face for long.
  if (inside === 0) await moveSomebodyIn(room, now)
}

/**
 * Moves one made-up member into `room` from another open made-up room that
 * has at least two made-up members besides its host, nobody real, and is
 * not mid-focus, never somebody who left `room` within the hour. They say
 * goodbye there first.
 */
async function moveSomebodyIn(room: Room, now: Date) {
  const [donor] = await db.execute<{ user_id: string; slug: string; room_id: string }>(sql`
    select m.user_id, r.slug, r.id as room_id
    from room_memberships m
    join rooms r on r.id = m.room_id
    join pomodoro_simulated_rooms t on t.room_id = r.id
    join pomodoro_simulated_accounts a on a.user_id = m.user_id
    where m.left_at is null and r.closed_at is null and r.id <> ${room.id}
      and r.phase in ('waiting', 'short', 'long') and r.starting_at is null
      and m.user_id <> r.host_user_id
      and a.paused_at is null and a.remove_requested_at is null
      and ${now.toISOString()}::timestamptz - m.joined_at > interval '10 minutes'
      and not exists (
        select 1 from room_memberships back where back.room_id = ${room.id} and back.user_id = m.user_id
          and back.left_at > ${now.toISOString()}::timestamptz - interval '1 hour')
      and not exists (
        select 1 from room_memberships x
        left join pomodoro_simulated_accounts xa on xa.user_id = x.user_id
        where x.room_id = r.id and x.left_at is null and xa.user_id is null)
      and (select count(*) from room_memberships y where y.room_id = r.id and y.left_at is null and y.user_id <> r.host_user_id) >= 2
    order by random()
    limit 1
  `).then((result) => (Array.isArray(result) ? result : (result as { rows: { user_id: string; slug: string; room_id: string }[] }).rows))
  if (!donor) return
  const [from] = await db.select().from(rooms).where(eq(rooms.id, donor.room_id)).limit(1)
  try {
    await sayLeaving(from, donor.user_id, now)
  } catch (error) {
    console.error("a made-up member's goodbye could not be said", error)
  }
  // The join itself ends their seat in the other room, in one step, so a
  // join that fails leaves them where they were.
  await joinRoomBySlug(room.slug, donor.user_id, db, now)
  await notifyRoom(donor.room_id, "membership")
  await notifyRoom(room.id, "membership")
}

/**
 * A made-up member free to join: in no room and hosting no open room, not
 * paused or leaving, not in this room in the last hour, and at work now or within the next ninety minutes by its
 * own day. With nobody at work, anybody awake between 7am and 11pm.
 */
async function pickJoiner(room: Room, beenHere: Set<string>, now: Date) {
  const free = await db
    .select({ userId: pomodoroSimulatedAccounts.userId, habits: pomodoroSimulatedAccounts.habits })
    .from(pomodoroSimulatedAccounts)
    .where(
      and(
        isNull(pomodoroSimulatedAccounts.pausedAt),
        isNull(pomodoroSimulatedAccounts.removeRequestedAt),
        sql`${pomodoroSimulatedAccounts.userId} <> ${room.hostUserId}`,
        sql`not exists (select 1 from room_memberships m where m.user_id = ${pomodoroSimulatedAccounts.userId} and m.left_at is null)`,
        // Joining a room closes any room you host, so a host whose booked room
        // has just opened, before it stepped in, is never picked.
        sql`not exists (select 1 from rooms h where h.host_user_id = ${pomodoroSimulatedAccounts.userId} and h.closed_at is null and h.phase not in ('scheduled', 'closed'))`
      )
    )
  const { hoursCap } = (await loadAppSettings())["simulated.accounts"]
  const candidates = free.filter((account) => !beenHere.has(account.userId))
  const atWork = candidates.filter((account) => {
    const plan = planSimulatedDay(account.userId, account.habits, localDateFor(account.habits.timezone, now), hoursCap)
    const first = plan.sessions[0]
    const last = plan.sessions[plan.sessions.length - 1]
    if (!first) return false
    const end = last.startsAt.getTime() + last.minutes * 60_000
    return now.getTime() >= first.startsAt.getTime() - 90 * 60_000 && now.getTime() < end
  })
  const awake = candidates.filter((account) => {
    const hour = localHour(account.habits.timezone, now)
    return hour >= 7 && hour < 23
  })
  // Hosts are kept free to open rooms of their own: a host joins somebody
  // else's only when no one else can.
  const notHost = (list: typeof candidates) => list.filter((account) => !account.habits.host)
  const pool = [notHost(atWork), notHost(awake), atWork, awake].find((list) => list.length) ?? []
  return pool.length ? drawFrom(Math.random, pool).userId : null
}

function localHour(timezone: string, at: Date) {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(at)
  )
}

/**
 * A made-up member in a room that is focusing runs its own timer with the
 * room, so "Focusing now" and the task beside its name read true. The session
 * ends with the room's focus, and never takes the day past the hours cap; one
 * past the cap sits in the room without a timer, like a person who stopped
 * counting.
 */
async function runRoomSessions(now: Date, hoursCap: number) {
  const due = await db
    .select({
      userId: roomMemberships.userId,
      habits: pomodoroSimulatedAccounts.habits,
      roomId: rooms.id,
      sequence: rooms.sequence,
      phaseEndsAt: rooms.phaseEndsAt,
    })
    .from(roomMemberships)
    .innerJoin(rooms, eq(rooms.id, roomMemberships.roomId))
    .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, roomMemberships.userId))
    .where(
      and(
        isNull(roomMemberships.leftAt),
        eq(rooms.phase, "focus"),
        isNull(rooms.closedAt),
        isNull(pomodoroSimulatedAccounts.removeRequestedAt),
        sql`not exists (select 1 from focus_sessions f where f.user_id = ${roomMemberships.userId} and f.status in ('running', 'paused'))`
      )
    )
  let started = 0
  for (const member of due) {
    try {
      if (!member.phaseEndsAt) continue
      const localDate = localDateFor(member.habits.timezone, now)
      const [today] = await db
        .select({ seconds: dailyFocusStats.focusSeconds })
        .from(dailyFocusStats)
        .where(and(eq(dailyFocusStats.userId, member.userId), eq(dailyFocusStats.localDate, localDate)))
      const left = hoursCap * 3_600 - (today?.seconds ?? 0)
      const plannedSeconds = Math.min(Math.floor((member.phaseEndsAt.getTime() - now.getTime()) / 1_000), left)
      if (plannedSeconds < 60) continue
      const plan = planSimulatedDay(member.userId, member.habits, localDate, hoursCap)
      const task = (await ensureDayTasks(member.userId, plan)).find((row) => row.status === "active")
      await startProductivitySession(member.userId, localDate, {
        mode: "focus",
        plannedSeconds,
        taskId: task?.id ?? null,
        idempotencyKey: `simulated-room:${member.roomId}:${member.sequence}`,
      })
      started += 1
    } catch (error) {
      console.error("a made-up member's room focus could not start", error)
    }
  }
  return started
}

// ---------------------------------------------------------------------------
// The featured slot
// ---------------------------------------------------------------------------

/**
 * When no room with a real host is featured, the made-up room with the most
 * people takes the slot; the moment an admin features a real room, the
 * worker lets go. A room an admin featured is never touched, and one whose
 * feature an admin took off is never featured again.
 */
export async function keepFeatured() {
  const open = and(isNull(rooms.closedAt), sql`${rooms.phase} not in ('scheduled', 'closed')`)
  const [realFeatured] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .leftJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, rooms.hostUserId))
    .leftJoin(pomodoroRoomRepeats, eq(pomodoroRoomRepeats.id, rooms.repeatId))
    .where(
      and(
        open,
        isNull(pomodoroSimulatedAccounts.userId),
        sql`(${rooms.featuredAt} is not null or coalesce(${pomodoroRoomRepeats.featured}, false))`
      )
    )
    .limit(1)
  const ours = await db
    .select({
      roomId: pomodoroSimulatedRooms.roomId,
      featured: pomodoroSimulatedRooms.featured,
      declined: pomodoroSimulatedRooms.featureDeclined,
      featuredAt: rooms.featuredAt,
      visibility: rooms.visibility,
      people: sql<number>`(select count(*) from room_memberships m where m.room_id = ${rooms.id} and m.left_at is null)::int`,
    })
    .from(pomodoroSimulatedRooms)
    .innerJoin(rooms, eq(rooms.id, pomodoroSimulatedRooms.roomId))
    .where(open)

  // A feature the worker set that an admin has since taken off.
  for (const room of ours.filter((row) => row.featured && !row.featuredAt)) {
    await db
      .update(pomodoroSimulatedRooms)
      .set({ featured: false, featureDeclined: true })
      .where(eq(pomodoroSimulatedRooms.roomId, room.roomId))
    room.featured = false
    room.declined = true
  }
  const mine = ours.filter((row) => row.featured && row.featuredAt)
  const unfeature = (roomIds: string[]) =>
    roomIds.length
      ? db.transaction(async (tx) => {
          await tx.update(rooms).set({ featuredAt: null }).where(inArray(rooms.id, roomIds))
          await tx
            .update(pomodoroSimulatedRooms)
            .set({ featured: false })
            .where(inArray(pomodoroSimulatedRooms.roomId, roomIds))
        })
      : undefined

  if (realFeatured) {
    await unfeature(mine.map((row) => row.roomId))
    return
  }
  // An admin featured one of these rooms: their choice stands alone.
  if (ours.some((row) => row.featuredAt && !row.featured)) return
  const best = ours
    .filter((row) => row.visibility === "public" && !row.declined)
    .sort((a, b) => b.people - a.people)[0]
  if (!best || mine.some((row) => row.roomId === best.roomId)) return
  await unfeature(mine.map((row) => row.roomId))
  await db.transaction(async (tx) => {
    await tx.update(rooms).set({ featuredAt: new Date() }).where(eq(rooms.id, best.roomId))
    await tx
      .update(pomodoroSimulatedRooms)
      .set({ featured: true })
      .where(eq(pomodoroSimulatedRooms.roomId, best.roomId))
  })
}

// ---------------------------------------------------------------------------
// Opening rooms
// ---------------------------------------------------------------------------

/**
 * A host opens its room at the start of its working day, once a day. While
 * fewer than nine rooms are on Open to join (six, plus three to count down),
 * or fewer than sixteen made-up rooms are open, hosts who are awake open
 * more, as many as it takes in one pass, so six stay listed while the rest
 * focus.
 */
async function openHostRooms(now: Date, hoursCap: number) {
  const hosts = (await loadHosts()).filter((host) => !host.pausedAt && !host.removeRequestedAt)
  if (!hosts.length) return 0
  const busy = new Set(
    (
      await db
        .select({ userId: roomMemberships.userId })
        .from(roomMemberships)
        .where(and(inArray(roomMemberships.userId, hosts.map((host) => host.userId)), isNull(roomMemberships.leftAt)))
    ).map((row) => row.userId)
  )
  // What Open to join shows: public rooms waiting or on a break, real or
  // made up. A room mid-focus is left off that list, so it does not count.
  const [listed] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.visibility, "public"), isNull(rooms.closedAt), sql`${rooms.phase} in ('waiting', 'short', 'long')`))
  let listedCount = listed?.count ?? 0
  let madeUpOpen = (await openHostedRooms()).length
  let opened = 0
  const free = hosts.filter((host) => !busy.has(host.userId))
  for (const host of free) {
    const localDate = localDateFor(host.habits.timezone, now)
    const first = planSimulatedDay(host.userId, host.habits, localDate, hoursCap).sessions[0]
    if (!first || now < first.startsAt || now.getTime() >= first.startsAt.getTime() + OPEN_WINDOW_MS) continue
    if (await hadRoomSince(host.userId, zonedInstant(localDate, 0, host.habits.timezone))) continue
    if (await openRoom(host, now)) {
      busy.add(host.userId)
      listedCount += 1
      madeUpOpen += 1
      opened += 1
    }
  }
  // Enough rooms that six stay listed besides the three counting down, which
  // leave the list when their countdowns end, while others focus.
  const listedWanted = MIN_OPEN_ROOMS + STARTING_SOON_WANTED
  if (listedCount >= listedWanted && madeUpOpen >= TARGET_OPEN_ROOMS) return opened

  // As many as it takes in one pass, not one a minute.
  for (const host of shuffled(Math.random, free.filter((host) => !busy.has(host.userId)))) {
    if (listedCount >= listedWanted && madeUpOpen >= TARGET_OPEN_ROOMS) break
    const hour = localHour(host.habits.timezone, now)
    if (hour < COVER_FROM_HOUR || hour >= COVER_UNTIL_HOUR) continue
    if (await closedRoomSince(host.userId, new Date(now.getTime() - COVER_GAP_MS))) continue
    if (await openRoom(host, now)) {
      listedCount += 1
      madeUpOpen += 1
      opened += 1
    }
  }
  return opened
}

/** A room this host opened, or booked to start, since that moment. */
async function hadRoomSince(hostUserId: string, since: Date) {
  const [row] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.hostUserId, hostUserId), sql`coalesce(${rooms.startsAt}, ${rooms.createdAt}) >= ${since.toISOString()}::timestamptz`))
    .limit(1)
  return Boolean(row)
}

async function closedRoomSince(hostUserId: string, since: Date) {
  const [row] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.hostUserId, hostUserId), isNotNull(rooms.closedAt), sql`${rooms.closedAt} >= ${since.toISOString()}::timestamptz`))
    .limit(1)
  return Boolean(row)
}

async function openRoom(host: HostAccount, now: Date) {
  const settings = await hostRoomSettings(host)
  if (!settings) return false
  try {
    const { room } = await createRoomWithHost(host.userId, randomBytes(18).toString("base64url"), settings, db, now)
    await db
      .insert(pomodoroSimulatedRooms)
      .values({
        roomId: room.id,
        hostUserId: host.userId,
        focusTarget: focusTargetFor(room.id, room.focusMinutes),
        memberTarget: memberTargetFor(room.id),
        createdAt: now,
      })
      .onConflictDoNothing()
  } catch (error) {
    // "Pause new rooms" or a suspension: the host simply does not open one.
    console.error("a made-up host's room could not open", error)
    return false
  }
  // Opening a room is the moment "first-room" is earned, as for a person.
  try {
    await awardAchievements(host.userId, await loadAchievementCounters(host.userId, localDateFor(host.habits.timezone, now)))
  } catch (error) {
    console.error("a made-up host's badges could not be checked", error)
  }
  return true
}

// ---------------------------------------------------------------------------
// Hosts Remove all left behind
// ---------------------------------------------------------------------------

async function deleteLeftHost(userId: string) {
  await db
    .delete(users)
    .where(
      and(
        eq(users.id, userId),
        sql`exists (select 1 from pomodoro_simulated_accounts s where s.user_id = ${userId} and s.remove_requested_at is not null)`
      )
    )
}

/**
 * Every host Remove all left behind whose room has since closed by any road,
 * an admin's Close included, goes now.
 */
async function removeLeftHosts() {
  const left = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
    .where(
      and(
        isNotNull(pomodoroSimulatedAccounts.removeRequestedAt),
        sql`not exists (select 1 from rooms r where r.host_user_id = ${pomodoroSimulatedAccounts.userId} and r.closed_at is null and r.phase not in ('scheduled', 'closed'))`
      )
    )
  for (const host of left) await deleteLeftHost(host.userId)
  return left.length
}
