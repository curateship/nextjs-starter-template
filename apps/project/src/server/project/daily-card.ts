import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm"

import {
  cardDayOf,
  DAILY_LIMITS,
  DAY_PARTS,
  DEFAULT_HOURS,
  DEFAULT_REMINDERS,
  firstNameOf,
  habitIsSetFor,
  JOURNAL_SEARCH_RESULTS,
  newMilestone,
  pickForDay,
  streakOf,
  weekStartOf,
  type DayHours,
  type DayPart,
  type HabitIcon,
  type JournalField,
  type RoutineReminders,
  type SkyKind,
  type Streak,
  type StreakDay,
  type WeatherKind,
  weatherKindOf,
} from "@/lib/project/daily-card"
import { READY_ROUTINES } from "@/lib/project/daily-words"
import { addDays, localNow, momentOf, weekdayOf } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { CLOSED_TASK_STATUSES } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { isSiteAdmin, requireSiteAdmin, type ProjectDb } from "@/server/project/access"
import { meetingsOn, type TodayMeeting } from "@/server/project/admin-dashboard"
import { loadClock } from "@/server/project/checkins"
import { holidayOn } from "@/server/project/holidays"
import { occurrencesBetween } from "@/server/project/meetings"
import { listTeamNames } from "@/server/project/record-team"
import {
  projectDailyCards,
  projectHabitDays,
  projectHabits,
  projectJournalDays,
  projectMeetingAnswers,
  projectMeetingPeople,
  projectMeetings,
  projectProjects,
  projectSiteAdminPrefs,
  projectTaskClockRuns,
  projectTasks,
  projectTeamHolidays,
  projectTeams,
  projectTimeOff,
} from "@/server/project/schema"
import { awayOn } from "@/server/project/time-off"
import { customShellUsers } from "@/server/schema"

/**
 * The Daily card at the top of My dashboard (task "Daily card/01", Tyler,
 * 29 Oct 2026; `workspace/docs/daily-card.md`). Everyone has one card. Its
 * hours, city and sky are each person's own; the habits, streaks and journal
 * are the site admin's alone ("The habits is admin only"), so every function
 * that reads or writes them asks for the site admin first, and none of it is
 * ever sent to anyone else.
 */

// --- What the card shows -------------------------------------------------------

export type DailySettings = {
  hours: DayHours
  /** The city in My settings, as the weather service named it. */
  city: string | null
  sky: SkyKind
  ownSkies: Record<DayPart, string>
  ownLines: string[]
  ownQuestions: string[]
  reminders: RoutineReminders
}

export type DailyMeeting = { meetingId: string; title: string; startsAt: string; endsAt: string }

/** One of the week's seven dots, Monday first. */
export type WeekDot = "done" | "missed" | "off" | "open" | "later"

export type DailyHabit = {
  id: string
  name: string
  part: DayPart
  position: number
  icon: HabitIcon | null
  target: number
  days: number[]
  atTime: string | null
  /** Set for the card's day; a habit on other weekdays isn't shown that day. */
  setToday: boolean
  count: number
  /** Set yesterday, and how many then, for "Tick yesterday". */
  yesterday: { set: boolean; count: number }
  week: WeekDot[]
  streak: Streak
}

export type JournalDay = {
  day: string
  intention: string
  rating: number | null
  note: string
  win: string
  question: string
  answer: string
  bedAt: string | null
  upAt: string | null
}

export type DailyTomorrow = {
  meetings: (DailyMeeting & { teamName: string })[]
  due: { taskId: string; projectId: string; title: string; projectName: string }[]
  /** Due tomorrow beyond those listed. */
  moreDue: number
  away: { name: string; teamName: string }[]
  holidays: { name: string; teamName: string }[]
}

export type SiteAdminDaily = {
  habits: DailyHabit[]
  retired: { id: string; name: string; part: DayPart }[]
  /** Days in a row with every habit set for that day ticked. */
  finished: Streak
  /** A streak milestone reached and not yet celebrated, such as "finished:7". */
  milestone: string | null
  today: JournalDay
  /** Tomorrow's intention, written tonight. */
  tomorrowIntention: string
  line: string
  question: string
  /** Ratings of the last 30 card days, oldest first; null where none was given. */
  trend: { day: string; rating: number | null }[]
  onThisDay: { day: string; text: string } | null
  /** On Sunday: this week's ratings and wins, Monday first. */
  lookBack: { day: string; rating: number | null; win: string }[] | null
  /** On the first of the month: last month at a glance. */
  monthly: MonthlyReview | null
  tomorrow: DailyTomorrow
}

export type MonthlyReview = {
  month: string
  bestHabit: { name: string; done: number; of: number } | null
  /** The typical rating, the middle one when they're put in order. */
  typicalRating: number | null
  wins: string[]
}

export type DailyCard = {
  /** When the card was loaded, so the page and the browser draw the same moment first. */
  loadedAt: string
  firstName: string
  siteAdmin: boolean
  zone: string
  /** Today in the person's zone, for tasks and meetings. */
  today: string
  /** The card's own day: before morning starts it is still last night. */
  cardDay: string
  settings: DailySettings
  meetings: DailyMeeting[]
  /** Time on the task clock today, counted to the moment the card loaded, and the clock still going. */
  clock: { seconds: number; running: { taskId: string; projectId: string; title: string; since: string } | null }
  finishedToday: { taskId: string; projectId: string; title: string }[]
  /** "Enjoy your day off", or the holiday's name, on a day off. */
  dayOff: string | null
  admin: SiteAdminDaily | null
}

