import { randomUUID } from "node:crypto"

import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import {
  earnedAchievementIds,
  type AchievementCounters,
} from "@/lib/pomodoro/achievements"
import { HANDLE_MAX_LENGTH, RESERVED_HANDLES, isHandleShape } from "@/lib/pomodoro/public-profile"
import {
  arrivalGapMs,
  drawFrom,
  drawHabits,
  drawInt,
  lastSessionOfTask,
  planSimulatedDay,
  readSessionKey,
  sessionAt,
  sessionKey,
  shiftDate,
  shuffled,
  type DayPlan,
  type Random,
  type SimulatedHabits,
} from "@/lib/pomodoro/simulated-days"
import {
  SIMULATED_BIO_TAILS,
  SIMULATED_PERSONALITIES,
  SIMULATED_PLACES,
  SIMULATED_WORK,
  handleWord,
  type SimulatedPlace,
} from "@/lib/pomodoro/simulated-people"
import { db } from "@/server/db"
import {
  awardAchievements,
  loadAchievementCounters,
} from "@/server/pomodoro/achievements"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { loadMediaCatalog } from "@/server/pomodoro/catalog"
import {
  completeProductivitySession,
  localDateFor,
  startProductivitySession,
} from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroAchievements,
  pomodoroAuditLogs,
  pomodoroProfiles,
  pomodoroProjects,
  pomodoroSettings,
  pomodoroSimulatedAccounts,
  roomMemberships,
  rooms,
  tasks,
} from "@/server/pomodoro/schema"
import { forgetUsersPages } from "@/server/pomodoro/public-profile"
import { toggleTaskStatus } from "@/server/pomodoro/tasks"
import { customShellUsers as users } from "@/server/schema"

/**
 * The made-up members (live activity task 01). See
 * `workspace/docs/made-up-members.md`.
 *
 * Forty ordinary-looking accounts with a working day each. Tyler, 9 Oct 2026:
 * "We just need real accounts that mimic live activities." They show
 * wherever real members show, because the worker starts and finishes their
 * focus sessions through the timer's own code, which writes the same rows a
 * real member's timer does.
 *
 * Three rules hold everywhere in this file:
 * - Nobody can sign in as one and no email ever goes to one. The account row
 *   is written here rather than through the shell's `createAccountByAdmin`,
 *   because that sends a welcome email when there is no password, and the
 *   shell's delete sends an "account closed" email, so Remove all deletes the
 *   rows itself the way the shell's purge does.
 * - Only `pomodoro_simulated_accounts` says which accounts are made up.
 *   Nothing here ever picks accounts by their email address.
 * - Making and removing share one lock, so Remove all can never race a
 *   half-made batch, and two server copies never make one account twice.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export const SIMULATED_EMAIL_DOMAIN = "simulated.pomoder.com"
/** The pomodoro_settings row that means "Make them now" is still going. */
const MAKE_NOW_KEY = "simulated.makeNow"
/**
 * How far back a new account's history goes, drawn per account. Tyler, 9 Oct
 * 2026: "Since its a new app, we don't want there to be stats dating back too
 * far. Make it date back about 2-3 months".
 */
export const HISTORY_MIN_DAYS = 60
export const HISTORY_MAX_DAYS = 90
/** Accounts made per pass while Make them now is going. */
const MAKE_PER_PASS = 10
/** One worker pass looks after an account for at most this long. */
const CLAIM_TIMEOUT_MS = 5 * 60_000
/** The working day moves once a minute; making accounts runs every tick. */
const DAY_PASS_EVERY_MS = 60_000
/** Any number, as long as only this file uses it. */
const LOCK_KEY = 71_200_129
const INSERT_CHUNK = 500

const lockMaking = (tx: Transaction) => tx.execute(sql`select pg_advisory_xact_lock(${LOCK_KEY})`)

/** A met Make them now is forgotten, so raising the dial later starts no batch by itself. */
const forgetMakeNow = (database: Transaction | typeof db) =>
  database.delete(pomodoroSettings).where(eq(pomodoroSettings.key, MAKE_NOW_KEY))

