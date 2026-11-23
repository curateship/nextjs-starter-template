import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, max, or, sql } from "drizzle-orm"

import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import {
  GROUP_MILESTONE_HOURS,
  GROUP_PAST_WEEKS,
  type GroupBoardOrder,
} from "@/lib/pomodoro/groups"
import {
  LEADERBOARD_FLOOR_DATE,
  leaderboardStartDate,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import {
  groupGoalMessage,
  groupMilestoneMessage,
  groupWinnerMessage,
} from "@/lib/pomodoro/notices"
import { db } from "@/server/db"
import { readLeaderboardRows, readRankedRows } from "@/server/pomodoro/leaderboard"
import { writeNotices } from "@/server/pomodoro/notices"
import { localDateFor } from "@/server/pomodoro/productivity"
import { requireMembership } from "@/server/pomodoro/groups"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroBlocks,
  pomodoroGroupMembers,
  pomodoroGroupMilestones,
  pomodoroGroupWeekNotices,
  pomodoroGroups,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"

/**
 * A group's board and the scores around it (groups task 01, sections D
 * and E): the board itself, who is focusing now, the weekly goal, the group
 * streak, past weeks, milestones and the Monday winner.
 *
 * No ranking is stored. Tyler, 13 Oct 2026: past weeks are worked out from
 * the sessions when they are read. The two tables written here only remember
 * that a notice went out, so nothing is said twice.
 *
 * Every group counts days in one timezone, the group's own (part 16), so two
 * members in different countries see the same board and the same winner.
 * A group's week runs Monday to Sunday in that timezone.
 */

/** The group's timezone: the owner's pick, else the owner's own, else UTC. */
async function groupCalendar(groupId: string) {
  const [group] = await db
    .select({
      name: pomodoroGroups.name,
      timezone: pomodoroGroups.timezone,
      weeklyGoalHours: pomodoroGroups.weeklyGoalHours,
      ownerTimezone: pomodoroProfiles.timezone,
    })
    .from(pomodoroGroups)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroups.ownerUserId)
    )
    .where(eq(pomodoroGroups.id, groupId))
    .limit(1)
  if (!group) throw new Error("GROUP_NOT_MEMBER")
  const timezone = group.timezone ?? group.ownerTimezone ?? "UTC"
  return { ...group, timezone, today: localDateFor(timezone) }
}

/** The Monday on or before a `yyyy-mm-dd` day. */
export function mondayOf(localDate: string) {
  const weekday = new Date(`${localDate}T00:00:00Z`).getUTCDay()
  return shiftLocalDate(localDate, -((weekday + 6) % 7))
}

/** The first day a group board counts. This week is Monday to today. */
export function groupWindowStart(window: LeaderboardWindow, today: string) {
  return window === "week" ? mondayOf(today) : leaderboardStartDate(window, today)
}

/** The members of a group by user id, with their membership row's id. */
async function membershipsOf(groupId: string) {
  return db
    .select({
      userId: pomodoroGroupMembers.userId,
      membershipId: pomodoroGroupMembers.id,
    })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.groupId, groupId))
}

/** Of these accounts, those with a focus timer running right now (part 14). */
async function focusingNow(userIds: readonly string[]) {
  if (userIds.length === 0) return new Set<string>()
  const rows = await db
    .select({ userId: focusSessions.userId })
    .from(focusSessions)
    .where(
      and(
        inArray(focusSessions.userId, [...userIds]),
        eq(focusSessions.mode, "focus"),
        eq(focusSessions.status, "running"),
        gt(focusSessions.targetEndsAt, new Date())
      )
    )
  return new Set(rows.map((row) => row.userId))
}

/**
 * The board of one group over one window, in the order asked for.
 *
 * Membership is proved first, so holding a group's id is not enough to read who
 * is in it. The ranking itself is the global board's query with a group filter,
 * so the two can never disagree about a figure. Each row carries its
 * membership id, which a cheer is sent by, and whether that person is
 * focusing now; the user id stays here.
 */