const DEFAULT_SETTINGS: DailySettings = {
  hours: DEFAULT_HOURS,
  city: null,
  sky: "drawn",
  ownSkies: { morning: "", afternoon: "", night: "" },
  ownLines: [],
  ownQuestions: [],
  reminders: DEFAULT_REMINDERS,
}

/** How many tasks due tomorrow are named before "and 3 more". */
const TOMORROW_DUE_SHOWN = 6
/** The zone the site admin's card counts in before one is saved, as on their dashboard. */
const FALLBACK_ZONE = "UTC"

type SettingsRow = typeof projectDailyCards.$inferSelect

function settingsOf(row: SettingsRow | undefined): DailySettings {
  if (!row) return DEFAULT_SETTINGS
  return {
    hours: { morning: row.morningAt, afternoon: row.afternoonAt, night: row.nightAt },
    city: row.city,
    sky: row.sky,
    ownSkies: { morning: row.ownSkyMorning, afternoon: row.ownSkyAfternoon, night: row.ownSkyNight },
    ownLines: row.ownLines,
    ownQuestions: row.ownQuestions,
    reminders: { morning: row.reminderMorning, afternoon: row.reminderAfternoon, night: row.reminderNight },
  }
}

async function settingsRow(userId: string, database: ProjectDb) {
  const [row] = await database.select().from(projectDailyCards).where(eq(projectDailyCards.userId, userId))
  return row
}

/** The person's own zone: an employee's from their team row, the site admin's from My settings. */
async function zoneOf(userId: string, siteAdmin: boolean, database: ProjectDb) {
  if (siteAdmin) {
    const [prefs] = await database
      .select({ zone: projectSiteAdminPrefs.timeZone })
      .from(projectSiteAdminPrefs)
      .where(eq(projectSiteAdminPrefs.userId, userId))
    return { zone: prefs?.zone ?? FALLBACK_ZONE, teamId: null }
  }
  const { membership, clock } = await loadClock(userId, database)
  return { zone: clock.zone, teamId: membership.teamId }
}

export async function loadDailyCard(userId: string, database: ProjectDb = db, at = new Date()): Promise<DailyCard> {
  const siteAdmin = await isSiteAdmin(userId, database)
  const [me] = await database
    .select({ name: customShellUsers.name })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
  const { zone, teamId } = await zoneOf(userId, siteAdmin, database)
  const row = await settingsRow(userId, database)
  const settings = settingsOf(row)
  const local = localNow(at, zone)
  const today = local.day
  const cardDay = cardDayOf(today, local.time, settings.hours)
  const teams = siteAdmin ? await listTeamNames(database) : []
  const daysOff = siteAdmin ? await siteAdminDaysOff(userId, teams.length, database) : null

  return {
    loadedAt: at.toISOString(),
    firstName: firstNameOf(me?.name ?? ""),
    siteAdmin,
    zone,
    today,
    cardDay,
    settings,
    meetings: siteAdmin
      ? await withoutNotGoing(
          userId,
          await meetingsOn(today, zone, teams.map((team) => team.id), new Map(teams.map((team) => [team.id, team.name])), database),
          database
        ).then(asDailyMeetings)
      : await invitedMeetingsOn(userId, teamId!, today, zone, database),
    clock: await clockToday(userId, today, zone, database, at),
    finishedToday: await finishedOn(userId, today, zone, database),
    dayOff: siteAdmin
      ? daysOff!.has(today)
        ? "Enjoy your day off"
        : null
      : await employeeDayOff(userId, teamId!, today, database),
    admin: siteAdmin
      ? await siteAdminDaily(userId, row, settings, cardDay, zone, teams, daysOff!, database)
      : null,
  }
}

async function employeeDayOff(userId: string, teamId: string, today: string, database: ProjectDb) {
  if ((await awayOn([userId], today, database)).has(userId)) return "Enjoy your day off"
  const holiday = await holidayOn(teamId, today, database)
  return holiday ? `Enjoy ${holiday}` : null
}

/**
 * The site admin's days off: their own time off, and every day all the teams
 * share a holiday. The site admin is on no team, so one team's holiday isn't
 * theirs.
 */
async function siteAdminDaysOff(userId: string, teamCount: number, database: ProjectDb) {
  const days = new Set<string>()
  const away = await database
    .select({ firstDay: projectTimeOff.firstDay, lastDay: projectTimeOff.lastDay })
    .from(projectTimeOff)
    .where(eq(projectTimeOff.userId, userId))
  for (const row of away) for (let day = row.firstDay; day <= row.lastDay; day = addDays(day, 1)) days.add(day)
  if (teamCount > 0) {
    const shared = await database
      .select({ day: projectTeamHolidays.day })
      .from(projectTeamHolidays)
      .innerJoin(projectTeams, eq(projectTeams.id, projectTeamHolidays.teamId))
      .where(isNull(projectTeams.personalUserId))
      .groupBy(projectTeamHolidays.day)
      .having(sql`count(distinct ${projectTeamHolidays.teamId}) >= ${teamCount}`)
    for (const row of shared) days.add(row.day)
  }
  return days
}

function asDailyMeetings(meetings: TodayMeeting[]): DailyMeeting[] {
  return meetings.map(({ meetingId, title, startsAt, endsAt }) => ({ meetingId, title, startsAt, endsAt }))
}

