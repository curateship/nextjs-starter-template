import { and, eq, inArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditRules, type CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { SubredditRule, SubredditRulesStatus } from "@/lib/social/options"

import { queueJob } from "../jobs"
import { promoJobs, promoSubredditRules } from "../schema"

/**
 * The rules each subreddit has posted, read once and kept.
 *
 * Plenty of subreddits ban links or any mention of your own product, and
 * breaking a posted rule is how an account gets banned. So the rules are shown
 * above the comment box and handed to the AI with the post. Nothing here
 * judges a draft against them or stops the Post button: the app shows what the
 * subreddit says and a person decides.
 *
 * Read when a post from a subreddit first turns up, not on every search, and
 * never for subreddits nobody has a post from.
 */

/** Rules barely change, so a reading stands this long. */
const RULES_FRESH_DAYS = 30

/** A subreddit that would not answer is asked again after this long. */
const FAILED_RETRY_DAYS = 1

/**
 * At most this many subreddits are queued after one search, one job each.
 *
 * One each rather than one job for all of them: a read can take up to two
 * minutes on a slow Reddit, and a job still running after the queue's ten
 * minutes is handed back, which would put two drivers on one browser. One
 * subreddit is always well inside that, and a failure retries only itself.
 */
const MAX_PER_SEARCH = 25

const DAY_MS = 24 * 60 * 60 * 1000

/** What the answer panel shows about a subreddit's rules. */
export type RulesView = {
  /** "unread" means nothing has been read yet, not that there are no rules. */
  state: "unread" | SubredditRulesStatus
  rules: SubredditRule[]
  readAt: Date | null
  /** Why Reddit would not answer, in words, when the state is "failed". */
  error: string
  /** A read is waiting or running. */
  reading: boolean
}

/** The stored rows for these subreddits, by lower-case name. */
async function storedRules(
  userId: string,
  names: string[],
  db: CustomShellDb
): Promise<Map<string, typeof promoSubredditRules.$inferSelect>> {
  if (!names.length) return new Map()
  const rows = await db
    .select()
    .from(promoSubredditRules)
    .where(
      and(
        eq(promoSubredditRules.userId, userId),
        inArray(
          sql`lower(${promoSubredditRules.subreddit})`,
          names.map((name) => name.toLowerCase())
        )
      )
    )
  return new Map(rows.map((row) => [row.subreddit.toLowerCase(), row]))
}

/** The subreddits a waiting or running rules job will already read, by lower-case name. */
async function pendingNames(userId: string, db: CustomShellDb): Promise<Set<string>> {
  const rows = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "rules"),
        inArray(promoJobs.status, ["queued", "running"])
      )
    )
  const names = new Set<string>()
  for (const row of rows) {
    const listed = row.payload?.subreddits
    if (!Array.isArray(listed)) continue
    for (const name of listed) if (typeof name === "string") names.add(name.toLowerCase())
  }
  return names
}

/** Whether a stored reading still stands. */
function stillGood(row: typeof promoSubredditRules.$inferSelect, now: Date): boolean {
  const days = row.status === "failed" ? FAILED_RETRY_DAYS : RULES_FRESH_DAYS
  return now.getTime() - row.readAt.getTime() < days * DAY_MS
}

/**
 * Queues a read, one job each, for the subreddits among these with no
 * reading that still stands and none already on its way. Called after a search with the
 * subreddits its posts came from, so a subreddit is read when a post from it
 * first appears, and again only weeks later.
 *
 * Returns how many subreddits were queued.
 */
export async function queueRulesFor(
  userId: string,
  subreddits: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const unique = new Map<string, string>()
  for (const name of subreddits) {
    if (name && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name)
  }
  if (!unique.size) return 0

  const [stored, pending] = await Promise.all([
    storedRules(userId, [...unique.values()], db),
    pendingNames(userId, db),
  ])
  const due = [...unique.entries()]
    .filter(([lower]) => !pending.has(lower))
    .filter(([lower]) => {
      const row = stored.get(lower)
      return !row || !stillGood(row, now)
    })
    .map(([, name]) => name)
    .slice(0, MAX_PER_SEARCH)

  for (const name of due) await queueJob(userId, "rules", { subreddits: [name] }, db)
  return due.length
}

