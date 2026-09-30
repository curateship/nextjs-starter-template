import { randomUUID } from "node:crypto"
import { and, desc, eq, lt, sql } from "drizzle-orm"

import type { ParsedSocialPost } from "@/lib/trade/social/x-profile"
import {
  SOCIAL_MARKETS_SHOWN,
  SOCIAL_POSTS_PAGE,
  type SocialDashboard,
  type SocialMarketRow,
  type SocialPostRow,
  type SocialPostsPage,
} from "@/lib/trade/social/dashboard"
import { db } from "@/server/db"
import {
  findSocialCreator,
  saveSocialCreatorDetails,
} from "@/server/trade/social-creators"
import {
  PROFILE_SOCIAL_READER,
  readSocialPosts,
} from "@/server/trade/social-readers"
import { tradeSocialPosts, tradeSocialReads } from "@/server/trade/schema"

/**
 * The posts held for one creator: reading them back, and taking an import.
 *
 * **Held once per member.** Two members tracking @cryptosam each hold their
 * own copy, so one member's import never changes what another sees and
 * deleting an account takes only that account's copy with it.
 *
 * Every query is filtered by the member's own id in the same `where` as the
 * creator it names, so a creator id guessed from somewhere else reads nothing.
 */

export class SocialPostsError extends Error {}

const POST_COLUMNS = {
  id: tradeSocialPosts.id,
  postedAt: tradeSocialPosts.postedAt,
  text: tradeSocialPosts.text,
  url: tradeSocialPosts.url,
  seen: tradeSocialPosts.seen,
  markets: tradeSocialPosts.markets,
}

function toPost(row: {
  id: string
  postedAt: Date
  text: string
  url: string | null
  seen: number | null
  markets: string[] | null
}): SocialPostRow {
  return {
    id: row.id,
    postedAt: row.postedAt.getTime(),
    text: row.text,
    url: row.url,
    seen: row.seen,
    markets: row.markets ?? [],
  }
}

async function readPostPage(
  userId: string,
  creatorId: string,
  before: number | null,
  market: string | null
): Promise<SocialPostsPage> {
  const rows = await db
    .select(POST_COLUMNS)
    .from(tradeSocialPosts)
    .where(
      and(
        eq(tradeSocialPosts.userId, userId),
        eq(tradeSocialPosts.creatorId, creatorId),
        before === null
          ? undefined
          : lt(tradeSocialPosts.postedAt, new Date(before)),
        // Narrowed by the database, not by sieving the page already on
        // screen: clicking a coin with 41 posts must show all 41, not the
        // handful of them that happen to be in the newest 50.
        market === null
          ? undefined
          : sql`${tradeSocialPosts.markets} @> ${JSON.stringify([market])}::jsonb`
      )
    )
    .orderBy(desc(tradeSocialPosts.postedAt), desc(tradeSocialPosts.id))
    // One more than a page, which is how the list knows there are older ones
    // without a second counting query.
    .limit(SOCIAL_POSTS_PAGE + 1)

  const more = rows.length > SOCIAL_POSTS_PAGE
  return {
    posts: rows.slice(0, SOCIAL_POSTS_PAGE).map(toPost),
    more,
  }
}

/** A page of this creator's posts, optionally only the ones naming one coin. */
export async function loadSocialPostsPage(
  userId: string,
  creatorId: string,
  before: number | null,
  market: string | null
): Promise<SocialPostsPage> {
  return readPostPage(userId, creatorId, before, market)
}

/**
 * The whole dashboard in one trip: the creator, the figures, the newest page
 * of posts and the markets panel.
 */
export async function loadSocialDashboard(
  userId: string,
  handle: string
): Promise<SocialDashboard> {
  const creator = await findSocialCreator(userId, handle)
  if (!creator) throw new SocialPostsError("SOCIAL_CREATOR_NOT_TRACKED")

  const readAt = Date.now()
  const [page, postsHeld, markets] = await Promise.all([
    readPostPage(userId, creator.id, null, null),
    countPostsHeld(userId, creator.id),
    readMarkets(userId, creator.id),
  ])

  return {
    creator,
    postsHeld,
    posts: page.posts,
    more: page.more,
    markets,
    readAt,
  }
}

/** How many posts are stored for this creator. */
async function countPostsHeld(
  userId: string,
  creatorId: string
): Promise<number> {
  const [row] = await db
    .select({ held: sql<number>`count(*)::int` })
    .from(tradeSocialPosts)
    .where(
      and(
        eq(tradeSocialPosts.userId, userId),
        eq(tradeSocialPosts.creatorId, creatorId)
      )
    )
  return row?.held ?? 0
}

/**
 * The markets panel's rows: every coin this creator names, and how many of
 * their posts name it, counted over everything held rather than over the page
 * on screen.
 *
 * X tags the coins itself in the page it serves, so this is its tagging
 * counted up, not a guess made from the words.
 */
async function readMarkets(
  userId: string,
  creatorId: string
): Promise<SocialMarketRow[]> {
  const rows = await db
    .select({
      market: sql<string>`market`,
      posts: sql<number>`count(*)::int`,
    })
    .from(
      sql`(select jsonb_array_elements_text(${tradeSocialPosts.markets}) as market
           from ${tradeSocialPosts}
           where ${and(
             eq(tradeSocialPosts.userId, userId),
             eq(tradeSocialPosts.creatorId, creatorId)
           )}) as named`
    )
    .groupBy(sql`market`)
    .orderBy(sql`count(*) desc`, sql`market asc`)
    .limit(SOCIAL_MARKETS_SHOWN)

  return rows.map((row) => ({ market: row.market, posts: row.posts }))
}