// ---------------------------------------------------------------------------
// What the card reads
// ---------------------------------------------------------------------------

export type SimulatedStatus = {
  made: number
  target: number
  /** Make them now was pressed and the count is not met yet. */
  making: boolean
  /** Made-up members with a focus running right now. */
  focusingNow: number
  /** Hosts Remove all left until the real people in their rooms go. */
  leaving: number
}

export async function loadSimulatedStatus(now = new Date()): Promise<SimulatedStatus> {
  const settings = (await loadAppSettings())["simulated.accounts"]
  const [[made], [rush], [focusing], [leaving]] = await Promise.all([
    db
      .select({ total: count() })
      .from(pomodoroSimulatedAccounts)
      .where(isNull(pomodoroSimulatedAccounts.removeRequestedAt)),
    db
      .select({ key: pomodoroSettings.key })
      .from(pomodoroSettings)
      .where(eq(pomodoroSettings.key, MAKE_NOW_KEY)),
    db
      .select({ total: count() })
      .from(focusSessions)
      .innerJoin(
        pomodoroSimulatedAccounts,
        eq(pomodoroSimulatedAccounts.userId, focusSessions.userId)
      )
      .where(
        and(
          eq(focusSessions.status, "running"),
          sql`${focusSessions.targetEndsAt} > ${now.toISOString()}::timestamptz`
        )
      ),
    db
      .select({ total: count() })
      .from(pomodoroSimulatedAccounts)
      .where(isNotNull(pomodoroSimulatedAccounts.removeRequestedAt)),
  ])
  const total = made?.total ?? 0
  return {
    made: total,
    target: settings.target,
    making: Boolean(rush) && total < settings.target,
    focusingNow: focusing?.total ?? 0,
    leaving: leaving?.total ?? 0,
  }
}

/** Every made-up account's id, for the mark on the admin lists. */
export async function listSimulatedUserIds() {
  const rows = await db
    .select({ userId: pomodoroSimulatedAccounts.userId })
    .from(pomodoroSimulatedAccounts)
  return rows.map((row) => row.userId)
}

// ---------------------------------------------------------------------------
// The card's two buttons
// ---------------------------------------------------------------------------

/**
 * Make them now. Only queues the work: the worker makes up to ten a pass
 * until the count is met, so the request never times out and a half-made
 * batch is harmless. Answers whether there was anything to make.
 */
export async function requestMakeNow(actorUserId: string) {
  const status = await loadSimulatedStatus()
  if (status.made >= status.target) return { queued: false, ...status }
  await db.transaction(async (tx) => {
    await tx
      .insert(pomodoroSettings)
      .values({
        key: MAKE_NOW_KEY,
        value: { target: status.target },
        updatedByUserId: actorUserId,
      })
      .onConflictDoUpdate({
        target: pomodoroSettings.key,
        set: {
          value: { target: status.target },
          updatedByUserId: actorUserId,
          updatedAt: new Date(),
        },
      })
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "simulated_make",
      resource: "simulated",
      recordIds: [String(status.target)],
    })
  })
  return { queued: true, ...status, making: true }
}

/**
 * Remove all: every account named in the simulated table, and everything
 * they did with them, in one transaction. A real account is never touched,
 * because nothing outside that table is read to pick who goes.
 *
 * One kind stays for now: a host whose open room has a real person in it
 * (task 02). Deleting it would take the room out from under that person, so
 * it is marked instead, starts nothing new, and the rooms worker deletes it
 * once the last real person has left.
 */
