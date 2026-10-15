import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"

import { ringBell } from "./notices"
import { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords } from "./schema"

/**
 * Comments, answers and posts that did not reach Reddit: the Comments screen's
 * Failed tab, and the bell notice each failure rings.
 *
 * The failure is read from its job rather than from a comment row, because
 * most failures never make one. A comment refused before it reached the
 * browser (retired, no profile, already commented) fails its job and writes
 * nothing else, and one whose browser died part-way is marked failed with
 * "the comment may already be on Reddit" on the job alone. A failed comment
 * is never tried again by itself (`jobs.ts`), so this is where a person sees
 * it and decides.
 */

/** The job kinds that write to Reddit, whose failures are listed. */
export const WRITE_KINDS = ["comment", "reply", "submit"] as const
type WriteKind = (typeof WRITE_KINDS)[number]

/** What the jobs layer says when a comment's browser died part-way. */
const MAY_HAVE_LANDED = "may already be on Reddit"

export type FailureRow = {
  /** The failed job's id. */
  id: string
  kind: WriteKind
  /** The words that were tried. */
  text: string
  /** For a post of your own, its title. "" otherwise. */
  title: string
  reason: string
  /** True when the browser stopped part-way and the words may be on Reddit anyway. */
  mayHaveLanded: boolean
  failedAt: Date
  account: { id: string; handle: string } | null
  /** The post it answered, for a comment or an answer. Null for a post of your own. */
  post: { findId: string; title: string; subreddit: string; url: string } | null
  /** For a post of your own, where it was going. */
  subreddit: string
  /** The project the post belongs to, so Try again can open it there. Null when it has none. */
  projectId: string | null
  /** For an answer, the sent comment it sits under, whose Replies window Try again opens. */
  commentId: string | null
}

/** Every failure not yet dismissed, newest first. */
export async function listFailures(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<FailureRow[]> {
  const jobs = await db
    .select()
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, [...WRITE_KINDS]),
        eq(promoJobs.status, "failed"),
        isNull(promoJobs.dismissedAt)
      )
    )
    .orderBy(desc(promoJobs.finishedAt), desc(promoJobs.createdAt))
    .limit(200)
  if (!jobs.length) return []

  const accountIds = [...new Set(jobs.map((job) => text(job.payload.accountId)).filter(Boolean))]
  const commentIds = [...new Set(jobs.map((job) => text(job.payload.commentId)).filter(Boolean))]
  const parents = commentIds.length
    ? await db
        .select({ id: promoComments.id, findId: promoComments.findId })
        .from(promoComments)
        .where(and(eq(promoComments.userId, userId), inArray(promoComments.id, commentIds)))
    : []
  const findOf = new Map(parents.map((row) => [row.id, row.findId]))
  const findIds = [
    ...new Set(
      jobs
        .map((job) => text(job.payload.findId) || findOf.get(text(job.payload.commentId)) || "")
        .filter(Boolean)
    ),
  ]

  const [accounts, finds] = await Promise.all([
    accountIds.length
      ? db
          .select({ id: promoAccounts.id, handle: promoAccounts.handle })
          .from(promoAccounts)
          .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, accountIds)))
      : [],
    findIds.length
      ? db
          .select({
            id: promoFinds.id,
            title: promoFinds.title,
            subreddit: promoFinds.subreddit,
            permalink: promoFinds.permalink,
            keywordProject: promoKeywords.projectId,
            threadProject: promoFinds.threadProjectId,
          })
          .from(promoFinds)
          .leftJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
          .where(and(eq(promoFinds.userId, userId), inArray(promoFinds.id, findIds)))
      : [],
  ])
  const accountById = new Map(accounts.map((row) => [row.id, row]))
  const findById = new Map(finds.map((row) => [row.id, row]))

  return jobs.map((job) => {
    const kind = job.kind as WriteKind
    const findId = text(job.payload.findId) || findOf.get(text(job.payload.commentId)) || ""
    const find = findById.get(findId) ?? null
    const account = accountById.get(text(job.payload.accountId)) ?? null
    return {
      id: job.id,
      kind,
      text: text(job.payload.text) || text(job.payload.body),
      title: text(job.payload.title),
      reason: job.lastError || "It failed without saying why.",
      mayHaveLanded: job.lastError.includes(MAY_HAVE_LANDED),
      failedAt: job.finishedAt ?? job.createdAt,
      account: account ? { id: account.id, handle: account.handle } : null,
      post: find
        ? {
            findId: find.id,
            title: find.title,
            subreddit: find.subreddit,
            url: `https://www.reddit.com${find.permalink}`,
          }
        : null,
      subreddit: find?.subreddit ?? text(job.payload.subreddit),
      projectId: find?.keywordProject ?? find?.threadProject ?? (text(job.payload.projectId) || null),
      commentId: text(job.payload.commentId) || null,
    }
  })
}

