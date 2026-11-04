import { and, eq, isNull, lte, ne, or, sql } from "drizzle-orm"

import { THROWAWAY_FIRST_MS } from "@/lib/bans/options"
import { NETWORK_NAMES, type PhoneAppNetwork } from "@/lib/social/networks"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoAccounts, promoAppPosts, promoComments, promoFinds } from "@/server/social/schema"

/**
 * Throwaway first (Bans task, part 22): a throwaway takes the risk before an
 * important account does.
 *
 * - On Reddit, an important account's first comment in a subreddit is
 *   refused until a throwaway's comment there has stayed up 24 hours.
 *   Important accounts only run on phones, and the Reddit app on a phone
 *   only comments, so a comment is the only thing it posts there.
 * - On Instagram and TikTok, which have no subreddits, an important
 *   account's first photo, or first video, is refused until a throwaway's
 *   post of that kind on the same app has stayed up 24 hours.
 *
 * The throwaway must not be banned, and its post must not be removed. The
 * apart rules still hold (`src/server/social/apart.ts`): any throwaway of
 * the person's counts, so it is never the important account's helper.
 */

type Important = { id: string; userId: string; importance: string }

/** A throwaway that is not stopped by a ban and not retired. */
const healthyThrowaway = and(
  eq(promoAccounts.importance, "throwaway"),
  isNull(promoAccounts.banScreenAt),
  isNull(promoAccounts.retiredAt),
  sql`coalesce((${promoAccounts.profileCheck}->>'suspended')::boolean, false) = false`
)

export async function refuseImportantFirstInSubreddit(
  account: Important,
  subreddit: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (account.importance !== "important" || !subreddit) return
  const name = subreddit.toLowerCase()
  const inSubreddit = sql`lower(${promoFinds.subreddit}) = ${name}`
  const [been] = await db
    .select({ id: promoComments.id })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .where(and(eq(promoComments.accountId, account.id), eq(promoComments.status, "posted"), inSubreddit))
    .limit(1)
  if (been) return
  const [tried] = await db
    .select({ id: promoComments.id })
    .from(promoComments)
    .innerJoin(promoFinds, eq(promoFinds.id, promoComments.findId))
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoComments.accountId))
    .where(
      and(
        eq(promoComments.userId, account.userId),
        ne(promoComments.accountId, account.id),
        eq(promoComments.status, "posted"),
        lte(promoComments.postedAt, new Date(now.getTime() - THROWAWAY_FIRST_MS)),
        isNull(promoComments.deletedAt),
        or(isNull(promoComments.stillVisible), eq(promoComments.stillVisible, true)),
        inSubreddit,
        healthyThrowaway
      )
    )
    .limit(1)
  if (!tried) {
    throw new Refusal(
      `Post from a throwaway in r/${subreddit} first. This important account's first comment there waits until a throwaway's comment has stayed up 24 hours.`
    )
  }
}

export async function refuseImportantFirstKind(
  account: Important,
  network: PhoneAppNetwork,
  kind: "photo" | "video",
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (account.importance !== "important") return
  const [been] = await db
    .select({ id: promoAppPosts.id })
    .from(promoAppPosts)
    .where(and(eq(promoAppPosts.accountId, account.id), eq(promoAppPosts.status, "posted"), eq(promoAppPosts.mediaKind, kind)))
    .limit(1)
  if (been) return
  const [tried] = await db
    .select({ id: promoAppPosts.id })
    .from(promoAppPosts)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoAppPosts.accountId))
    .where(
      and(
        eq(promoAppPosts.userId, account.userId),
        eq(promoAppPosts.platform, network),
        eq(promoAppPosts.mediaKind, kind),
        eq(promoAppPosts.status, "posted"),
        lte(promoAppPosts.postedAt, new Date(now.getTime() - THROWAWAY_FIRST_MS)),
        healthyThrowaway
      )
    )
    .limit(1)
  if (!tried) {
    throw new Error(
      `Post a ${kind} from a throwaway on ${NETWORK_NAMES[network]} first. This important account's first ${kind} waits until a throwaway's has stayed up 24 hours.`
    )
  }
}