export async function removeAllSimulated(actorUserId: string) {
  const removed = await db.transaction(async (tx) => {
    await lockMaking(tx)
    // Stops a Make them now still going, so it cannot start again after this.
    await forgetMakeNow(tx)
    const all = (
      await tx
        .select({ userId: pomodoroSimulatedAccounts.userId })
        .from(pomodoroSimulatedAccounts)
    ).map((row) => row.userId)
    const staying = new Set(
      (
        await tx
          .select({ userId: rooms.hostUserId })
          .from(rooms)
          .innerJoin(pomodoroSimulatedAccounts, eq(pomodoroSimulatedAccounts.userId, rooms.hostUserId))
          .where(
            and(
              isNull(rooms.closedAt),
              sql`${rooms.phase} not in ('scheduled', 'closed')`,
              sql`exists (
                select 1 from room_memberships m
                where m.room_id = ${rooms.id} and m.left_at is null
                  and not exists (select 1 from pomodoro_simulated_accounts s where s.user_id = m.user_id)
              )`
            )
          )
      ).map((row) => row.userId)
    )
    const ids = all.filter((userId) => !staying.has(userId))
    // The same delete the shell's purge runs: every table that belongs to an
    // account goes with it through its foreign key.
    if (ids.length) await tx.delete(users).where(inArray(users.id, ids))
    if (staying.size)
      await tx
        .update(pomodoroSimulatedAccounts)
        .set({ removeRequestedAt: new Date() })
        .where(inArray(pomodoroSimulatedAccounts.userId, [...staying]))
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "simulated_remove",
      resource: "simulated",
      recordIds: ids,
    })
    return { removed: ids.length, leaving: staying.size }
  })
  // /users holds its pages for five minutes; in this process they go now.
  forgetUsersPages()
  return removed
}

// ---------------------------------------------------------------------------
// The worker
// ---------------------------------------------------------------------------

let lastDayPassAt = 0
let passRunning = false

/**
 * The `pomodoro-simulated-days` worker. Making accounts runs on every tick
 * while Make them now is going, so forty are made in about a minute; the
 * working day moves once a minute. A pass still running when the next tick
 * comes is left to finish.
 */
export async function runSimulatedPass(now = new Date()) {
  if (passRunning) return
  passRunning = true
  try {
    await makeDueAccounts(now)
    if (now.getTime() - lastDayPassAt >= DAY_PASS_EVERY_MS) {
      lastDayPassAt = now.getTime()
      await runSimulatedDays(now)
    }
  } finally {
    passRunning = false
  }
}

type MakeDecision = {
  /** One more account to make, and how much history it gets, or null. */
  next: { historyDays: number } | null
  /** Make them now was pressed and the count is now met. */
  rushDone: boolean
}

/**
 * Whether to make one more account now, and with how much history. Read
 * under the lock, so it is still true when the account is written.
 *
 * - Make them now makes accounts until the count is met, each with two to
 *   three months behind it, created back when that history starts.
 * - Otherwise, while the count is under the dial, a new face arrives three to
 *   five days after the newest one, created today with nothing behind it, so
 *   the Newest tab on /users keeps changing.
 * - Nothing is ever made before the first Make them now, so a fresh database
 *   or a deploy never makes accounts by itself.
 */
async function decideNext(database: Transaction | typeof db, now: Date): Promise<MakeDecision> {
  const { target, paused } = (await loadAppSettings())["simulated.accounts"]
  const [[made], [rush], [newest]] = await Promise.all([
    database
      .select({ total: count() })
      .from(pomodoroSimulatedAccounts)
      .where(isNull(pomodoroSimulatedAccounts.removeRequestedAt)),
    database
      .select({ key: pomodoroSettings.key })
      .from(pomodoroSettings)
      .where(eq(pomodoroSettings.key, MAKE_NOW_KEY)),
    database
      .select({
        userId: pomodoroSimulatedAccounts.userId,
        createdAt: pomodoroSimulatedAccounts.createdAt,
      })
      .from(pomodoroSimulatedAccounts)
      .orderBy(desc(pomodoroSimulatedAccounts.createdAt))
      .limit(1),
  ])
  const total = made?.total ?? 0
  if (total >= target) return { next: null, rushDone: Boolean(rush) }
  if (rush)
    return {
      next: { historyDays: drawInt(Math.random, HISTORY_MIN_DAYS, HISTORY_MAX_DAYS) },
      rushDone: false,
    }
  if (paused || !newest) return { next: null, rushDone: false }
  const due = newest.createdAt.getTime() + arrivalGapMs(newest.userId)
  return { next: now.getTime() >= due ? { historyDays: 0 } : null, rushDone: false }
}