export async function readGroupBoard({
  userId,
  groupId,
  window,
  order,
}: {
  userId: string
  groupId: string
  window: LeaderboardWindow
  order: GroupBoardOrder
}) {
  await requireMembership(userId, groupId)
  const { timezone, today } = await groupCalendar(groupId)
  const start = groupWindowStart(window, today)
  const [rows, memberships] = await Promise.all([
    readRankedRows({ start, viewerUserId: userId, groupId, order }),
    membershipsOf(groupId),
  ])
  const membershipOf = new Map(memberships.map((row) => [row.userId, row.membershipId]))
  const live = await focusingNow(rows.map((row) => row.userId))
  return {
    start,
    today,
    timezone,
    leaders: rows.map(({ userId: memberUserId, ...row }) => ({
      ...row,
      membershipId: membershipOf.get(memberUserId) ?? null,
      focusingNow: live.has(memberUserId),
    })),
  }
}

/** Who a group board lists: a display name, and not taken off by an admin. */
function onTheBoard() {
  return and(
    isNotNull(pomodoroProfiles.publicDisplayName),
    isNull(pomodoroProfiles.leaderboardHiddenAt)
  )
}

/** Seconds of focus the group's board holds from `start` to `end`. */
async function groupSeconds(groupId: string, start: string, end?: string) {
  const [row] = await db
    .select({
      seconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
    })
    .from(dailyFocusStats)
    .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, dailyFocusStats.userId))
    .innerJoin(
      pomodoroGroupMembers,
      and(
        eq(pomodoroGroupMembers.userId, dailyFocusStats.userId),
        eq(pomodoroGroupMembers.groupId, groupId)
      )
    )
    .where(
      and(
        onTheBoard(),
        gte(dailyFocusStats.localDate, start),
        end ? lte(dailyFocusStats.localDate, end) : undefined
      )
    )
  return row?.seconds ?? 0
}

/**
 * Days in a row, up to today, on which at least one member on the board
 * finished a focus (part 20). A streak whose last day was yesterday is still
 * alive, the same as a person's own.
 */
async function groupStreak(groupId: string, today: string) {
  const rows = await db
    .selectDistinct({ day: dailyFocusStats.localDate })
    .from(dailyFocusStats)
    .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, dailyFocusStats.userId))
    .innerJoin(
      pomodoroGroupMembers,
      and(
        eq(pomodoroGroupMembers.userId, dailyFocusStats.userId),
        eq(pomodoroGroupMembers.groupId, groupId)
      )
    )
    .where(
      and(
        onTheBoard(),
        gt(dailyFocusStats.focusSessions, 0),
        gte(dailyFocusStats.localDate, shiftLocalDate(today, -400)),
        lte(dailyFocusStats.localDate, today)
      )
    )
    .orderBy(desc(dailyFocusStats.localDate))
  const days = new Set(rows.map((row) => row.day))
  let day = days.has(today) ? today : shiftLocalDate(today, -1)
  let streak = 0
  while (days.has(day)) {
    streak += 1
    day = shiftLocalDate(day, -1)
  }
  return streak
}

/**
 * What the group's card shows above the board: this week's hours against
 * the goal, the group streak and the milestones reached.
 */
export async function readGroupStanding(userId: string, groupId: string) {
  await requireMembership(userId, groupId)
  const { today, weeklyGoalHours, timezone } = await groupCalendar(groupId)
  const [weekSeconds, streakDays, milestones] = await Promise.all([
    groupSeconds(groupId, mondayOf(today)),
    groupStreak(groupId, today),
    db
      .select({ hours: pomodoroGroupMilestones.hours })
      .from(pomodoroGroupMilestones)
      .where(eq(pomodoroGroupMilestones.groupId, groupId))
      .orderBy(pomodoroGroupMilestones.hours),
  ])
  return {
    timezone,
    weekSeconds,
    weeklyGoalHours,
    streakDays,
    milestones: milestones.map((row) => row.hours),
  }
}

/**
 * Past weeks' top three (part 21), the last `GROUP_PAST_WEEKS` finished
 * weeks, worked out from today's members. Somebody who left drops out of old
 * weeks and somebody who joined shows in weeks before they did; that is what
 * not storing them means.
 *
 * Held for five minutes, because a finished week only changes when somebody
 * joins or leaves. The member count and latest join are part of what it is
 * held under, so either of those changes it at once.
 */
const PAST_WEEKS_HELD_MS = 5 * 60_000
const pastWeeksHeld = new Map<string, { at: number; weeks: PastWeek[] }>()

export type PastWeek = {
  start: string
  end: string
  top: { name: string | null; focusSeconds: number; isYou: boolean }[]
}

