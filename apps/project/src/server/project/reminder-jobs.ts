import { and, eq, inArray, sql } from "drizzle-orm"

import { addDays, weekdayOf } from "@/lib/project/days"
import {
  dueSoonHeading,
  MY_DASHBOARD_HREF,
  overdueHeading,
  taskHref,
  teamDayHref,
  teamMorningDetail,
  teamMorningHeading,
} from "@/lib/project/notices"
import {
  DUE_REMINDERS_BEFORE_GROUPING,
  MORNING_NOTICE_DELAY_MINUTES,
  type DueReminderKind,
} from "@/lib/project/rules"
import { db, type CustomShellDb } from "@/server/db"
import { PEOPLE } from "@/server/project/checkin-jobs"
import { writeAppNotices, type AppNotice } from "@/server/project/notices"
import {
  projectDueReminders,
  projectTeamMembers,
  projectTeamMorningNotices,
} from "@/server/project/schema"
import { countTeamToday } from "@/server/project/team-days"

/**
 * The bell's reminders about due dates and the team's morning, run on the
 * shell's fifteen-second loop (`src/app/server-options.ts`). Each is claimed by writing its row in the same transaction
 * as the notice, so two overlapping passes send one.
 */

const BATCH = 500

export async function runReminderJobs(database: CustomShellDb = db, at = new Date()) {
  await sendDueReminders(database, at)
  await sendTeamMorningNotices(database, at)
}

/** How far back a missed due date still gets an "Overdue", so old dates don't flood the bell. */
const OVERDUE_LOOKBACK_DAYS = 7

type DueRow = {
  taskId: string
  projectId: string
  title: string
  dueDate: string
  userId: string
  today: string
  kind: DueReminderKind
}

/**
 * At the assigned person's own check-in time on a work day: "Due tomorrow"
 * for a task due before their next work day comes round, and "Overdue" once
 * the date has passed. Each task sends each kind once per due date, so moving
 * the date sends a fresh one. Done tasks, tasks in archived projects and tasks
 * with nobody assigned send nothing.
 */
export async function sendDueReminders(database: CustomShellDb = db, at = new Date()) {
  const found = await database.execute(sql`
    WITH ${PEOPLE}
    SELECT t.id AS "taskId", t.project_id AS "projectId", t.title,
      t.due_date::text AS "dueDate", p.user_id AS "userId", l.day::text AS "today", k.kind
    FROM people p
    CROSS JOIN LATERAL (
      SELECT (${at.toISOString()}::timestamptz AT TIME ZONE p.zone) AS local
    ) z
    CROSS JOIN LATERAL (SELECT z.local::date AS day) l
    CROSS JOIN LATERAL (
      SELECT min(d)::date AS day
      FROM generate_series(l.day + 1, l.day + 7, interval '1 day') d
      WHERE extract(dow FROM d)::int = ANY (p.work_days)
    ) next_work
    JOIN project_tasks t ON t.assignee_user_id = p.user_id
    JOIN project_projects pr
      ON pr.id = t.project_id AND pr.team_id = p.team_id AND pr.archived_at IS NULL
    CROSS JOIN LATERAL (
      SELECT CASE WHEN t.due_date < l.day THEN 'overdue' ELSE 'due_soon' END AS kind
    ) k
    WHERE extract(dow FROM z.local)::int = ANY (p.work_days)
      AND to_char(z.local, 'HH24:MI') >= p.at_time
      AND t.status <> 'done'
      AND t.deleted_at IS NULL
      AND t.due_date IS NOT NULL
      AND (
        (t.due_date < l.day AND t.due_date >= l.day - ${OVERDUE_LOOKBACK_DAYS}::int)
        OR (t.due_date > l.day AND t.due_date <= next_work.day)
      )
      AND NOT EXISTS (
        SELECT 1 FROM project_due_reminders r
        WHERE r.task_id = t.id AND r.kind = k.kind AND r.due_date = t.due_date
      )
      -- Nobody hears about due dates on their time off; it waits for their return.
      AND NOT EXISTS (
        SELECT 1 FROM project_time_off o
        WHERE o.user_id = p.user_id AND l.day BETWEEN o.first_day AND o.last_day
      )
    ORDER BY p.user_id, t.due_date, t.title
    LIMIT ${BATCH}
  `)
  const byPerson = new Map<string, DueRow[]>()
  for (const row of found.rows as DueRow[]) {
    byPerson.set(row.userId, [...(byPerson.get(row.userId) ?? []), row])
  }

  for (const [userId, rows] of byPerson) {
    await database.transaction(async (tx) => {
      const claimed = await tx
        .insert(projectDueReminders)
        .values(
          rows.map((row) => ({
            taskId: row.taskId,
            kind: row.kind,
            dueDate: row.dueDate,
            sentAt: at,
          }))
        )
        .onConflictDoNothing()
        .returning({ taskId: projectDueReminders.taskId, kind: projectDueReminders.kind })
      const won = new Set(claimed.map((claim) => `${claim.taskId}:${claim.kind}`))
      const mine = rows.filter((row) => won.has(`${row.taskId}:${row.kind}`))
      await writeAppNotices(tx, dueNotices(userId, mine))
    })
  }
}