/**
 * Queues a read of one subreddit's rules because a person asked, whatever
 * the stored reading says, unless one is already on its way.
 */
export async function queueRulesRead(
  userId: string,
  subreddit: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!subreddit) throw new Error("That post names no subreddit.")
  if ((await pendingNames(userId, db)).has(subreddit.toLowerCase())) return
  await queueJob(userId, "rules", { subreddits: [subreddit] }, db)
}

/** What a refused read says, from Reddit's own status. */
export function refusalWords(subreddit: string, status: number): string {
  if (status === 403) return `Reddit says r/${subreddit} is private, so its rules cannot be read.`
  if (status === 404) return `Reddit says r/${subreddit} does not exist, or has been banned.`
  if (status === 0) return `Reddit gave no answer for r/${subreddit}'s rules.`
  return `Reddit refused to show r/${subreddit}'s rules (status ${status}).`
}

/**
 * Reads each subreddit's rules through the browser and stores the answer. Run
 * by the browser program for a `rules` job.
 *
 * A subreddit Reddit refuses is stored as failed, with the reason, and asked
 * again a day later. A browser that cannot answer at all fails the job, so it
 * is tried again and nothing is written that would claim Reddit refused.
 */
export async function readSubredditRules(
  userId: string,
  subreddits: string[],
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  for (const subreddit of subreddits) {
    const answer = await redditRules(target, { subreddit })
    const status: SubredditRulesStatus = !answer.answered
      ? "failed"
      : answer.rules.length
        ? "read"
        : "none"
    await saveRules(
      userId,
      subreddit,
      {
        status,
        rules: answer.rules,
        lastError: status === "failed" ? refusalWords(subreddit, answer.status) : "",
      },
      db
    )
  }
}

/** Writes one subreddit's reading over the last one, or as its first. */
async function saveRules(
  userId: string,
  subreddit: string,
  reading: { status: SubredditRulesStatus; rules: SubredditRule[]; lastError: string },
  db: CustomShellDb
): Promise<void> {
  const values = { ...reading, readAt: new Date() }
  const sameName = and(
    eq(promoSubredditRules.userId, userId),
    sql`lower(${promoSubredditRules.subreddit}) = ${subreddit.toLowerCase()}`
  )
  const updated = await db
    .update(promoSubredditRules)
    .set(values)
    .where(sameName)
    .returning({ id: promoSubredditRules.id })
  if (updated.length) return
  await db
    .insert(promoSubredditRules)
    .values({ id: uuid(), userId, subreddit, ...values })
    .onConflictDoNothing()
}

/** One subreddit's rules for the answer panel, in all four of its states. */
export async function rulesForSubreddit(
  userId: string,
  subreddit: string,
  db: CustomShellDb = defaultDb
): Promise<RulesView> {
  const [stored, pending] = await Promise.all([
    storedRules(userId, [subreddit], db),
    pendingNames(userId, db),
  ])
  const row = stored.get(subreddit.toLowerCase())
  return {
    state: row?.status ?? "unread",
    rules: row?.rules ?? [],
    readAt: row?.readAt ?? null,
    error: row?.lastError ?? "",
    reading: pending.has(subreddit.toLowerCase()),
  }
}

/** The rules the AI is handed, or none when they have not been read or there are none. */
export async function promptRules(
  userId: string,
  subreddit: string,
  db: CustomShellDb = defaultDb
): Promise<SubredditRule[]> {
  const row = (await storedRules(userId, [subreddit], db)).get(subreddit.toLowerCase())
  return row?.status === "read" ? row.rules : []
}