export async function readGroupPastWeeks(userId: string, groupId: string) {
  await requireMembership(userId, groupId)
  const { today } = await groupCalendar(groupId)
  const [membership] = await db
    .select({
      count: sql<number>`count(*)::int`,
      latest: max(pomodoroGroupMembers.joinedAt),
    })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.groupId, groupId))
  const thisMonday = mondayOf(today)
  const key = `${groupId}:${userId}:${thisMonday}:${membership?.count}:${membership?.latest?.toISOString()}`
  const held = pastWeeksHeld.get(key)
  if (held && Date.now() - held.at < PAST_WEEKS_HELD_MS) return held.weeks

  const weeks: PastWeek[] = []
  for (let back = 1; back <= GROUP_PAST_WEEKS; back += 1) {
    const start = shiftLocalDate(thisMonday, -7 * back)
    const end = shiftLocalDate(start, 6)
    const rows = await readLeaderboardRows({
      start,
      end,
      viewerUserId: userId,
      groupId,
    })
    weeks.push({
      start,
      end,
      top: rows
        .filter((row) => row.focusSeconds > 0)
        .slice(0, 3)
        .map((row) => ({
          name: row.name,
          focusSeconds: row.focusSeconds,
          isYou: row.isYou,
        })),
    })
  }
  if (pastWeeksHeld.size > 500) pastWeeksHeld.clear()
  pastWeeksHeld.set(key, { at: Date.now(), weeks })
  return weeks
}