/** Makes the accounts that are due this pass. Answers how many. */
export async function makeDueAccounts(now = new Date()) {
  // Asked outside the lock first, so an idle pass costs a few small reads
  // rather than a transaction.
  const first = await decideNext(db, now)
  if (!first.next) {
    if (first.rushDone) await forgetMakeNow(db)
    return 0
  }
  const { hoursCap } = (await loadAppSettings())["simulated.accounts"]
  // Free themes only: these are free accounts, and a banner is their pick.
  const themes = (await loadMediaCatalog()).themes
    .filter((theme) => !theme.locked)
    .map((theme) => theme.key)
  let made = 0
  for (let index = 0; index < MAKE_PER_PASS; index += 1) {
    const result = await db.transaction(async (tx) => {
      await lockMaking(tx)
      const { next, rushDone } = await decideNext(tx, now)
      if (rushDone) await forgetMakeNow(tx)
      if (!next) return null
      await makeSimulatedAccount(tx, { ...next, hoursCap, themes, now })
      return next
    })
    if (!result) break
    made += 1
    // A new face arrives alone; only Make them now makes a batch.
    if (result.historyDays === 0) break
  }
  // Only this process's held /users pages; a separate worker program leaves
  // the web's to run out within five minutes.
  if (made) forgetUsersPages()
  return made
}

/**
 * One pass of the working day: finish every made-up session whose time is up,
 * then start one for anybody whose day says they should be focusing now.
 * Accounts are claimed first, with SKIP LOCKED, so two server copies never
 * look after the same account at once. Pause everything stops the starting;
 * running sessions still finish.
 */
export async function runSimulatedDays(now = new Date()) {
  const { hoursCap, paused } = (await loadAppSettings())["simulated.accounts"]
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS)
  const claimed = await db
    .update(pomodoroSimulatedAccounts)
    .set({ claimedAt: now })
    .where(
      sql`${pomodoroSimulatedAccounts.userId} in (
        select s.user_id from pomodoro_simulated_accounts s
        where s.claimed_at is null or s.claimed_at < ${staleBefore.toISOString()}::timestamptz
        for update skip locked
      )`
    )
    .returning({
      userId: pomodoroSimulatedAccounts.userId,
      habits: pomodoroSimulatedAccounts.habits,
      pausedAt: pomodoroSimulatedAccounts.pausedAt,
      removeRequestedAt: pomodoroSimulatedAccounts.removeRequestedAt,
    })
  if (!claimed.length) return { finished: 0, started: 0 }

  const ids = claimed.map((account) => account.userId)
  let finished = 0
  let started = 0
  try {
    const live = await db
      .select({
        id: focusSessions.id,
        userId: focusSessions.userId,
        plannedSeconds: focusSessions.plannedSeconds,
        targetEndsAt: focusSessions.targetEndsAt,
        idempotencyKey: focusSessions.idempotencyKey,
        createdAt: focusSessions.createdAt,
      })
      .from(focusSessions)
      .where(
        and(
          inArray(focusSessions.userId, ids),
          sql`${focusSessions.status} in ('running', 'paused')`
        )
      )
    // Somebody sitting in a room focuses with the room (task 02), not on
    // their own day's plan.
    const inRooms = new Set(
      (
        await db
          .select({ userId: roomMemberships.userId })
          .from(roomMemberships)
          .where(and(inArray(roomMemberships.userId, ids), isNull(roomMemberships.leftAt)))
      ).map((row) => row.userId)
    )
    for (const account of claimed) {
      // One account failing, such as one Remove all took a moment ago, never
      // stops the others' day.
      try {
        let busy = false
        for (const session of live.filter((row) => row.userId === account.userId)) {
          if (session.targetEndsAt && session.targetEndsAt <= now) {
            if (await finishSession(account, session, hoursCap)) finished += 1
          } else busy = true
        }
        if (busy || paused || account.pausedAt || account.removeRequestedAt || inRooms.has(account.userId)) continue
        if (await startDueSession(account, hoursCap, now)) started += 1
      } catch (error) {
        console.error("a made-up member's day could not move on", error)
      }
    }
  } finally {
    await db
      .update(pomodoroSimulatedAccounts)
      .set({ claimedAt: null })
      .where(inArray(pomodoroSimulatedAccounts.userId, ids))
  }
  return { finished, started }
}

