import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { redditSearch, type CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoPhones } from "@/server/phones/schema"
import { promoProfiles } from "@/server/browser/schema"

import { queueJob } from "../jobs"
import { readPostingState, type PostingState } from "../posting"
import { promoAccounts, promoFinds, promoJobs, promoVoices } from "../schema"

import { blockedNames } from "./blocked"
import { fitBand, rankFind, type FitBand } from "./rank"

/**
 * Helpful comments that build karma: posts in the subreddits one account has
 * joined, answered with help and never a word about what you make.
 *
 * An account whose comments are mostly ordinary help reads as a person, gets
 * removed less, and earns the karma some subreddits ask for before anyone may
 * post. These posts belong to that account alone, not to a project or a
 * keyword, and only it answers them. Drafts are told to help and mention
 * nothing (`helpOnly` in `drafts.ts`). A person still presses Post, and every
 * rule Post has still applies. Tyler, 12 Oct 2026: the list lives on the
 * Reddit accounts dashboard.
 */

/** At most this many of the account's subreddits are read for one press. */
const MAX_SUBREDDITS = 5

/** Queues a read of the newest posts in the account's joined subreddits. */
export async function queueHelpRead(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const account = await helpAccount(userId, accountId, db)
  if (!account.joinedSubreddits.length) {
    throw new Refusal(
      "This account has not joined any subreddits yet. Its daily warm-up joins some; until then there is nothing to read."
    )
  }
  const [pending] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "help_read"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  if (pending) return
  await queueJob(userId, "help_read", { accountId }, db)
}

async function helpAccount(userId: string, accountId: string, db: CustomShellDb) {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.retiredAt) throw new Refusal("That account is not there any more.")
  return account
}

/**
 * The read itself, for a `help_read` job, in the reader browser: each joined
 * subreddit's newest posts, stored as this account's, ranked the way every
 * post is so the freshest and quietest come first.
 */
export async function readHelpPosts(
  userId: string,
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const account = await helpAccount(userId, String(payload.accountId ?? ""), db)
  const blocked = await blockedNames(userId, db)
  const subreddits = account.joinedSubreddits
    .filter((name) => /^[a-z0-9_]{1,60}$/i.test(name) && !blocked.has(name.toLowerCase()))
    .slice(0, MAX_SUBREDDITS)

  let stored = 0
  for (const subreddit of subreddits) {
    const answer = await redditSearch(target, { query: "", subreddit, sort: "new", window: "day" })
    for (const post of answer.posts) {
      if (blocked.has(post.subreddit.toLowerCase())) continue
      const postedAt = post.postedAtSeconds ? new Date(post.postedAtSeconds * 1000) : null
      await db
        .insert(promoFinds)
        .values({
          id: uuid(),
          userId,
          keywordId: null,
          helpAccountId: account.id,
          redditId: post.redditId,
          permalink: post.permalink,
          subreddit: post.subreddit,
          title: post.title,
          body: post.body,
          author: post.author,
          score: post.score,
          commentCount: post.commentCount,
          postedAt,
          redditPosition: post.position,
          rank: rankFind({ position: post.position, commentCount: post.commentCount, postedAt }, now),
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [promoFinds.helpAccountId, promoFinds.redditId],
          targetWhere: sql`${promoFinds.helpAccountId} IS NOT NULL`,
          set: {
            score: sql`excluded.score`,
            commentCount: sql`excluded.comment_count`,
            rank: sql`excluded.rank`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        })
      stored += 1
    }
  }
  return stored
}

export type HelpPostRow = {
  id: string
  title: string
  subreddit: string
  author: string
  commentCount: number
  postedAt: Date | null
  fit: FitBand
  url: string
}

export type HelpPage = {
  account: {
    id: string
    handle: string
    blocked: boolean
    reason: string
    profile: { id: string; name: string } | null
    /** The phone it runs on instead of a browser profile, or null. */
    phone: { id: string; name: string } | null
    voice: { id: string; name: string } | null
    posting: PostingState
    joinedSubreddits: string[]
  }
  /** Posts still to answer or skip, best first. */
  posts: HelpPostRow[]
  /** How many of these the account has answered, ever. */
  answered: number
  /** A read of the subreddits is waiting or running. */
  reading: boolean
}

/** One account's help-only posts and everything the comment box needs about the account. */
export async function readHelpPage(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<HelpPage> {
  const [row] = await db
    .select({
      account: promoAccounts,
      profileName: promoProfiles.name,
      phoneName: promoPhones.name,
      voiceName: promoVoices.name,
    })
    .from(promoAccounts)
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!row || row.account.retiredAt) throw new Refusal("That account is not there any more.")
  const { account } = row

  const [posts, answered, pending] = await Promise.all([
    db
      .select()
      .from(promoFinds)
      .where(
        and(
          eq(promoFinds.userId, userId),
          eq(promoFinds.helpAccountId, accountId),
          notInArray(promoFinds.status, ["commented", "skipped"])
        )
      )
      .orderBy(desc(promoFinds.rank), desc(promoFinds.postedAt))
      .limit(60),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(promoFinds)
      .where(
        and(eq(promoFinds.userId, userId), eq(promoFinds.helpAccountId, accountId), eq(promoFinds.status, "commented"))
      ),
    db
      .select({ id: promoJobs.id })
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, userId),
          eq(promoJobs.kind, "help_read"),
          inArray(promoJobs.status, ["queued", "running"]),
          sql`${promoJobs.payload}->>'accountId' = ${accountId}`
        )
      )
      .limit(1),
  ])

  return {
    account: {
      id: account.id,
      handle: account.handle,
      blocked: account.blocked,
      reason: account.blockedReason,
      profile: account.profileId && row.profileName !== null ? { id: account.profileId, name: row.profileName } : null,
      phone: account.phoneId && row.phoneName !== null ? { id: account.phoneId, name: row.phoneName } : null,
      voice: account.voiceId && row.voiceName !== null ? { id: account.voiceId, name: row.voiceName } : null,
      posting: await readPostingState(userId, account, db, now),
      joinedSubreddits: account.joinedSubreddits,
    },
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      subreddit: post.subreddit,
      author: post.author,
      commentCount: post.commentCount,
      postedAt: post.postedAt,
      fit: fitBand(post.rank),
      url: `https://www.reddit.com${post.permalink}`,
    })),
    answered: answered[0]?.count ?? 0,
    reading: pending.length > 0,
  }
}