async function withoutNotGoing<T extends { meetingId: string }>(userId: string, meetings: T[], database: ProjectDb) {
  if (meetings.length === 0) return meetings
  const declined = await database
    .select({ meetingId: projectMeetingAnswers.meetingId })
    .from(projectMeetingAnswers)
    .where(
      and(
        eq(projectMeetingAnswers.userId, userId),
        eq(projectMeetingAnswers.answer, "not_going"),
        inArray(projectMeetingAnswers.meetingId, meetings.map((meeting) => meeting.meetingId))
      )
    )
  const no = new Set(declined.map((row) => row.meetingId))
  return meetings.filter((meeting) => !no.has(meeting.meetingId))
}

/** An employee's meetings today: the ones they're invited to and haven't said Not going to. */
async function invitedMeetingsOn(userId: string, teamId: string, day: string, zone: string, database: ProjectDb) {
  const rows = await database
    .select({ meeting: projectMeetings })
    .from(projectMeetings)
    .innerJoin(projectMeetingPeople, eq(projectMeetingPeople.meetingId, projectMeetings.id))
    .where(and(eq(projectMeetings.teamId, teamId), eq(projectMeetingPeople.userId, userId)))
  const meetings = rows.flatMap(({ meeting }) =>
    occurrencesBetween(meeting, zone, day, day).map((occurrence) => ({
      meetingId: meeting.id,
      title: meeting.title,
      startsAt: occurrence.startsAt,
      endsAt: occurrence.endsAt,
    }))
  )
  return (await withoutNotGoing(userId, meetings, database)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/**
 * Seconds on the task clock today in the person's zone: every stretch since
 * midnight, one begun before it counting from midnight, and fixes made today.
 */
async function clockToday(userId: string, today: string, zone: string, database: ProjectDb, at: Date) {
  const start = momentOf(today, "00:00", zone)
  const rows = await database
    .select({
      taskId: projectTaskClockRuns.taskId,
      kind: projectTaskClockRuns.kind,
      startedAt: projectTaskClockRuns.startedAt,
      stoppedAt: projectTaskClockRuns.stoppedAt,
      seconds: projectTaskClockRuns.seconds,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
    })
    .from(projectTaskClockRuns)
    .innerJoin(projectTasks, eq(projectTasks.id, projectTaskClockRuns.taskId))
    .where(
      and(
        eq(projectTaskClockRuns.userId, userId),
        isNull(projectTasks.deletedAt),
        or(isNull(projectTaskClockRuns.stoppedAt), gte(projectTaskClockRuns.stoppedAt, start))
      )
    )
  let seconds = 0
  let running: DailyCard["clock"]["running"] = null
  for (const row of rows) {
    if (row.kind === "fix") {
      if (row.startedAt >= start) seconds += row.seconds ?? 0
      continue
    }
    seconds += Math.max(0, Math.floor(((row.stoppedAt ?? at).getTime() - Math.max(row.startedAt.getTime(), start.getTime())) / 1000))
    if (!row.stoppedAt) running = { taskId: row.taskId, projectId: row.projectId, title: row.title, since: row.startedAt.toISOString() }
  }
  return { seconds: Math.max(0, seconds), running }
}

/** Tasks the person finished today in their zone. */
async function finishedOn(userId: string, today: string, zone: string, database: ProjectDb) {
  return database
    .select({ taskId: projectTasks.id, projectId: projectTasks.projectId, title: projectTasks.title })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.assigneeUserId, userId),
        eq(projectTasks.status, "done"),
        isNull(projectTasks.deletedAt),
        gte(projectTasks.completedAt, momentOf(today, "00:00", zone)),
        lte(projectTasks.completedAt, momentOf(addDays(today, 1), "00:00", zone))
      )
    )
    .orderBy(asc(projectTasks.completedAt))
}

// --- The site admin's habits and journal ------------------------------------------

type HabitRow = typeof projectHabits.$inferSelect