type Account = { userId: string; habits: SimulatedHabits }

/**
 * Finishes one session through the timer's own code, ticks its task when the
 * day says so, and checks the badges the way a real finished focus does.
 */
async function finishSession(
  account: Account,
  session: { id: string; plannedSeconds: number; idempotencyKey: string; createdAt: Date },
  hoursCap: number
) {
  const key = readSessionKey(session.idempotencyKey)
  const localDate = key?.localDate ?? localDateFor(account.habits.timezone, session.createdAt)
  const completion = await completeProductivitySession(
    account.userId,
    session.id,
    session.plannedSeconds,
    localDate
  )
  if (!completion) return false

  const plan = planSimulatedDay(account.userId, account.habits, localDate, hoursCap)
  const planned = key ? plan.sessions[key.index] : undefined
  if (
    completion.task &&
    planned &&
    lastSessionOfTask(plan, planned) &&
    plan.tasks[planned.taskIndex]?.ticked
  ) {
    try {
      await toggleTaskStatus(account.userId, completion.task.id, localDate)
    } catch {
      // Ticked already or gone: the session is saved, which is what counts.
    }
  }
  try {
    await awardAchievements(
      account.userId,
      await loadAchievementCounters(account.userId, localDate)
    )
  } catch (error) {
    // Swallowed like the timer's own: the next finished focus awards it.
    console.error("a made-up member's badges could not be checked", error)
  }
  return true
}

/** Starts the session the day says is due now, if there is one. */
async function startDueSession(account: Account, hoursCap: number, now: Date) {
  const localDate = localDateFor(account.habits.timezone, now)
  const plan = planSimulatedDay(account.userId, account.habits, localDate, hoursCap)
  const due = sessionAt(plan, now)
  if (!due) return false

  // Never past the cap, even on a day the cap was lowered half way through.
  const [today] = await db
    .select({ seconds: dailyFocusStats.focusSeconds })
    .from(dailyFocusStats)
    .where(and(eq(dailyFocusStats.userId, account.userId), eq(dailyFocusStats.localDate, localDate)))
  const left = hoursCap * 3_600 - (today?.seconds ?? 0)
  const untilEnd = Math.floor((due.startsAt.getTime() + due.minutes * 60_000 - now.getTime()) / 1_000)
  const plannedSeconds = Math.min(untilEnd, left)
  if (plannedSeconds < 60) return false

  const dayTasks = await ensureDayTasks(account.userId, plan)
  const task = dayTasks[due.taskIndex]
  await startProductivitySession(account.userId, localDate, {
    mode: "focus",
    plannedSeconds,
    taskId: task?.status === "active" ? task.id : null,
    idempotencyKey: sessionKey(localDate, due.index),
  })
  return true
}

/**
 * The day's tasks, written the first time the day needs them. A day that
 * already has tasks keeps them as they are.
 */
export async function ensureDayTasks(userId: string, plan: DayPlan) {
  const existing = () =>
    db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.plannedDate, plan.localDate)))
      .orderBy(asc(tasks.sortOrder))
  const found = await existing()
  if (found.length || !plan.tasks.length) return found
  const projects = await projectIdsFor(db, userId)
  await db.insert(tasks).values(
    plan.tasks.map((task) => ({
      userId,
      title: task.title,
      plannedDate: plan.localDate,
      sortOrder: task.index + 1,
      projectId: projectFor(projects, task.projectSlot),
    }))
  )
  return existing()
}