/**
 * How long the automatic read leaves a creator alone after reading them.
 *
 * Per process, like the rationing hold list, and reset by a restart. It is
 * politeness rather than a promise: the point is that flicking between
 * creators does not fire a request each time.
 */
const AUTO_READ_EVERY_MS = 5 * 60_000

const lastRead = new Map<string, number>()

/**
 * How many creators the map remembers before it drops the ones whose wait is
 * over. Keyed by creator and every member has their own, so left alone this
 * grows with every creator the process has ever served.
 */
const MAX_REMEMBERED = 5_000

function readerDue(creatorId: string): boolean {
  const now = Date.now()
  const last = lastRead.get(creatorId)
  if (last !== undefined && now - last < AUTO_READ_EVERY_MS) return false

  if (lastRead.size >= MAX_REMEMBERED) {
    for (const [id, at] of lastRead) {
      if (now - at >= AUTO_READ_EVERY_MS) lastRead.delete(id)
    }
  }
  lastRead.set(creatorId, now)
  return true
}

/**
 * Read this creator's public X profile and write down what it said.
 *
 * Called when their dashboard opens. **It never fails the screen.** The page
 * has already answered from what the app knows; this catches up behind it, and
 * a read that is refused, slow or unrecognisable leaves everything exactly as
 * it was. The answer says whether anything changed, so the screen only redraws
 * when it did.
 */
export async function refreshSocialCreator(
  userId: string,
  handle: string,
  asked: boolean
): Promise<{ changed: boolean; added: number }> {
  const creator = await findSocialCreator(userId, handle)
  if (!creator) throw new SocialPostsError("SOCIAL_CREATOR_NOT_TRACKED")

  // Opening the same creator five times in a minute must not be five requests
  // to somebody else's server. The button is a person asking and always reads;
  // the read that happens on its own waits its turn.
  if (!asked && !readerDue(creator.id)) return { changed: false, added: 0 }

  const read = await readSocialPosts(PROFILE_SOCIAL_READER, {
    handle: creator.handle,
  })
  if (!read.ok) return { changed: false, added: 0 }

  const details = await saveSocialCreatorDetails(
    userId,
    creator.id,
    read.creator
  )

  let added = 0
  let written = false
  if (read.posts.length > 0) {
    const held = new Set(
      (
        await db
          .select({ sourceId: tradeSocialPosts.sourceId })
          .from(tradeSocialPosts)
          .where(
            and(
              eq(tradeSocialPosts.userId, userId),
              eq(tradeSocialPosts.creatorId, creator.id)
            )
          )
      ).map((row) => row.sourceId)
    )
    added = read.posts.filter((post) => !held.has(post.sourceId)).length
    await storeSocialPosts(userId, creator.id, read.posts)
    // Every post that came back is written, not only the new ones: a post
    // already held can have gained views, or coins Trade did not used to read.
    // So anything written at all is a reason to redraw, and counting only the
    // new ones left the screen showing the version before the write.
    written = true
    // Only a read that brought something new is worth a line in the record.
    if (added > 0) {
      await db.insert(tradeSocialReads).values({
        id: randomUUID(),
        userId,
        creatorId: creator.id,
        reader: PROFILE_SOCIAL_READER,
        posts: added,
      })
    }
  }

  return { changed: details || written, added }
}

/** How many rows one insert carries, so a big read is not one giant statement. */
const WRITE_BATCH = 200

/**
 * Store posts for one creator.
 *
 * **A post already held is updated, not added again.** Every post carries the
 * id it had at X, so syncing a profile that still shows the same five posts
 * leaves the count exactly where it was. Exported so the write path a sync
 * uses is the one the tests drive.
 */
export async function storeSocialPosts(
  userId: string,
  creatorId: string,
  posts: ParsedSocialPost[]
) {
  for (let start = 0; start < posts.length; start += WRITE_BATCH) {
    const batch = posts.slice(start, start + WRITE_BATCH)
    await db
      .insert(tradeSocialPosts)
      .values(
        batch.map((post) => ({
          id: randomUUID(),
          userId,
          creatorId,
          sourceId: post.sourceId,
          postedAt: new Date(post.postedAt),
          text: post.text,
          url: post.url,
          seen: post.seen,
          likes: post.likes,
          replies: post.replies,
          reposts: post.reposts,
          replyToId: post.replyToId,
          markets: post.markets,
        }))
      )
      .onConflictDoUpdate({
        target: [tradeSocialPosts.creatorId, tradeSocialPosts.sourceId],
        set: {
          postedAt: sql`excluded.posted_at`,
          text: sql`excluded.text`,
          url: sql`excluded.url`,
          seen: sql`excluded.seen`,
          likes: sql`excluded.likes`,
          replies: sql`excluded.replies`,
          reposts: sql`excluded.reposts`,
          replyToId: sql`excluded.reply_to_id`,
          markets: sql`excluded.markets`,
          updatedAt: new Date(),
        },
      })
  }
}