/** Takes failures off the Failed tab. The jobs stay. One request for any number. */
export async function dismissFailures(
  userId: string,
  jobIds: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ completed: string[]; skipped: string[] }> {
  if (!jobIds.length) return { completed: [], skipped: [] }
  const rows = await db
    .update(promoJobs)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.id, jobIds),
        inArray(promoJobs.kind, [...WRITE_KINDS]),
        eq(promoJobs.status, "failed"),
        isNull(promoJobs.dismissedAt)
      )
    )
    .returning({ id: promoJobs.id })
  const completed = rows.map((row) => row.id)
  return { completed, skipped: jobIds.filter((id) => !completed.includes(id)) }
}

/**
 * The words of one failed comment, for Try again, which puts them back in
 * the box on the post's project dashboard. Never sends them: Post still needs
 * a press.
 */
export async function failedWords(
  userId: string,
  jobId: string,
  db: CustomShellDb = defaultDb
): Promise<{ findId: string; text: string; accountId: string | null } | null> {
  const [job] = await db
    .select({ kind: promoJobs.kind, status: promoJobs.status, payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.id, jobId), eq(promoJobs.userId, userId)))
    .limit(1)
  if (!job || job.kind !== "comment" || job.status !== "failed") return null
  const findId = text(job.payload.findId)
  if (!findId) return null
  return {
    findId,
    text: text(job.payload.text),
    accountId: text(job.payload.accountId) || null,
  }
}

/**
 * Rings the bell for a comment, an answer or a post that did not go out. One
 * notice per failed job, opening the Failed tab.
 */
export async function ringForFailure(
  job: { id: string; userId: string; kind: string },
  reason: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!(WRITE_KINDS as readonly string[]).includes(job.kind)) return
  const what = job.kind === "submit" ? "a post of yours" : job.kind === "reply" ? "an answer to a reply" : "a comment"
  // It opens on the Comments tab of the project the account is in, under
  // Failed. An account in no project has no Comments tab, so that one opens
  // the Projects table.
  const [owner] = await db
    .select({ projectId: promoAccounts.projectId })
    .from(promoJobs)
    .innerJoin(promoAccounts, eq(promoAccounts.id, sql`${promoJobs.payload}->>'accountId'`))
    .where(and(eq(promoJobs.id, job.id), eq(promoJobs.userId, job.userId)))
    .limit(1)
  const projectId = owner?.projectId ?? null
  await ringBell(
    job.userId,
    {
      kind: "failed",
      targetId: job.id,
      message: `${NOTICE_HEADINGS.failed} ${what}`,
      detail: reason.includes(MAY_HAVE_LANDED)
        ? `${reason} It is on the project's Comments tab, under Failed.`
        : `${reason} It is on the project's Comments tab, under Failed, with Try again.`,
      href: projectId ? `/admin/projects/${encodeURIComponent(projectId)}?view=comments&list=failed` : "/admin/projects",
    },
    db
  )
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}