async function projectIdsFor(database: Transaction | typeof db, userId: string) {
  const rows = await database
    .select({ id: pomodoroProjects.id })
    .from(pomodoroProjects)
    .where(eq(pomodoroProjects.userId, userId))
    .orderBy(asc(pomodoroProjects.name))
  return rows.map((row) => row.id)
}

function projectFor(projectIds: string[], slot: number | null) {
  if (slot === null || !projectIds.length) return null
  return projectIds[slot % projectIds.length]
}

// ---------------------------------------------------------------------------
// Making one account
// ---------------------------------------------------------------------------

type Taken = {
  names: Set<string>
  displayNames: Set<string>
  timezones: Map<string, number>
}

async function readTaken(tx: Transaction): Promise<Taken> {
  const rows = await tx
    .select({
      name: users.name,
      displayName: pomodoroProfiles.publicDisplayName,
      habits: pomodoroSimulatedAccounts.habits,
    })
    .from(pomodoroSimulatedAccounts)
    .innerJoin(users, eq(users.id, pomodoroSimulatedAccounts.userId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroSimulatedAccounts.userId))
  const timezones = new Map<string, number>()
  for (const row of rows)
    timezones.set(row.habits.timezone, (timezones.get(row.habits.timezone) ?? 0) + 1)
  return {
    names: new Set(rows.map((row) => row.name)),
    displayNames: new Set(rows.flatMap((row) => row.displayName ?? [])),
    timezones,
  }
}

/** A place with the fewest made-up members so far, and a name nobody has. */
function pickPerson(random: Random, taken: Taken) {
  const byCount = shuffled(random, SIMULATED_PLACES).sort(
    (a, b) => (taken.timezones.get(a.timezone) ?? 0) - (taken.timezones.get(b.timezone) ?? 0)
  )
  for (const place of byCount) {
    const free = place.firstNames.flatMap((first) =>
      place.lastNames
        .map((last) => ({ first, last, name: `${first} ${last}` }))
        .filter((person) => !taken.names.has(person.name))
    )
    if (free.length) return { place, ...drawFrom(random, free) }
  }
  throw new Error("SIMULATED_NAMES_USED_UP")
}

/** How the name shows on the profile: full, first and initial, or first only. */
function pickDisplayName(random: Random, person: { first: string; last: string; name: string }, taken: Taken) {
  const roll = random()
  const options =
    roll < 0.6
      ? [person.name]
      : roll < 0.85
        ? [`${person.first} ${person.last[0]}.`, person.name]
        : [person.first, `${person.first} ${person.last[0]}.`, person.name]
  return options.find((option) => !taken.displayNames.has(option)) ?? person.name
}

/** A handle in the shape real people pick, free and not reserved. */
async function pickHandle(
  tx: Transaction,
  random: Random,
  person: { first: string; last: string },
  place: SimulatedPlace
) {
  const first = handleWord(person.first)
  const last = handleWord(person.last)
  const city = handleWord(place.city)
  const candidates = shuffled(random, [
    `${first}${last}`,
    `${first}_${last}`,
    `${first}-${last}`,
    `${first}${last[0]}`,
    `${first}_${city}`,
    `${last}${first[0]}`,
  ])
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const base = candidates[attempt % candidates.length]
    // A clash gets digits, the way a taken handle does for a real person.
    const handle = (attempt < candidates.length ? base : `${base}${drawInt(random, 1, 99)}`).slice(
      0,
      HANDLE_MAX_LENGTH
    )
    if (!isHandleShape(handle) || RESERVED_HANDLES.has(handle)) continue
    const [profileTaken] = await tx
      .select({ userId: pomodoroProfiles.userId })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.handle, handle))
      .limit(1)
    const [emailTaken] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, `${handle}@${SIMULATED_EMAIL_DOMAIN}`))
      .limit(1)
    if (!profileTaken && !emailTaken) return handle
  }
  throw new Error("SIMULATED_HANDLE_NOT_FOUND")
}