async function siteAdminDaily(
  userId: string,
  row: SettingsRow | undefined,
  settings: DailySettings,
  cardDay: string,
  zone: string,
  teams: { id: string; name: string }[],
  daysOff: Set<string>,
  database: ProjectDb
): Promise<SiteAdminDaily> {
  const habitRows = await database
    .select()
    .from(projectHabits)
    .where(eq(projectHabits.userId, userId))
    .orderBy(asc(projectHabits.position), asc(projectHabits.createdAt))
  const counts = await habitCounts(habitRows.map((habit) => habit.id), database)
  const active = habitRows.filter((habit) => !habit.retiredDay)
  const yesterday = addDays(cardDay, -1)
  const weekStart = weekStartOf(cardDay)

  const habits: DailyHabit[] = active.map((habit) => {
    const count = (day: string) => counts.get(habit.id)?.get(day) ?? 0
    const dayIs = habitDayIs(habit, count, daysOff)
    return {
      id: habit.id,
      name: habit.name,
      part: habit.part,
      position: habit.position,
      icon: habit.icon,
      target: habit.target,
      days: habit.days,
      atTime: habit.atTime,
      setToday: habitIsSetFor(habit, cardDay),
      count: count(cardDay),
      yesterday: { set: habitIsSetFor(habit, yesterday), count: count(yesterday) },
      week: Array.from({ length: 7 }, (_, index): WeekDot => {
        const day = addDays(weekStart, index)
        if (day > cardDay) return "later"
        const state = dayIs(day)
        if (state === "done") return "done"
        if (state === "skip") return "off"
        return day === cardDay ? "open" : "missed"
      }),
      streak: streakOf(habit.firstDay, cardDay, dayIs),
    }
  })

  const first = habitRows.reduce<string | null>((soonest, habit) => (!soonest || habit.firstDay < soonest ? habit.firstDay : soonest), null)
  const finished = first
    ? streakOf(first, cardDay, (day) => finishedDayIs(habitRows, counts, daysOff, day))
    : { current: 0, best: 0 }
  const celebrated = row?.celebrated ?? []
  const milestone =
    newMilestone("finished", finished.current, celebrated) ??
    habits.map((habit) => newMilestone(`habit:${habit.id}`, habit.streak.current, celebrated)).find(Boolean) ??
    null

  const journal = await journalDays(userId, addDays(cardDay, -40), addDays(cardDay, 1), database)
  const todayRow = journal.get(cardDay) ?? emptyJournalDay(cardDay)
  const yearAgo = await journalDays(userId, yearBefore(cardDay), yearBefore(cardDay), database)
  const past = yearAgo.get(yearBefore(cardDay))

  return {
    habits,
    retired: habitRows.filter((habit) => habit.retiredDay).map(({ id, name, part }) => ({ id, name, part })),
    finished,
    milestone,
    today: todayRow,
    tomorrowIntention: journal.get(addDays(cardDay, 1))?.intention ?? "",
    // Only the site admin's own; with none, the card shows no line and no question.
    line: pickForDay(settings.ownLines, cardDay) ?? "",
    question: todayRow.question || (pickForDay(settings.ownQuestions, cardDay) ?? ""),
    trend: Array.from({ length: 30 }, (_, index) => {
      const day = addDays(cardDay, index - 29)
      return { day, rating: journal.get(day)?.rating ?? null }
    }),
    onThisDay: past && (past.intention || past.win) ? { day: past.day, text: past.win || past.intention } : null,
    lookBack:
      weekdayOf(cardDay) === 0
        ? Array.from({ length: 7 }, (_, index) => {
            const day = addDays(weekStart, index)
            const entry = journal.get(day)
            return { day, rating: entry?.rating ?? null, win: entry?.win ?? "" }
          })
        : null,
    monthly: cardDay.endsWith("-01") ? await monthlyReview(userId, habitRows, counts, daysOff, cardDay, database) : null,
    tomorrow: await tomorrowAtAGlance(addDays(cardDay, 1), zone, teams, userId, database),
  }
}

/** Each habit's count on every day it has one. */
async function habitCounts(habitIds: string[], database: ProjectDb) {
  const counts = new Map<string, Map<string, number>>()
  if (habitIds.length === 0) return counts
  const rows = await database.select().from(projectHabitDays).where(inArray(projectHabitDays.habitId, habitIds))
  for (const row of rows) {
    const days = counts.get(row.habitId) ?? new Map<string, number>()
    days.set(row.day, row.count)
    counts.set(row.habitId, days)
  }
  return counts
}

function habitDayIs(habit: HabitRow, count: (day: string) => number, daysOff: Set<string>) {
  return (day: string): StreakDay => {
    if (!habitIsSetFor(habit, day)) return "skip"
    if (count(day) >= habit.target) return "done"
    return daysOff.has(day) ? "skip" : "missed"
  }
}

/** A finished day: every habit set for it ticked. A day with none set, or a day off, doesn't count. */
function finishedDayIs(
  habits: HabitRow[],
  counts: Map<string, Map<string, number>>,
  daysOff: Set<string>,
  day: string
): StreakDay {
  const set = habits.filter((habit) => habitIsSetFor(habit, day))
  if (set.length === 0) return "skip"
  if (set.every((habit) => (counts.get(habit.id)?.get(day) ?? 0) >= habit.target)) return "done"
  return daysOff.has(day) ? "skip" : "missed"
}

function emptyJournalDay(day: string): JournalDay {
  return { day, intention: "", rating: null, note: "", win: "", question: "", answer: "", bedAt: null, upAt: null }
}

function yearBefore(day: string) {
  const [year, rest] = [Number(day.slice(0, 4)), day.slice(4)]
  // 29 Feb looks back to 28 Feb.
  return rest === "-02-29" ? `${year - 1}-02-28` : `${year - 1}${rest}`
}

async function journalDays(userId: string, from: string, to: string, database: ProjectDb) {
  const rows = await database
    .select()
    .from(projectJournalDays)
    .where(and(eq(projectJournalDays.userId, userId), gte(projectJournalDays.day, from), lte(projectJournalDays.day, to)))
  return new Map(
    rows.map((row): [string, JournalDay] => [
      row.day,
      {
        day: row.day,
        intention: row.intention,
        rating: row.rating,
        note: row.note,
        win: row.win,
        question: row.question,
        answer: row.answer,
        bedAt: row.bedAt?.toISOString() ?? null,
        upAt: row.upAt?.toISOString() ?? null,
      },
    ])
  )
}

/** Last month on the first of this one: the habit done most often for the days it was set, the typical rating, and wins from the best days. */
async function monthlyReview(
  userId: string,
  habits: HabitRow[],
  counts: Map<string, Map<string, number>>,
  daysOff: Set<string>,
  cardDay: string,
  database: ProjectDb
): Promise<MonthlyReview> {
  const last = addDays(cardDay, -1)
  const first = `${last.slice(0, 7)}-01`
  let bestHabit: MonthlyReview["bestHabit"] = null
  for (const habit of habits) {
    let done = 0
    let of = 0
    for (let day = first; day <= last; day = addDays(day, 1)) {
      const state = habitDayIs(habit, (d) => counts.get(habit.id)?.get(d) ?? 0, daysOff)(day)
      if (state === "skip") continue
      of += 1
      if (state === "done") done += 1
    }
    if (of > 0 && (!bestHabit || done / of > bestHabit.done / bestHabit.of)) bestHabit = { name: habit.name, done, of }
  }
  const days = [...(await journalDays(userId, first, last, database)).values()]
  const ratings = days.flatMap((entry) => (entry.rating ? [entry.rating] : [])).sort((a, b) => a - b)
  return {
    month: first.slice(0, 7),
    bestHabit,
    typicalRating: ratings.length ? ratings[Math.floor((ratings.length - 1) / 2)] : null,
    wins: days
      .filter((entry) => entry.win)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.day.localeCompare(a.day))
      .slice(0, 3)
      .map((entry) => entry.win),
  }
}