/**
 * One notice per task, unless more than three of one kind (and, for "Due",
 * one day) come at once: then one notice counts them and opens My dashboard.
 */
function dueNotices(userId: string, rows: DueRow[]): AppNotice[] {
  const groups = new Map<string, DueRow[]>()
  for (const row of rows) {
    const key = row.kind === "overdue" ? "overdue" : `due:${row.dueDate}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()].flatMap((group): AppNotice[] => {
    const first = group[0]
    const heading = (count: number) =>
      first.kind === "overdue"
        ? overdueHeading(count)
        : dueSoonHeading(
            first.dueDate === addDays(first.today, 1) ? 1 : 2,
            weekdayOf(first.dueDate),
            count
          )
    if (group.length > DUE_REMINDERS_BEFORE_GROUPING) {
      return [
        {
          kind: first.kind,
          recipientUserId: userId,
          message: heading(group.length),
          detail: listTitles(group.map((row) => row.title)),
          href: MY_DASHBOARD_HREF,
        },
      ]
    }
    return group.map((row) => ({
      kind: row.kind,
      recipientUserId: userId,
      message: heading(1),
      detail: row.title,
      href: taskHref(row.projectId, row.taskId),
    }))
  })
}

/** "Write the launch email, Fix the 404 page and 3 more". */
function listTitles(titles: string[]) {
  const shown = titles.slice(0, 2)
  const rest = titles.length - shown.length
  return rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.join(" and ")
}

/**
 * The team's morning, to its owner and admins: "5 of 6 checked in, 1
 * blocked", counted as the Team dashboard's square for today counts it. Sent
 * on the team's work days, once the latest check-in time in the team has
 * passed by 30 minutes, so the numbers are complete (Tyler's choice). The day
 * is the team's own, in the team's time zone.
 */
export async function sendTeamMorningNotices(database: CustomShellDb = db, at = new Date()) {
  const found = await database.execute(sql`
    WITH teams AS MATERIALIZED (
      SELECT t.id, t.work_days,
        (${at.toISOString()}::timestamptz AT TIME ZONE t.time_zone)::date AS day
      FROM project_teams t
      WHERE t.time_zone IN (SELECT name FROM pg_timezone_names)
    )
    SELECT tm.id AS "teamId", tm.day::text AS "day"
    FROM teams tm
    WHERE extract(dow FROM tm.day)::int = ANY (tm.work_days)
      AND NOT EXISTS (
        SELECT 1 FROM project_team_morning_notices n
        WHERE n.team_id = tm.id AND n.day = tm.day
      )
      AND ${at.toISOString()}::timestamptz >= (
        SELECT max(
          (tm.day + coalesce(m.checkin_time, t.checkin_time)::time)
            AT TIME ZONE coalesce(m.time_zone, t.time_zone)
        )
        FROM project_team_members m
        JOIN project_teams t ON t.id = m.team_id
        WHERE m.team_id = tm.id
          AND coalesce(m.time_zone, t.time_zone) IN (SELECT name FROM pg_timezone_names)
      ) + make_interval(mins => ${MORNING_NOTICE_DELAY_MINUTES}::int)
    LIMIT ${BATCH}
  `)

  for (const team of found.rows as { teamId: string; day: string }[]) {
    await database.transaction(async (tx) => {
      const claimed = await tx
        .insert(projectTeamMorningNotices)
        .values({ teamId: team.teamId, day: team.day, sentAt: at })
        .onConflictDoNothing()
        .returning({ teamId: projectTeamMorningNotices.teamId })
      if (!claimed.length) return
      const square = await countTeamToday(team.teamId, team.day, tx)
      const runners = await tx
        .select({ userId: projectTeamMembers.userId })
        .from(projectTeamMembers)
        .where(
          and(
            eq(projectTeamMembers.teamId, team.teamId),
            inArray(projectTeamMembers.role, ["owner", "admin"])
          )
        )
      await writeAppNotices(
        tx,
        runners.map((runner) => ({
          kind: "team_morning",
          recipientUserId: runner.userId,
          message: teamMorningHeading(square.checkedIn, square.expected, square.blocked),
          detail: teamMorningDetail(square.notYet),
          href: teamDayHref(team.day),
        }))
      )
    })
  }
}