/**
 * One made-up member, whole: the account, the public profile with every
 * switch on, three to five projects, the history and its badges, a banner and
 * pinned badges. Runs inside the caller's transaction and lock.
 */
export async function makeSimulatedAccount(
  tx: Transaction,
  {
    historyDays,
    hoursCap,
    themes,
    now,
    actorUserId = null,
  }: {
    historyDays: number
    hoursCap: number
    /** Keys of the Live themes a banner may be picked from. */
    themes: string[]
    now: Date
    actorUserId?: string | null
  }
) {
  const random: Random = Math.random
  const taken = await readTaken(tx)
  const person = pickPerson(random, taken)
  const { place } = person
  const work = drawFrom(random, SIMULATED_WORK)
  const colleague = drawFrom(
    random,
    place.firstNames.filter((first) => first !== person.first)
  )
  const taskTitles = work.tasks.map((title) => title.replace("{colleague}", colleague))
  const habits = drawHabits(random, place, taskTitles, historyDays)
  const handle = await pickHandle(tx, random, person, place)
  const bio = `${drawFrom(random, work.bios).replace("{city}", place.city)} ${drawFrom(random, SIMULATED_BIO_TAILS)}`.slice(0, 280)

  // An account with history joined when its history starts, a few days
  // before, so "member since" and the Newest tab agree with its year grid.
  const joinedAt = historyDays
    ? new Date(now.getTime() - (historyDays + drawInt(random, 1, 7)) * 86_400_000)
    : now
  const userId = randomUUID()
  await tx.insert(users).values({
    id: userId,
    email: `${handle}@${SIMULATED_EMAIL_DOMAIN}`,
    name: person.name,
    role: "member",
    status: "active",
    // No password ever matches null, so nobody can sign in as this account.
    passwordHash: null,
    // Set so the shell never sends the "confirm your address" reminder,
    // which only goes to unverified accounts.
    emailVerifiedAt: joinedAt,
    createdAt: joinedAt,
    updatedAt: joinedAt,
  })
  await tx.insert(pomodoroProfiles).values({
    userId,
    publicDisplayName: pickDisplayName(random, person, taken),
    timezone: place.timezone,
    handle,
    bio,
    profilePublic: true,
    listed: true,
    leaderboardOptIn: true,
    showFigures: true,
    showBadges: true,
    showHeatmap: true,
    showProjects: true,
    showFocusingNow: true,
    showRoom: true,
    shareTaskInRooms: true,
    cheersEnabled: true,
    bannerRef: themes.length ? `scene:${drawFrom(random, themes)}` : null,
  })
  await tx.insert(pomodoroSimulatedAccounts).values({
    userId,
    habits,
    personality: drawFrom(random, SIMULATED_PERSONALITIES),
    createdByUserId: actorUserId,
    createdAt: now,
  })

  // Three to five projects, the first two public so the profile's "What you
  // worked on" has something to show.
  const projectNames = shuffled(random, [...work.projects, ...place.localProjects]).slice(
    0,
    drawInt(random, 3, 5)
  )
  await tx.insert(pomodoroProjects).values(
    projectNames.map((name, index) => ({
      userId,
      name,
      isPublic: index < 2,
      createdAt: joinedAt,
      updatedAt: joinedAt,
    }))
  )

  const earned = historyDays
    ? await writeHistory(tx, { userId, habits, hoursCap, historyDays, now })
    : []
  if (earned.length) {
    // The newest three, the ones a person is proudest of this week.
    await tx
      .update(pomodoroProfiles)
      .set({ pinnedBadges: earned.slice(-drawInt(random, 1, 3)).reverse() })
      .where(eq(pomodoroProfiles.userId, userId))
  }
  return { userId, handle }
}

/**
 * The account's past: completed sessions, tasks and the day rows for every
 * day before today, following the same day plan the worker uses, with the
 * days off left empty. Badges are dated the day the counters crossed the line
 * and never notify anybody. Answers the badge ids in the order earned.
 */
