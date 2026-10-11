import { and, eq, isNull, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { writeCheckinReminder } from "@/server/project/notices"
import { projectCheckinReminders, projectCheckins } from "@/server/project/schema"

/**
 * The check-in's two background jobs, run on the shell's fifteen-second loop
 * (`src/app/server-options.ts`). Each claims its own work, so two overlapping
 * passes never send two reminders or save a day twice.
 *
 * Both work out each person's own day in Postgres, from the person's time
 * zone or the team's, so the list of people is never read into memory.
 */

const BATCH = 200

/**
 * Everyone on a team, with their time zone and check-in time (the team's when
 * they haven't set their own). A zone Postgres doesn't know is left out here,
 * before any date is worked out from it: one such zone would otherwise fail
 * the whole query and stop every team's reminders. Saving a zone checks
 * Postgres knows it (`requireKnownZone`), so this only matters for a zone
 * Postgres stopped knowing after an upgrade.
 */
export const PEOPLE = sql.raw(`
  people AS MATERIALIZED (
    SELECT m.user_id, m.team_id, m.joined_at, t.work_days,
      coalesce(m.time_zone, t.time_zone) AS zone,
      coalesce(m.checkin_time, t.checkin_time) AS at_time
    FROM project_team_members m
    JOIN project_teams t ON t.id = m.team_id
    WHERE coalesce(m.time_zone, t.time_zone) IN (SELECT name FROM pg_timezone_names)
  )`)

export async function runCheckinJobs(database: CustomShellDb = db, at = new Date()) {
  await sendCheckinReminders(database, at)
  await saveFinishedDays(database, at)
}

/**
 * One bell notice per person per work day, once their check-in time has come,
 * and never after they have checked in, nor on their time off. Each reminder is claimed by writing
 * its row first, in the same transaction as the notice.
 */
export async function sendCheckinReminders(database: CustomShellDb = db, at = new Date()) {
  const due = await database.execute(sql`
    WITH ${PEOPLE}
    SELECT p.user_id AS "userId", l.day::text AS "day"
    FROM people p
    CROSS JOIN LATERAL (
      SELECT (${at.toISOString()}::timestamptz AT TIME ZONE p.zone) AS local
    ) z
    CROSS JOIN LATERAL (SELECT z.local::date AS day) l
    WHERE extract(dow FROM z.local)::int = ANY (p.work_days)
      AND to_char(z.local, 'HH24:MI') >= p.at_time
      AND NOT EXISTS (
        SELECT 1 FROM project_checkins c
        WHERE c.user_id = p.user_id AND c.day = l.day AND c.checked_in_at IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM project_checkin_reminders r
        WHERE r.user_id = p.user_id AND r.day = l.day
      )
      AND NOT EXISTS (
        SELECT 1 FROM project_time_off o
        WHERE o.user_id = p.user_id AND l.day BETWEEN o.first_day AND o.last_day
      )
    LIMIT ${BATCH}
  `)
  for (const person of due.rows as { userId: string; day: string }[]) {
    await database.transaction(async (tx) => {
      const claimed = await tx
        .insert(projectCheckinReminders)
        .values({ userId: person.userId, day: person.day, sentAt: at })
        .onConflictDoNothing()
        .returning({ userId: projectCheckinReminders.userId })
      if (claimed.length) await writeCheckinReminder(tx, person.userId)
    })
  }
}

/**
 * Once a person's day is over in their own time zone, saves each of that
 * day's picks with the status it has at that moment. History reads only these
 * saved statuses, never today's.
 *
 * It also writes a row for yesterday for anyone with none, so the calendar
 * can tell a missed work day from a day off. A day the job never ran on (the
 * server was down past midnight and into the next day) has no such row.
 */
export async function saveFinishedDays(database: CustomShellDb = db, at = new Date()) {
  const finished = await database.execute(sql`
    WITH open_days AS MATERIALIZED (
      SELECT c.id, c.day, c.time_zone
      FROM project_checkins c
      WHERE c.closed_at IS NULL
        AND c.checked_in_at IS NOT NULL
        AND c.time_zone IN (SELECT name FROM pg_timezone_names)
    )
    SELECT o.id
    FROM open_days o
    WHERE o.day < (${at.toISOString()}::timestamptz AT TIME ZONE o.time_zone)::date
    LIMIT ${BATCH}
  `)
  for (const { id } of finished.rows as { id: string }[]) {
    await database.transaction(async (tx) => {
      const claimed = await tx
        .update(projectCheckins)
        .set({ closedAt: at })
        .where(and(eq(projectCheckins.id, id), isNull(projectCheckins.closedAt)))
        .returning({ id: projectCheckins.id })
      if (!claimed.length) return
      // A deleted task, or one in the bin, keeps no status: its line reads as deleted.
      await tx.execute(sql`
        UPDATE project_checkin_items i
        SET end_status = t.status
        FROM project_tasks t
        WHERE i.checkin_id = ${id} AND i.kind = 'pick' AND i.task_id = t.id
          AND t.deleted_at IS NULL
      `)
    })
  }

  await database.execute(sql`
    WITH ${PEOPLE}
    INSERT INTO project_checkins
      (id, team_id, user_id, day, time_zone, work_day, due_at, checked_in_at, closed_at, created_at)
    SELECT gen_random_uuid()::text, p.team_id, p.user_id, y.day, p.zone,
      -- Time off makes the day a day off, so it isn't "Didn't check in".
      extract(dow FROM y.day)::int = ANY (p.work_days) AND NOT EXISTS (
        SELECT 1 FROM project_time_off o
        WHERE o.user_id = p.user_id AND y.day BETWEEN o.first_day AND o.last_day
      ),
      (y.day + p.at_time::time) AT TIME ZONE p.zone,
      NULL, ${at.toISOString()}::timestamptz, ${at.toISOString()}::timestamptz
    FROM people p
    CROSS JOIN LATERAL (
      SELECT ((${at.toISOString()}::timestamptz AT TIME ZONE p.zone)::date - 1) AS day
    ) y
    WHERE (p.joined_at AT TIME ZONE p.zone)::date <= y.day
      AND NOT EXISTS (
        SELECT 1 FROM project_checkins c WHERE c.user_id = p.user_id AND c.day = y.day
      )
    ON CONFLICT (user_id, day) DO NOTHING
  `)
}
