import { and, asc, eq, isNotNull, lt, sql } from "drizzle-orm"

import { BIN_DAYS } from "@/lib/project/rules"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { purgeTask } from "@/server/project/planning"
import {
  projectRepeatRuns,
  projectTaskLabels,
  projectTaskSteps,
  projectTasks,
} from "@/server/project/schema"
import { nextTaskPosition } from "@/server/project/sections"
import { copyFieldValues } from "@/server/project/task-types"
import type { FileStorage } from "@/server/project/task-files"

/**
 * Planning's two background jobs, on the shell's fifteen-second loop
 * (`src/app/server-options.ts`): making each day's copy of a repeating task,
 * and emptying bins of anything deleted more than 30 days ago.
 */

const BATCH = 200

export async function runPlanningJobs(database: CustomShellDb = db, at = new Date()) {
  await makeRepeatCopies(database, at)
  await emptyOldBins(database, at)
}

type DueCopy = { taskId: string; seriesId: string; day: string }

/**
 * Once a new day starts in the team's time zone, a fresh copy of each
 * repeating task whose rule falls on that day: title, notes, labels, section,
 * type and field values (files stay behind), priority, steps unticked, the
 * same person, To do. The rule moves to the copy,
 * so deleting the newest copy stops the repeat.
 *
 * Tyler's rule: when the newest copy isn't Done, no new one appears. The next
 * copy comes on the first repeat day after it is Done.
 *
 * Each copy is claimed in `project_repeat_runs` for its series and day, in the
 * same transaction that makes it, so two passes make one. The job only ever
 * looks at today, so a server that was down on a repeat day makes no catch-up
 * copies: the next copy comes on the next repeat day.
 */