/** "14 hours" or "45 minutes", for a notice. */
export function focusWords(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  if (hours >= 1) return `${hours} ${hours === 1 ? "hour" : "hours"}`
  const minutes = Math.max(1, Math.round(seconds / 60))
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`
}

/** Every member's user id, for a notice everybody in the group gets. */
async function memberIdsOf(groupId: string) {
  return (await membershipsOf(groupId)).map((row) => row.userId)
}

/**
 * After a focus finishes: the weekly goal (part 18) and the milestones
 * (part 22) for each group this person is in. Each is claimed by inserting
 * its row first, so two sessions finishing at once tell everybody once.
 */
export async function checkGroupScoresAfterFocus(userId: string) {
  const groups = await db
    .select({ groupId: pomodoroGroupMembers.groupId })
    .from(pomodoroGroupMembers)
    .where(eq(pomodoroGroupMembers.userId, userId))
  for (const { groupId } of groups) {
    const { name, today, weeklyGoalHours } = await groupCalendar(groupId)

    if (weeklyGoalHours !== null) {
      const weekStart = mondayOf(today)
      const seconds = await groupSeconds(groupId, weekStart)
      if (seconds >= weeklyGoalHours * 3600) {
        const recipients = await memberIdsOf(groupId)
        await db.transaction(async (tx) => {
          const [claimed] = await tx
            .insert(pomodoroGroupWeekNotices)
            .values({ groupId, weekStart, kind: "goal" })
            .onConflictDoNothing()
            .returning({ groupId: pomodoroGroupWeekNotices.groupId })
          if (!claimed) return
          await writeNotices(
            tx,
            recipients.map((recipientUserId) => ({
              recipientUserId,
              kind: "group_goal" as const,
              message: groupGoalMessage(name, weeklyGoalHours),
              groupId,
              href: `/groups?group=${groupId}`,
            }))
          )
        })
      }
    }

    const allSeconds = await groupSeconds(groupId, LEADERBOARD_FLOOR_DATE)
    const reached = GROUP_MILESTONE_HOURS.filter((hours) => allSeconds >= hours * 3600)
    if (reached.length === 0) continue
    const recipients = await memberIdsOf(groupId)
    await db.transaction(async (tx) => {
      const claimed = await tx
        .insert(pomodoroGroupMilestones)
        .values(reached.map((hours) => ({ groupId, hours })))
        .onConflictDoNothing()
        .returning({ hours: pomodoroGroupMilestones.hours })
      if (claimed.length === 0) return
      // Two milestones crossed at once, as when a group is made of people
      // with long histories, are one notice about the larger.
      const highest = Math.max(...claimed.map((row) => row.hours))
      await writeNotices(
        tx,
        recipients.map((recipientUserId) => ({
          recipientUserId,
          kind: "group_milestone" as const,
          message: groupMilestoneMessage(name, highest),
          groupId,
          href: `/groups?group=${groupId}`,
        }))
      )
    })
  }
}

/** The worker ticks every few seconds; once every ten minutes is plenty. */
const WINNER_PASS_EVERY_MS = 10 * 60_000
let lastWinnerPassAt = 0

/** The worker's entry point for the Monday winner (part 19). */
export async function runGroupWinnersPass() {
  const now = Date.now()
  if (now - lastWinnerPassAt < WINNER_PASS_EVERY_MS) return
  lastWinnerPassAt = now
  await sendGroupWinners()
}

/**
 * Last week's winner, to every member of every group, once per group per
 * week, on the first pass after Monday starts in the group's timezone.
 * Everybody tied for first is named (Tyler, 13 Oct 2026). A week with no
 * hours sends nothing, and a group made after that week ended waits for its
 * first whole week.
 */
export async function sendGroupWinners() {
  const groups = await db
    .select({
      id: pomodoroGroups.id,
      name: pomodoroGroups.name,
      timezone: pomodoroGroups.timezone,
      createdAt: pomodoroGroups.createdAt,
      ownerTimezone: pomodoroProfiles.timezone,
    })
    .from(pomodoroGroups)
    .leftJoin(
      pomodoroProfiles,
      eq(pomodoroProfiles.userId, pomodoroGroups.ownerUserId)
    )
  if (groups.length === 0) return

  const sent = await db
    .select({
      groupId: pomodoroGroupWeekNotices.groupId,
      weekStart: pomodoroGroupWeekNotices.weekStart,
    })
    .from(pomodoroGroupWeekNotices)
    .where(
      and(
        eq(pomodoroGroupWeekNotices.kind, "winner"),
        gte(
          pomodoroGroupWeekNotices.weekStart,
          shiftLocalDate(localDateFor("UTC"), -21)
        )
      )
    )
  const already = new Set(sent.map((row) => `${row.groupId}:${row.weekStart}`))

  for (const group of groups) {
    const timezone = group.timezone ?? group.ownerTimezone ?? "UTC"
    const weekStart = shiftLocalDate(mondayOf(localDateFor(timezone)), -7)
    const weekEnd = shiftLocalDate(weekStart, 6)
    if (already.has(`${group.id}:${weekStart}`)) continue
    // A group that did not exist during the week has no winner for it.
    if (localDateFor(timezone, group.createdAt) > weekEnd) continue
    await sendOneWinner(group.id, group.name, weekStart, weekEnd)
  }
}

async function sendOneWinner(
  groupId: string,
  groupName: string,
  weekStart: string,
  weekEnd: string
) {
  const rows = await readRankedRows({
    start: weekStart,
    end: weekEnd,
    viewerUserId: null,
    groupId,
  })
  const best = rows[0]?.focusSeconds ?? 0
  const winners = best > 0 ? rows.filter((row) => row.focusSeconds === best) : []
  const members = await memberIdsOf(groupId)

  // A member with a block either way between them and a winner does not get
  // the notice, because it names somebody their board leaves out.
  const winnerIds = winners.map((row) => row.userId)
  const blocks =
    winnerIds.length && members.length
      ? await db
          .select({
            blocker: pomodoroBlocks.blockerUserId,
            blocked: pomodoroBlocks.blockedUserId,
          })
          .from(pomodoroBlocks)
          .where(
            or(
              and(
                inArray(pomodoroBlocks.blockerUserId, members),
                inArray(pomodoroBlocks.blockedUserId, winnerIds)
              ),
              and(
                inArray(pomodoroBlocks.blockerUserId, winnerIds),
                inArray(pomodoroBlocks.blockedUserId, members)
              )
            )
          )
      : []
  const cutOff = new Set(
    blocks.map((block) =>
      winnerIds.includes(block.blocker) ? block.blocked : block.blocker
    )
  )
  const recipients = members.filter((member) => !cutOff.has(member))
  const message = groupWinnerMessage(
    // Alphabetical, so a tie reads the same however the accounts sort.
    winners.map((row) => row.name ?? "Somebody").sort((a, b) => a.localeCompare(b)),
    groupName,
    focusWords(best)
  )

  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(pomodoroGroupWeekNotices)
      .values({ groupId, weekStart, kind: "winner" })
      .onConflictDoNothing()
      .returning({ groupId: pomodoroGroupWeekNotices.groupId })
    // The week is claimed even when nobody focused, so it is looked at once.
    if (!claimed || winners.length === 0) return
    await writeNotices(
      tx,
      recipients.map((recipientUserId) => ({
        recipientUserId,
        kind: "group_winner" as const,
        message,
        groupId,
        href: `/groups?group=${groupId}`,
      }))
    )
  })
}
