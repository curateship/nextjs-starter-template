import { and, eq, gte, ne, sql } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { countInboxThreads, waitingCutoff } from "@/server/crm/inbox"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailSettings } from "@/server/email/settings"
import { customShellCrmMessages, customShellCrmThreads } from "@/server/schema"

/** How far back Mail per day and Time to first answer look. */
export const CRM_OVERVIEW_DAYS = 30

/**
 * The numbers behind the CRM Overview's four Inbox widgets (CRM task 38,
 * part 2): Unread, Waiting on you, Mail per day and Time to first answer.
 *
 * Mail from blocked senders, and machines' mail in the Other view, count in
 * none of them. A blocked sender's conversations are the only closed ones
 * (`inbox-and-leads.md`, "Unread, snoozed and closed"), so leaving out closed
 * conversations is leaving out blocked mail.
 */
export type CrmOverviewFigures = {
  /** Unread conversations, the Inbox's Unread count. */
  unread: number
  /** The Waiting view's count. */
  waiting: number
  /** False while the unanswered-mail chase is off, which hides Waiting in the Inbox too. */
  waitingOn: boolean
  /** Mail that came in, one point per day for the last 30 days, oldest first, no gaps. */
  mailPerDay: { day: string; mail: number }[]
  /**
   * The typical time, in milliseconds, between someone's first mail and the
   * first answer to it, over conversations started in the last 30 days. The
   * middle one of them, so one reply a week late does not drag it. Null when
   * nothing in that time has been answered.
   */
  typicalFirstAnswerMs: number | null
  /** How many answered conversations the typical time is taken over. */
  answered: number
}

export async function getCrmOverviewFigures(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CrmOverviewFigures> {
  const settings = await getEmailSettings(workspaceId, database)
  // The same default the Inbox, the chase and the Waiting on you block use.
  const unansweredDays = settings?.crmUnansweredDays ?? 3
  const waitingSince = unansweredDays > 0 ? waitingCutoff(unansweredDays) : null
  const since = startOfDayUtc(new Date(now().getTime() - (CRM_OVERVIEW_DAYS - 1) * 86_400_000))

  const [counts, daily, answers] = await Promise.all([
    // The Inbox's own count, so the widget and the view dropdown agree.
    countInboxThreads(workspaceId, { status: "open" }, database, waitingSince),
    database
      .select({
        day: sql<string>`to_char(${customShellCrmMessages.occurredAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        mail: sql<number>`count(*)`,
      })
      .from(customShellCrmMessages)
      .innerJoin(customShellCrmThreads, eq(customShellCrmThreads.id, customShellCrmMessages.threadId))
      .where(
        and(
          eq(customShellCrmMessages.workspaceId, workspaceId),
          eq(customShellCrmMessages.direction, "in"),
          ne(customShellCrmThreads.status, "closed"),
          // People's mail: machines' is in the Other view (part 4).
          eq(customShellCrmThreads.robot, false),
          gte(customShellCrmMessages.occurredAt, since)
        )
      )
      .groupBy(sql`1`),
    firstAnswers(workspaceId, since, database),
  ])

  const byDay = new Map(daily.map((row) => [row.day, Number(row.mail)]))
  const mailPerDay = Array.from({ length: CRM_OVERVIEW_DAYS }, (_, index) => {
    const day = new Date(since.getTime() + index * 86_400_000).toISOString().slice(0, 10)
    return { day, mail: byDay.get(day) ?? 0 }
  })

  return {
    unread: counts.unread,
    waiting: counts.waiting,
    waitingOn: waitingSince !== null,
    mailPerDay,
    typicalFirstAnswerMs: answers.typicalMs,
    answered: answers.answered,
  }
}

/**
 * The middle time from a conversation's first mail in to the first mail out
 * after it, over the open conversations whose first mail came since `since`.
 * A conversation nobody has answered yet is left out, rather than counted as
 * an answer that has not happened.
 *
 * Every column is written with its table, because two copies of
 * `crm_messages` meet in this query and an unqualified `occurred_at` would be
 * either of them.
 */
async function firstAnswers(
  workspaceId: string,
  since: Date,
  database: CustomShellDb
): Promise<{ typicalMs: number | null; answered: number }> {
  const result = await database.execute(sql`
    select
      percentile_cont(0.5) within group (
        order by extract(epoch from (answer.first_out - asked.first_in))
      ) as typical_seconds,
      count(*) as answered
    from (
      select m.thread_id, min(m.occurred_at) as first_in
      from crm_messages m
      where m.workspace_id = ${workspaceId} and m.direction = 'in'
      group by m.thread_id
      having min(m.occurred_at) >= ${since}
    ) asked
    join crm_threads t on t.id = asked.thread_id and t.status <> 'closed' and not t.robot
    join lateral (
      select min(o.occurred_at) as first_out
      from crm_messages o
      where o.thread_id = asked.thread_id and o.direction = 'out' and o.occurred_at > asked.first_in
    ) answer on answer.first_out is not null
  `)
  // node-postgres answers `{ rows }`; the test database can answer the array
  // itself (the same reading as `resultRows` in `quiet-contacts.ts`).
  const rows: unknown = Array.isArray(result) ? result : (result as { rows?: unknown }).rows
  const row = ((Array.isArray(rows) ? rows[0] : null) ?? {}) as {
    typical_seconds?: string | number | null
    answered?: string | number
  }
  const answered = Number(row.answered ?? 0)
  const seconds = row.typical_seconds === null || row.typical_seconds === undefined ? null : Number(row.typical_seconds)
  return { typicalMs: answered > 0 && seconds !== null ? Math.round(seconds * 1000) : null, answered }
}

function startOfDayUtc(at: Date) {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}
