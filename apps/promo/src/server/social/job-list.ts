import { and, desc, eq, gte, inArray, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoProfiles } from "@/server/browser/schema"
import { canRetryJob, JOB_KIND_WORDS } from "@/lib/social/job-words"
import { WRITE_JOB_KINDS, type JobKind, type JobStatus } from "@/lib/social/options"

import { readBrowserProgram, type BrowserProgramState } from "./browser-program"
import { JOB_MAX_ATTEMPTS } from "./jobs"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoProjects } from "./schema"

/**
 * The browser program's queue, for the Jobs dashboard: what is running,
 * what is waiting, and what finished or failed lately.
 *
 * Every job is already a `promo_jobs` row, so this only reads them and puts
 * names to the ids in their payloads: the keyword a search is for, the post a
 * comment goes on, the account and the browser profile it works in.
 */

/** Finished jobs stay on the list this long; failed ones a week, so a failure is not missed overnight. */
const DONE_FOR_MS = 86_400_000
const FAILED_FOR_MS = 7 * 86_400_000

/** At most this many finished rows, newest first. The waiting and running are never cut. */
const FINISHED_LIMIT = 200

export type JobRow = {
  id: string
  kind: JobKind
  status: JobStatus
  /** What it does, with the kind's own words first: `Search a keyword: "czxvcv"`. */
  what: string
  /** Who it works as and in which browser: "u/test_ready · Profile 1". Empty when neither is known. */
  where: string
  attempts: number
  maxAttempts: number
  lastError: string
  addedAt: Date
  claimedAt: Date | null
  runAfter: Date | null
  finishedAt: Date | null
  /** Another job in the same browser is running, so this one waits its turn. */
  laneBusy: boolean
  canRetry: boolean
}

export type JobList = {
  program: BrowserProgramState
  jobs: JobRow[]
}

const text = (value: unknown): string => (typeof value === "string" ? value : "")

export async function listJobs(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<JobList> {
  const [active, finished, program] = await Promise.all([
    db
      .select()
      .from(promoJobs)
      .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.status, ["queued", "running"])))
      .orderBy(promoJobs.createdAt),
    db
      .select()
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          or(
            and(eq(promoJobs.status, "done"), gte(promoJobs.finishedAt, new Date(now.getTime() - DONE_FOR_MS))),
            and(eq(promoJobs.status, "failed"), gte(promoJobs.finishedAt, new Date(now.getTime() - FAILED_FOR_MS)))
          )
        )
      )
      .orderBy(desc(promoJobs.finishedAt))
      .limit(FINISHED_LIMIT),
    readBrowserProgram(db, now),
  ])
  const rows = [...active, ...finished]

  // Every id the payloads name, looked up once per table rather than per row.
  const ids = (key: string) => [...new Set(rows.map((row) => text(row.payload[key])).filter(Boolean))]
  const commentIds = ids("commentId")
  const [keywords, finds, projects, comments] = await Promise.all([
    named(db, promoKeywords, promoKeywords.term, ids("keywordId"), userId),
    named(db, promoFinds, promoFinds.title, ids("findId"), userId),
    named(db, promoProjects, promoProjects.name, ids("projectId"), userId),
    commentIds.length
      ? db
          .select({ id: promoComments.id, title: promoFinds.title })
          .from(promoComments)
          .leftJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
          .where(and(eq(promoComments.userId, userId), inArray(promoComments.id, commentIds)))
      : Promise.resolve([]),
  ])
  const commentTitles = new Map(comments.map((row) => [row.id, row.title ?? ""]))

  const accountIds = ids("accountId")
  const accounts = accountIds.length
    ? await db
        .select({ id: promoAccounts.id, handle: promoAccounts.handle })
        .from(promoAccounts)
        .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, accountIds)))
    : []
  const accountById = new Map(accounts.map((row) => [row.id, row]))

  const profileIds = [
    ...new Set(
      rows
        .flatMap((row) => [row.lane, text(row.payload.profileId)])
        .filter((id): id is string => Boolean(id))
    ),
  ]
  const profiles = profileIds.length
    ? await db
        .select({ id: promoProfiles.id, name: promoProfiles.name })
        .from(promoProfiles)
        .where(and(eq(promoProfiles.userId, userId), inArray(promoProfiles.id, profileIds)))
    : []
  const profileName = new Map(profiles.map((row) => [row.id, row.name]))

  const busyLanes = new Set(rows.filter((row) => row.status === "running" && row.lane).map((row) => row.lane))

  const jobs = rows.map((row): JobRow => {
    const payload = row.payload
    const about = aboutText(row.kind, payload, {
      keyword: keywords.get(text(payload.keywordId)),
      find: finds.get(text(payload.findId)),
      project: projects.get(text(payload.projectId)),
      comment: commentTitles.get(text(payload.commentId)),
    })
    const account = accountById.get(text(payload.accountId))
    const profile = profileName.get(row.lane ?? "") ?? profileName.get(text(payload.profileId))
    const who = account ? (account.handle ? `u/${account.handle}` : "An account not signed in") : ""
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      what: about ? `${JOB_KIND_WORDS[row.kind]}: ${about}` : JOB_KIND_WORDS[row.kind],
      where: [who, profile].filter(Boolean).join(" · "),
      attempts: row.attempts,
      // A job that writes to Reddit gets one go, because a second could post twice.
      maxAttempts: WRITE_JOB_KINDS.includes(row.kind) ? 1 : JOB_MAX_ATTEMPTS,
      lastError: row.lastError,
      addedAt: row.createdAt,
      claimedAt: row.claimedAt,
      runAfter: row.runAfter,
      finishedAt: row.finishedAt,
      laneBusy: row.status === "queued" && Boolean(row.lane) && busyLanes.has(row.lane),
      canRetry: row.status === "failed" && canRetryJob(row.kind),
    }
  })

  return { program, jobs }
}