/** At night: tomorrow's meetings, what's due and who's off, across every team. */
async function tomorrowAtAGlance(
  tomorrow: string,
  zone: string,
  teams: { id: string; name: string }[],
  userId: string,
  database: ProjectDb
): Promise<DailyTomorrow> {
  const teamIds = teams.map((team) => team.id)
  const teamName = new Map(teams.map((team) => [team.id, team.name]))
  const meetings = teamIds.length
    ? (await withoutNotGoing(userId, await meetingsOn(tomorrow, zone, teamIds, teamName, database), database)).map(
        ({ meetingId, title, startsAt, endsAt, teamName: name }) => ({ meetingId, title, startsAt, endsAt, teamName: name })
      )
    : []
  const due = await database
    .select({ taskId: projectTasks.id, projectId: projectTasks.projectId, title: projectTasks.title, projectName: projectProjects.name })
    .from(projectTasks)
    .innerJoin(projectProjects, eq(projectProjects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTasks.dueDate, tomorrow),
        isNull(projectTasks.deletedAt),
        notInArray(projectTasks.status, CLOSED_TASK_STATUSES),
        isNull(projectProjects.archivedAt),
        or(
          and(teamIds.length ? inArray(projectProjects.teamId, teamIds) : sql`false`, isNull(projectProjects.personalUserId)),
          eq(projectProjects.personalUserId, userId)
        )
      )
    )
    .orderBy(asc(projectTasks.title))
  const away = teamIds.length
    ? await database
        .selectDistinct({ name: customShellUsers.name, teamId: projectTimeOff.teamId })
        .from(projectTimeOff)
        .innerJoin(customShellUsers, eq(customShellUsers.id, projectTimeOff.userId))
        .where(
          and(inArray(projectTimeOff.teamId, teamIds), lte(projectTimeOff.firstDay, tomorrow), gte(projectTimeOff.lastDay, tomorrow))
        )
        .orderBy(asc(customShellUsers.name))
    : []
  const holidays = teamIds.length
    ? await database
        .select({ name: projectTeamHolidays.name, teamId: projectTeamHolidays.teamId })
        .from(projectTeamHolidays)
        .where(and(inArray(projectTeamHolidays.teamId, teamIds), eq(projectTeamHolidays.day, tomorrow)))
    : []
  return {
    meetings,
    due: due.slice(0, TOMORROW_DUE_SHOWN),
    moreDue: Math.max(0, due.length - TOMORROW_DUE_SHOWN),
    away: away.map((row) => ({ name: row.name, teamName: teamName.get(row.teamId) ?? "" })),
    holidays: holidays.map((row) => ({ name: row.name, teamName: teamName.get(row.teamId) ?? "" })),
  }
}

// --- Looking back -----------------------------------------------------------------

export type MonthOfTicks = {
  month: string
  days: string[]
  habits: { id: string; name: string; icon: HabitIcon | null; retired: boolean; cells: WeekDot[] }[]
}

/** Each habit for a whole month as a row of ticks, retired ones included while they had ticks or days then. */
export async function loadMonthOfTicks(userId: string, month: string, database: ProjectDb = db, at = new Date()): Promise<MonthOfTicks> {
  await requireSiteAdmin(userId, database)
  const cardDay = await siteAdminCardDay(userId, database, at)
  const first = `${month}-01`
  const days: string[] = []
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) days.push(day)
  const habitRows = await database
    .select()
    .from(projectHabits)
    .where(eq(projectHabits.userId, userId))
    .orderBy(asc(projectHabits.part), asc(projectHabits.position))
  const counts = await habitCounts(habitRows.map((habit) => habit.id), database)
  const teams = await listTeamNames(database)
  const daysOff = await siteAdminDaysOff(userId, teams.length, database)
  return {
    month,
    days,
    habits: habitRows
      .filter((habit) => habit.firstDay <= days[days.length - 1] && (!habit.retiredDay || habit.retiredDay > first))
      .sort((a, b) => DAY_PARTS.indexOf(a.part) - DAY_PARTS.indexOf(b.part) || a.position - b.position)
      .map((habit) => {
        const count = (day: string) => counts.get(habit.id)?.get(day) ?? 0
        const dayIs = habitDayIs(habit, count, daysOff)
        return {
          id: habit.id,
          name: habit.name,
          icon: habit.icon,
          retired: habit.retiredDay !== null,
          cells: days.map((day): WeekDot => {
            if (day > cardDay) return "later"
            // A tick always shows, even on the day a habit was retired.
            if (count(day) >= habit.target) return "done"
            const state = dayIs(day)
            if (state === "done") return "done"
            if (state === "skip") return "off"
            return day === cardDay ? "open" : "missed"
          }),
        }
      }),
  }
}