export async function makeRepeatCopies(database: CustomShellDb = db, at = new Date()) {
  const due = await database.execute(sql`
    WITH holders AS MATERIALIZED (
      SELECT t.id, t.repeat_every, t.repeat_week_days, t.repeat_month_day, t.repeat_from, t.created_at,
        coalesce(t.repeat_series_id, t.id) AS series_id,
        tm.work_days,
        (${at.toISOString()}::timestamptz AT TIME ZONE tm.time_zone)::date AS day,
        (t.created_at AT TIME ZONE tm.time_zone)::date AS made_day
      FROM project_tasks t
      JOIN project_projects p ON p.id = t.project_id AND p.archived_at IS NULL
      JOIN project_teams tm ON tm.id = p.team_id
      WHERE t.repeat_every IS NOT NULL
        AND t.deleted_at IS NULL
        AND t.status = 'done'
        AND tm.time_zone IN (SELECT name FROM pg_timezone_names)
    )
    SELECT h.id AS "taskId", h.series_id AS "seriesId", h.day::text AS "day"
    FROM holders h
    WHERE h.made_day < h.day
      AND CASE h.repeat_every
        WHEN 'workday' THEN extract(dow FROM h.day)::int = ANY (h.work_days)
        WHEN 'week' THEN extract(dow FROM h.day)::int = ANY (h.repeat_week_days)
        WHEN 'month' THEN extract(day FROM h.day)::int = least(
          h.repeat_month_day,
          extract(day FROM (date_trunc('month', h.day) + interval '1 month - 1 day'))::int
        )
        -- The ticked days of the week it was set in, then of every other week:
        -- whole weeks counted from that week's Monday.
        WHEN 'two_weeks' THEN extract(dow FROM h.day)::int = ANY (h.repeat_week_days)
          AND h.day >= h.repeat_from
          AND ((h.day - (h.repeat_from - (extract(isodow FROM h.repeat_from)::int - 1))) / 7) % 2 = 0
        -- The first date's day, every third month from it; a day past the
        -- month's end falls on its last day.
        WHEN 'quarter' THEN h.day >= h.repeat_from
          AND (
            (extract(year FROM h.day)::int * 12 + extract(month FROM h.day)::int)
            - (extract(year FROM h.repeat_from)::int * 12 + extract(month FROM h.repeat_from)::int)
          ) % 3 = 0
          AND extract(day FROM h.day)::int = least(
            extract(day FROM h.repeat_from)::int,
            extract(day FROM (date_trunc('month', h.day) + interval '1 month - 1 day'))::int
          )
        -- A team work day with no other work day after it in the month.
        WHEN 'last_workday' THEN extract(dow FROM h.day)::int = ANY (h.work_days)
          AND NOT EXISTS (
            SELECT 1
            FROM generate_series(
              h.day + 1,
              (date_trunc('month', h.day) + interval '1 month - 1 day')::date,
              interval '1 day'
            ) later
            WHERE extract(dow FROM later)::int = ANY (h.work_days)
          )
        ELSE false
      END
      AND NOT EXISTS (
        SELECT 1 FROM project_repeat_runs r WHERE r.series_id = h.series_id AND r.day = h.day
      )
    LIMIT ${BATCH}
  `)

  for (const copy of due.rows as DueCopy[]) {
    await database.transaction(async (tx) => {
      const claimed = await tx
        .insert(projectRepeatRuns)
        .values({ seriesId: copy.seriesId, day: copy.day, madeAt: at })
        .onConflictDoNothing()
        .returning({ seriesId: projectRepeatRuns.seriesId })
      if (!claimed.length) return
      const [holder] = await tx.select().from(projectTasks).where(eq(projectTasks.id, copy.taskId))
      if (!holder?.repeatEvery || holder.deletedAt) return
      const id = uuid()
      await tx.insert(projectTasks).values({
        id,
        projectId: holder.projectId,
        title: holder.title,
        notes: holder.notes,
        status: "todo",
        assigneeUserId: holder.assigneeUserId,
        assignedByUserId: holder.assignedByUserId,
        firstHandedOutByUserId: holder.firstHandedOutByUserId,
        // Routine work the person already took on: no Waiting, no new notice.
        acceptedAt: holder.assigneeUserId ? at : null,
        // A copy with a date is due on the day it is made for.
        dueDate: holder.dueDate ? copy.day : null,
        sectionId: holder.sectionId,
        position: await nextTaskPosition(holder.projectId, tx),
        createdByUserId: holder.createdByUserId,
        createdAt: at,
        updatedAt: at,
        repeatEvery: holder.repeatEvery,
        repeatWeekDays: holder.repeatWeekDays,
        repeatMonthDay: holder.repeatMonthDay,
        repeatFrom: holder.repeatFrom,
        repeatSeriesId: copy.seriesId,
        typeId: holder.typeId,
        priority: holder.priority,
      })
      await copyFieldValues(tx, [{ from: holder.id, to: id }], null)
      await tx
        .update(projectTasks)
        .set({ repeatEvery: null, repeatWeekDays: null, repeatMonthDay: null, repeatFrom: null })
        .where(eq(projectTasks.id, holder.id))
      const steps = await tx
        .select({ text: projectTaskSteps.text, position: projectTaskSteps.position })
        .from(projectTaskSteps)
        .where(eq(projectTaskSteps.taskId, holder.id))
        .orderBy(asc(projectTaskSteps.position))
      if (steps.length) {
        await tx.insert(projectTaskSteps).values(
          steps.map((step) => ({
            id: uuid(),
            taskId: id,
            text: step.text,
            done: false,
            position: step.position,
            createdAt: at,
          }))
        )
      }
      const labels = await tx
        .select({ labelId: projectTaskLabels.labelId })
        .from(projectTaskLabels)
        .where(eq(projectTaskLabels.taskId, holder.id))
      if (labels.length) {
        await tx.insert(projectTaskLabels).values(labels.map(({ labelId }) => ({ taskId: id, labelId })))
      }
    })
  }
}

/**
 * Deletes for good every task that has sat in a bin for more than 30 days,
 * files first. A task whose files storage won't remove stays and is tried on
 * the next pass.
 */
export async function emptyOldBins(
  database: CustomShellDb = db,
  at = new Date(),
  storage?: FileStorage
) {
  const cutoff = new Date(at.getTime() - BIN_DAYS * 24 * 60 * 60 * 1000)
  const old = await database
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(and(isNotNull(projectTasks.deletedAt), lt(projectTasks.deletedAt, cutoff)))
    .limit(BATCH)
  for (const { id } of old) {
    try {
      await purgeTask(id, database, storage)
    } catch {
      // Storage refused; the task waits for the next pass rather than stopping the rest.
    }
  }
}