/** Names by id from one of the person's own tables. */
async function named(
  db: CustomShellDb,
  table: typeof promoKeywords | typeof promoFinds | typeof promoProjects,
  column: typeof promoKeywords.term | typeof promoFinds.title | typeof promoProjects.name,
  ids: string[],
  userId: string
): Promise<Map<string, string>> {
  if (!ids.length) return new Map()
  const rows = await db
    .select({ id: table.id, name: column })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(table.id, ids)))
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** What the job is about, after its kind's words. Empty when there is nothing more to say. */
function aboutText(
  kind: JobKind,
  payload: Record<string, unknown>,
  names: { keyword?: string; find?: string; project?: string; comment?: string }
): string {
  const quoted = (value: string | undefined, gone: string) => (value ? `"${value}"` : gone)
  const subreddits = Array.isArray(payload.subreddits) ? payload.subreddits.filter((name) => typeof name === "string") : []
  const subreddit = text(payload.subreddit) || subreddits[0] || ""
  switch (kind) {
    case "search":
      return quoted(names.keyword, "a keyword since deleted")
    case "thread":
    case "comment":
      return quoted(names.find, "a post no longer saved")
    case "reply":
    case "comment_check":
    case "delete_comment":
    case "edit_comment":
      return names.comment ? `"${names.comment}"` : ""
    case "submit":
      return [text(payload.title) ? `"${text(payload.title)}"` : "", subreddit ? `to r/${subreddit}` : ""]
        .filter(Boolean)
        .join(" ")
    case "rules":
      return subreddits.length > 1 ? `${subreddits.length} subreddits` : subreddit ? `r/${subreddit}` : ""
    case "promo_threads":
      return [subreddit ? `r/${subreddit}` : "", names.project ? `for ${names.project}` : ""].filter(Boolean).join(" ")
    default:
      return ""
  }
}

/**
 * Takes waiting jobs off the queue. A job that has started is never stopped
 * part-way, because a comment half typed may already be on Reddit.
 */
export async function cancelJobs(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.id, ids), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  const done = new Set(removed.map((row) => row.id))
  return { completed: [...done], skipped: ids.filter((id) => !done.has(id)) }
}

/**
 * Puts failed jobs back on the queue for a fresh three goes. Only the kinds
 * that only read: one that writes to Reddit may have gone out before it
 * failed, so it is tried again from the Comments screen instead.
 */
export async function retryJobs(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const rows = await db
    .select({ id: promoJobs.id, kind: promoJobs.kind })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.id, ids), eq(promoJobs.status, "failed")))
  const allowed = rows.filter((row) => canRetryJob(row.kind)).map((row) => row.id)
  const updated = allowed.length
    ? await db
        .update(promoJobs)
        .set({
          status: "queued",
          attempts: 0,
          lastError: "",
          claimToken: null,
          claimedAt: null,
          finishedAt: null,
          runAfter: null,
        })
        .where(and(inArray(promoJobs.id, allowed), eq(promoJobs.status, "failed")))
        .returning({ id: promoJobs.id })
    : []
  const done = new Set(updated.map((row) => row.id))
  return { completed: [...done], skipped: ids.filter((id) => !done.has(id)) }
}