/** Every rating of the year, one per day that has one. */
export async function loadYearOfRatings(userId: string, year: number, database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  const rows = await database
    .select({ day: projectJournalDays.day, rating: projectJournalDays.rating })
    .from(projectJournalDays)
    .where(
      and(
        eq(projectJournalDays.userId, userId),
        gte(projectJournalDays.day, `${year}-01-01`),
        lte(projectJournalDays.day, `${year}-12-31`),
        isNotNull(projectJournalDays.rating)
      )
    )
  return { year, ratings: Object.fromEntries(rows.map((row) => [row.day, row.rating as number])) as Record<string, number> }
}

export type JournalHit = { day: string; field: JournalField; text: string }

/** Intentions, notes, wins and answers holding the words, newest first. */
export async function searchJournal(userId: string, q: string, database: ProjectDb = db): Promise<JournalHit[]> {
  await requireSiteAdmin(userId, database)
  const pattern = `%${q.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
  const rows = await database
    .select()
    .from(projectJournalDays)
    .where(
      and(
        eq(projectJournalDays.userId, userId),
        or(
          sql`${projectJournalDays.intention} ilike ${pattern}`,
          sql`${projectJournalDays.note} ilike ${pattern}`,
          sql`${projectJournalDays.win} ilike ${pattern}`,
          sql`${projectJournalDays.answer} ilike ${pattern}`
        )
      )
    )
    .orderBy(desc(projectJournalDays.day))
    .limit(JOURNAL_SEARCH_RESULTS)
  const needle = q.toLowerCase()
  return rows.flatMap((row) =>
    (["intention", "win", "note", "answer"] as const)
      .filter((field) => row[field].toLowerCase().includes(needle))
      .map((field) => ({ day: row.day, field, text: row[field] }))
  )
}

// --- Saving -------------------------------------------------------------------------

async function saveSettings(userId: string, values: Partial<typeof projectDailyCards.$inferInsert>, database: ProjectDb) {
  const updatedAt = now()
  await database
    .insert(projectDailyCards)
    .values({ userId, ...values, updatedAt })
    .onConflictDoUpdate({ target: projectDailyCards.userId, set: { ...values, updatedAt } })
}

/** When morning, afternoon and night start. Everyone sets their own. */
export async function saveDailyHours(userId: string, hours: DayHours, database: ProjectDb = db) {
  await saveSettings(userId, { morningAt: hours.morning, afternoonAt: hours.afternoon, nightAt: hours.night }, database)
}

/** The city the weather comes from; an empty name clears it. Everyone sets their own. */
export async function saveDailyCity(userId: string, city: string, database: ProjectDb = db) {
  if (!city) {
    await saveSettings(userId, { city: null, latitude: null, longitude: null }, database)
    return { city: null }
  }
  const place = await findCity(city)
  if (!place) throw new Error(PROJECT_ERRORS.cityNotFound)
  await saveSettings(userId, { city: place.label, latitude: place.latitude, longitude: place.longitude }, database)
  return { city: place.label }
}

export async function saveDailySky(
  userId: string,
  input: { sky: SkyKind; own: Record<DayPart, string> },
  database: ProjectDb = db
) {
  await requireSiteAdmin(userId, database)
  await saveSettings(
    userId,
    { sky: input.sky, ownSkyMorning: input.own.morning, ownSkyAfternoon: input.own.afternoon, ownSkyNight: input.own.night },
    database
  )
}

export async function saveRoutineReminders(userId: string, reminders: RoutineReminders, database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  await saveSettings(
    userId,
    { reminderMorning: reminders.morning, reminderAfternoon: reminders.afternoon, reminderNight: reminders.night },
    database
  )
}

/** The site admin's own lines for the day, or their own night questions. */
export async function saveOwnWords(userId: string, kind: "lines" | "questions", items: string[], database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  await saveSettings(userId, kind === "lines" ? { ownLines: items } : { ownQuestions: items }, database)
}

/** A milestone's confetti has been shown, so it never shows again. */
export async function markMilestoneShown(userId: string, id: string, database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  const row = await settingsRow(userId, database)
  if (row?.celebrated.includes(id)) return
  await saveSettings(userId, { celebrated: [...(row?.celebrated ?? []), id] }, database)
}

/** The site admin's card day now, in their zone and hours. */
async function siteAdminCardDay(userId: string, database: ProjectDb, at: Date) {
  const { zone } = await zoneOf(userId, true, database)
  const settings = settingsOf(await settingsRow(userId, database))
  const local = localNow(at, zone)
  return cardDayOf(local.day, local.time, settings.hours)
}

async function ownHabit(userId: string, habitId: string, database: ProjectDb) {
  await requireSiteAdmin(userId, database)
  const [habit] = await database
    .select()
    .from(projectHabits)
    .where(and(eq(projectHabits.id, habitId), eq(projectHabits.userId, userId)))
  if (!habit) throw new Error(PROJECT_ERRORS.habitNotFound)
  return habit
}

type HabitInput = { name: string; part: DayPart; icon: HabitIcon | null; target: number; days: number[]; atTime: string | null }

async function nextPosition(userId: string, part: DayPart, database: ProjectDb) {
  const rows = await database
    .select({ position: projectHabits.position })
    .from(projectHabits)
    .where(and(eq(projectHabits.userId, userId), eq(projectHabits.part, part), isNull(projectHabits.retiredDay)))
  if (rows.length >= DAILY_LIMITS.habitsPerPart) throw new Error(PROJECT_ERRORS.tooManyHabits)
  return rows.reduce((highest, row) => Math.max(highest, row.position + 1), 0)
}

export async function createHabit(userId: string, input: HabitInput, database: ProjectDb = db, at = new Date()) {
  await requireSiteAdmin(userId, database)
  const firstDay = await siteAdminCardDay(userId, database, at)
  const id = uuid()
  await database.insert(projectHabits).values({
    id,
    userId,
    ...input,
    position: await nextPosition(userId, input.part, database),
    firstDay,
    createdAt: now(),
  })
  return { id }
}

/** A habit's name, icon, count, days and time. Moving it to another part of the day puts it last there. */
export async function updateHabit(userId: string, habitId: string, input: HabitInput, database: ProjectDb = db) {
  const habit = await ownHabit(userId, habitId, database)
  const position = habit.part === input.part ? habit.position : await nextPosition(userId, input.part, database)
  await database.update(projectHabits).set({ ...input, position }).where(eq(projectHabits.id, habitId))
}

/** Off the card, ticks kept for looking back. Its streak stops today. */
export async function retireHabit(userId: string, habitId: string, database: ProjectDb = db, at = new Date()) {
  await ownHabit(userId, habitId, database)
  const day = await siteAdminCardDay(userId, database, at)
  await database.update(projectHabits).set({ retiredDay: day }).where(eq(projectHabits.id, habitId))
}

/** Back on the card, last in its part of the day. Its streak starts again today. */
export async function restoreHabit(userId: string, habitId: string, database: ProjectDb = db, at = new Date()) {
  const habit = await ownHabit(userId, habitId, database)
  const day = await siteAdminCardDay(userId, database, at)
  const position = await nextPosition(userId, habit.part, database)
  await database.update(projectHabits).set({ retiredDay: null, firstDay: day, position }).where(eq(projectHabits.id, habitId))
}

/** A routine's habits in the order they were dragged into. Any habit left out keeps its place after them. */
export async function orderHabits(userId: string, part: DayPart, habitIds: string[], database: ProjectDb = db) {
  await requireSiteAdmin(userId, database)
  const rows = await database
    .select({ id: projectHabits.id })
    .from(projectHabits)
    .where(and(eq(projectHabits.userId, userId), eq(projectHabits.part, part), isNull(projectHabits.retiredDay)))
    .orderBy(asc(projectHabits.position))
  const known = new Set(rows.map((row) => row.id))
  const order = [...habitIds.filter((id) => known.has(id)), ...rows.map((row) => row.id).filter((id) => !habitIds.includes(id))]
  await database.transaction(async (tx) => {
    for (const [position, id] of order.entries()) {
      await tx.update(projectHabits).set({ position }).where(eq(projectHabits.id, id))
    }
  })
}

/**
 * Ticks or counts a habit for the card's day, or for yesterday ("Tick
 * yesterday"), never for any day before. 0 takes the tick away.
 */
export async function setHabitCount(
  userId: string,
  input: { habitId: string; day: string; count: number },
  database: ProjectDb = db,
  at = new Date()
) {
  const habit = await ownHabit(userId, input.habitId, database)
  const cardDay = await siteAdminCardDay(userId, database, at)
  if (input.day !== cardDay && input.day !== addDays(cardDay, -1)) throw new Error(PROJECT_ERRORS.habitDayGone)
  if (habit.retiredDay) throw new Error(PROJECT_ERRORS.habitNotFound)
  const count = Math.min(input.count, habit.target)
  if (count === 0) {
    await database
      .delete(projectHabitDays)
      .where(and(eq(projectHabitDays.habitId, habit.id), eq(projectHabitDays.day, input.day)))
    return
  }
  await database
    .insert(projectHabitDays)
    .values({ habitId: habit.id, day: input.day, count })
    .onConflictDoUpdate({ target: [projectHabitDays.habitId, projectHabitDays.day], set: { count } })
}

/** The sample morning, afternoon and night lists, added to whatever is there. */
export async function addReadyRoutines(userId: string, database: ProjectDb = db, at = new Date()) {
  for (const part of DAY_PARTS) {
    for (const habit of READY_ROUTINES[part]) {
      await createHabit(userId, { ...habit, part, days: [], atTime: null }, database, at)
    }
  }
}

async function saveJournal(userId: string, day: string, values: Partial<typeof projectJournalDays.$inferInsert>, database: ProjectDb) {
  const updatedAt = now()
  await database
    .insert(projectJournalDays)
    .values({ userId, day, ...values, updatedAt })
    .onConflictDoUpdate({ target: [projectJournalDays.userId, projectJournalDays.day], set: { ...values, updatedAt } })
}

/**
 * An intention, note, win or answer for the card's day. The only day ahead
 * is tomorrow's intention, written tonight. An answer keeps its question.
 */
export async function saveJournalText(
  userId: string,
  input: { day: string; field: JournalField; text: string; question?: string },
  database: ProjectDb = db,
  at = new Date()
) {
  await requireSiteAdmin(userId, database)
  const cardDay = await siteAdminCardDay(userId, database, at)
  const tomorrowIntention = input.field === "intention" && input.day === addDays(cardDay, 1)
  if (input.day !== cardDay && !tomorrowIntention) throw new Error(PROJECT_ERRORS.journalDayGone)
  await saveJournal(
    userId,
    input.day,
    input.field === "answer" ? { answer: input.text, question: input.question ?? "" } : { [input.field]: input.text },
    database
  )
}

export async function saveJournalRating(userId: string, input: { day: string; rating: number | null }, database: ProjectDb = db, at = new Date()) {
  await requireSiteAdmin(userId, database)
  if (input.day !== (await siteAdminCardDay(userId, database, at))) throw new Error(PROJECT_ERRORS.journalDayGone)
  await saveJournal(userId, input.day, { rating: input.rating }, database)
}

/** Going to bed or Up, at this moment, on the card's day. */
/** Going to bed, or Start day, which records the time the day began in `up_at`. */
export async function markSleep(userId: string, kind: "bed" | "up", database: ProjectDb = db, at = new Date()) {
  await requireSiteAdmin(userId, database)
  const day = await siteAdminCardDay(userId, database, at)
  await saveJournal(userId, day, kind === "bed" ? { bedAt: at } : { upAt: at }, database)
}

// --- Weather -----------------------------------------------------------------------

/**
 * Weather comes from Open-Meteo, which is free and needs no key: its
 * geocoding finds the city typed in My settings, and its forecast gives
 * the weather there now. Each place's weather is kept for 30 minutes.
 */
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
const WEATHER_KEEP_MS = 30 * 60_000
const WEATHER_TIMEOUT_MS = 4000

export type DailyWeather = { city: string; temperature: number; kind: WeatherKind }

const weatherKept = new Map<string, { at: number; weather: Omit<DailyWeather, "city"> | null }>()

async function findCity(name: string) {
  const url = `${GEOCODING_URL}?${new URLSearchParams({ name, count: "1", language: "en", format: "json" })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) }).catch(() => null)
  if (!response?.ok) throw new Error(PROJECT_ERRORS.weatherUnavailable)
  const body = (await response.json()) as {
    results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[]
  }
  const place = body.results?.[0]
  if (!place) return null
  return {
    label: [place.name, place.admin1 ?? place.country].filter(Boolean).join(", "),
    latitude: place.latitude,
    longitude: place.longitude,
  }
}