async function writeHistory(
  tx: Transaction,
  {
    userId,
    habits,
    hoursCap,
    historyDays,
    now,
  }: {
    userId: string
    habits: SimulatedHabits
    hoursCap: number
    historyDays: number
    now: Date
  }
) {
  const today = localDateFor(habits.timezone, now)
  const projects = await projectIdsFor(tx, userId)
  const taskRows: Array<typeof tasks.$inferInsert> = []
  const sessionRows: Array<typeof focusSessions.$inferInsert> = []
  const dayRows: Array<typeof dailyFocusStats.$inferInsert> = []
  const badgeRows: Array<typeof pomodoroAchievements.$inferInsert> = []

  const counters: AchievementCounters = {
    focusSessions: 0,
    focusSeconds: 0,
    tasksCompleted: 0,
    roomsHosted: 0,
    bestStreak: 0,
  }
  const earned = new Set<string>()
  let streak = 0

  for (let back = historyDays; back >= 1; back -= 1) {
    const localDate = shiftDate(today, -back)
    const plan = planSimulatedDay(userId, habits, localDate, hoursCap)
    if (!plan.sessions.length) {
      streak = 0
      continue
    }
    const taskIds = plan.tasks.map(() => randomUUID())
    let ticked = 0
    for (const task of plan.tasks) {
      const own = plan.sessions.filter((session) => session.taskIndex === task.index)
      const last = own[own.length - 1]
      const finishedAt = new Date(last.startsAt.getTime() + last.minutes * 60_000)
      if (task.ticked) ticked += 1
      taskRows.push({
        id: taskIds[task.index],
        userId,
        title: task.title,
        status: task.ticked ? "completed" : "active",
        plannedDate: localDate,
        pomodoroCount: own.length,
        sortOrder: task.index + 1,
        projectId: projectFor(projects, task.projectSlot),
        completedAt: task.ticked ? finishedAt : null,
        createdAt: new Date(plan.sessions[0].startsAt.getTime() - 5 * 60_000),
        updatedAt: finishedAt,
      })
    }
    let seconds = 0
    for (const session of plan.sessions) {
      const endsAt = new Date(session.startsAt.getTime() + session.minutes * 60_000)
      seconds += session.minutes * 60
      sessionRows.push({
        userId,
        taskId: taskIds[session.taskIndex],
        mode: "focus",
        status: "completed",
        plannedSeconds: session.minutes * 60,
        accumulatedSeconds: session.minutes * 60,
        completedAt: endsAt,
        idempotencyKey: sessionKey(localDate, session.index),
        createdAt: session.startsAt,
        updatedAt: endsAt,
      })
    }
    const lastSession = plan.sessions[plan.sessions.length - 1]
    const dayEnd = new Date(lastSession.startsAt.getTime() + lastSession.minutes * 60_000)
    dayRows.push({
      userId,
      localDate,
      focusSessions: plan.sessions.length,
      focusSeconds: seconds,
      tasksCompleted: ticked,
      updatedAt: dayEnd,
    })

    streak += 1
    counters.focusSessions += plan.sessions.length
    counters.focusSeconds += seconds
    counters.tasksCompleted += ticked
    counters.bestStreak = Math.max(counters.bestStreak, streak)
    for (const badgeId of earnedAchievementIds(counters)) {
      if (earned.has(badgeId)) continue
      earned.add(badgeId)
      badgeRows.push({ userId, badgeId, earnedAt: dayEnd })
    }
  }

  // Tasks before sessions, because a session points at its task.
  for (const [table, rows] of [
    [tasks, taskRows],
    [focusSessions, sessionRows],
    [dailyFocusStats, dayRows],
    [pomodoroAchievements, badgeRows],
  ] as const) {
    for (let start = 0; start < rows.length; start += INSERT_CHUNK)
      await tx.insert(table).values(rows.slice(start, start + INSERT_CHUNK) as never)
  }
  return [...earned]
}