/** The weather in the person's city now, or null with no city or when the service doesn't answer. */
export async function loadDailyWeather(userId: string, database: ProjectDb = db, nowMs = Date.now()): Promise<DailyWeather | null> {
  const row = await settingsRow(userId, database)
  if (!row?.city || row.latitude === null || row.longitude === null) return null
  const key = `${row.latitude.toFixed(2)},${row.longitude.toFixed(2)}`
  const kept = weatherKept.get(key)
  if (kept && nowMs - kept.at < WEATHER_KEEP_MS) return kept.weather && { city: row.city, ...kept.weather }
  const url = `${FORECAST_URL}?${new URLSearchParams({
    latitude: String(row.latitude),
    longitude: String(row.longitude),
    current: "temperature_2m,weather_code",
  })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) }).catch(() => null)
  const body = response?.ok
    ? ((await response.json().catch(() => null)) as { current?: { temperature_2m?: number; weather_code?: number } } | null)
    : null
  const current = body?.current
  const weather =
    current && typeof current.temperature_2m === "number" && typeof current.weather_code === "number"
      ? { temperature: Math.round(current.temperature_2m), kind: weatherKindOf(current.weather_code) }
      : null
  weatherKept.set(key, { at: nowMs, weather })
  return weather && { city: row.city, ...weather }
}

/** For tests: forget every place's kept weather. */
export function forgetWeather() {
  weatherKept.clear()
}

// --- The routine's bell reminder ---------------------------------------------------

/** How late a routine's reminder may still go out, for a server that was down at its time. */
const REMINDER_LATE_MINUTES = 60

function minutesBetween(from: string, to: string) {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  return minutes(to) - minutes(from)
}

type RoutineReminderDue = { userId: string; day: string; part: DayPart; left: string[] }

/**
 * Routines whose reminder time has come today and still have habits not
 * ticked: the site admin's own, on a day that isn't a day off. The reminder
 * job claims and sends each (`reminder-jobs.ts`).
 */
export async function routineRemindersDue(database: ProjectDb, at = new Date()): Promise<RoutineReminderDue[]> {
  const owners = await database
    .selectDistinct({ userId: projectHabits.userId })
    .from(projectHabits)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectHabits.userId))
    .where(and(isNull(projectHabits.retiredDay), eq(customShellUsers.role, "admin")))
  if (owners.length === 0) return []
  const teams = await listTeamNames(database)
  const due: RoutineReminderDue[] = []
  for (const { userId } of owners) {
    const { zone } = await zoneOf(userId, true, database)
    const settings = settingsOf(await settingsRow(userId, database))
    const local = localNow(at, zone)
    // Only on the day itself: after midnight, last night's reminder has had its chance.
    if (cardDayOf(local.day, local.time, settings.hours) !== local.day) continue
    const daysOff = await siteAdminDaysOff(userId, teams.length, database)
    if (daysOff.has(local.day)) continue
    const habits = await database
      .select()
      .from(projectHabits)
      .where(and(eq(projectHabits.userId, userId), isNull(projectHabits.retiredDay)))
      .orderBy(asc(projectHabits.position))
    const counts = await habitCounts(habits.map((habit) => habit.id), database)
    for (const part of DAY_PARTS) {
      const time = settings.reminders[part]
      // Its time, or within the hour after if the server was down then; never hours late.
      if (!time || local.time < time || minutesBetween(time, local.time) > REMINDER_LATE_MINUTES) continue
      const left = habits
        .filter((habit) => habit.part === part && habitIsSetFor(habit, local.day))
        .filter((habit) => (counts.get(habit.id)?.get(local.day) ?? 0) < habit.target)
        .map((habit) => habit.name)
      if (left.length) due.push({ userId, day: local.day, part, left })
    }
  }
  return due
}
