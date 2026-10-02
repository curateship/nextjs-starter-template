import { and, asc, desc, eq, exists, lt, sql, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

import type { MarketMatchKind } from "@/lib/trade/social/coin-matcher"
import {
  SOCIAL_MARKETS_SHOWN,
  SOCIAL_POSTS_PAGE,
  type SocialMarketRow,
} from "@/lib/trade/social/dashboard"
import type {
  SocialFeed,
  SocialFeedCreator,
  SocialFeedPage,
  SocialFeedPostRow,
  SocialFeedScope,
  SocialFeedView,
} from "@/lib/trade/social/feed"
import { db, type CustomShellDb } from "@/server/db"
import { loadSocialFolders } from "@/server/trade/social-folders"
import { readCoinsFor } from "@/server/trade/social-posts"
import {
  tradeSocialCreators,
  tradeSocialFolderCreators,
  tradeSocialFolders,
  tradeSocialPostCoins,
  tradeSocialPosts,
} from "@/server/trade/schema"

/**
 * The social feed: one member's posts across every creator they track.
 *
 * Everything else in Social reads one creator at a time; this file is the one
 * place that reads across them, newest first, standing on the
 * `trade_social_posts_feed_idx` index. A scope narrows it to one folder's
 * creators, one creator, or the posts naming one coin.
 *
 * **Every query is filtered by the member's own id** in the same `where` as
 * the rows it reads. A folder or creator id belonging to somebody else is not
 * an error; it reads nothing, because nothing of theirs passes the filter.
 */

/**
 * The posts a scope covers, before the coin narrows them.
 *
 * A creator wins over a folder when both are somehow sent, matching the panel,
 * where clicking a creator replaces a folder choice rather than stacking on it.
 */
function scopePostConditions(userId: string, scope: SocialFeedScope): SQL[] {
  const conditions: SQL[] = [eq(tradeSocialPosts.userId, userId)]
  if (scope.creatorId) {
    conditions.push(eq(tradeSocialPosts.creatorId, scope.creatorId))
  } else if (scope.folderId) {
    conditions.push(inFolder(userId, scope.folderId, tradeSocialPosts.creatorId))
  }
  return conditions
}

/** The creator sits in this member's folder. */
function inFolder(
  userId: string,
  folderId: string,
  creatorColumn: PgColumn
): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(tradeSocialFolderCreators)
      .innerJoin(
        tradeSocialFolders,
        eq(tradeSocialFolders.id, tradeSocialFolderCreators.folderId)
      )
      .where(
        and(
          eq(tradeSocialFolders.userId, userId),
          eq(tradeSocialFolders.id, folderId),
          eq(tradeSocialFolderCreators.creatorId, creatorColumn)
        )
      )
  ) as SQL
}

/** The post names the coin, read out of the words. */
function namesCoin(userId: string, coin: string): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(tradeSocialPostCoins)
      .where(
        and(
          eq(tradeSocialPostCoins.userId, userId),
          eq(tradeSocialPostCoins.postId, tradeSocialPosts.id),
          eq(tradeSocialPostCoins.coin, coin)
        )
      )
  ) as SQL
}

const CREATOR_COLUMNS = {
  creatorId: tradeSocialCreators.id,
  handle: tradeSocialCreators.handle,
  displayName: tradeSocialCreators.displayName,
  picture: tradeSocialCreators.picture,
}

/** A page of the feed, newest first, with whose post each one is. */
export async function loadSocialFeedPage(
  userId: string,
  scope: SocialFeedScope,
  before: number | null,
  database: CustomShellDb = db
): Promise<SocialFeedPage> {
  const rows = await database
    .select({
      id: tradeSocialPosts.id,
      postedAt: tradeSocialPosts.postedAt,
      text: tradeSocialPosts.text,
      url: tradeSocialPosts.url,
      seen: tradeSocialPosts.seen,
      ...CREATOR_COLUMNS,
    })
    .from(tradeSocialPosts)
    .innerJoin(
      tradeSocialCreators,
      eq(tradeSocialCreators.id, tradeSocialPosts.creatorId)
    )
    .where(
      and(
        ...scopePostConditions(userId, scope),
        before === null
          ? undefined
          : lt(tradeSocialPosts.postedAt, new Date(before)),
        // Narrowed by the database, not by sieving the page already on
        // screen: the whole list belongs to one answer.
        scope.coin === null ? undefined : namesCoin(userId, scope.coin)
      )
    )
    .orderBy(desc(tradeSocialPosts.postedAt), desc(tradeSocialPosts.id))
    // One more than a page, which is how the list knows there are older ones
    // without a second counting query.
    .limit(SOCIAL_POSTS_PAGE + 1)

  const page = rows.slice(0, SOCIAL_POSTS_PAGE)
  const coins = await readCoinsFor(
    userId,
    page.map((row) => row.id)
  )
  const posts: SocialFeedPostRow[] = page.map((row) => ({
    id: row.id,
    postedAt: row.postedAt.getTime(),
    text: row.text,
    url: row.url,
    seen: row.seen,
    coins: coins.get(row.id) ?? [],
    creator: {
      id: row.creatorId,
      handle: row.handle,
      displayName: row.displayName,
      picture: row.picture,
    },
  }))
  return { posts, more: rows.length > SOCIAL_POSTS_PAGE }
}

/**
 * The coins panel's rows for one scope: every coin the scope's posts name and
 * how many name it. Counted without the coin narrowing on purpose, so the
 * panel keeps listing every coin there is to pick from.
 */
async function readFeedCoins(
  userId: string,
  scope: SocialFeedScope,
  database: CustomShellDb
): Promise<SocialMarketRow[]> {
  const conditions: SQL[] = [eq(tradeSocialPostCoins.userId, userId)]
  if (scope.creatorId) {
    conditions.push(eq(tradeSocialPostCoins.creatorId, scope.creatorId))
  } else if (scope.folderId) {
    conditions.push(
      inFolder(userId, scope.folderId, tradeSocialPostCoins.creatorId)
    )
  }
  const rows = await database
    .select({
      market: tradeSocialPostCoins.coin,
      kind: sql<MarketMatchKind>`max(${tradeSocialPostCoins.kind})`,
      marketKey: sql<string>`max(${tradeSocialPostCoins.marketKey})`,
      posts: sql<number>`count(*)::int`,
    })
    .from(tradeSocialPostCoins)
    .where(and(...conditions))
    .groupBy(tradeSocialPostCoins.coin)
    .orderBy(sql`count(*) desc`, tradeSocialPostCoins.coin)
    .limit(SOCIAL_MARKETS_SHOWN)
  return rows.map((row) => ({
    market: row.market,
    kind: row.kind,
    marketKey: row.marketKey,
    posts: row.posts,
  }))
}

/** How many posts the scope holds in all, before the coin narrowed it. */
async function countFeedPosts(
  userId: string,
  scope: SocialFeedScope,
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ held: sql<number>`count(*)::int` })
    .from(tradeSocialPosts)
    .where(and(...scopePostConditions(userId, scope)))
  return row?.held ?? 0
}

/** One scope's whole answer: its newest page, its count and its coins. */
export async function loadSocialFeedView(
  userId: string,
  scope: SocialFeedScope,
  database: CustomShellDb = db
): Promise<SocialFeedView> {
  const [page, held, coins] = await Promise.all([
    loadSocialFeedPage(userId, scope, null, database),
    countFeedPosts(userId, scope, database),
    readFeedCoins(userId, scope, database),
  ])
  return { posts: page.posts, more: page.more, held, coins }
}

/** Every creator this member tracks, A to Z by handle, for the left panel. */
async function listFeedCreators(
  userId: string,
  database: CustomShellDb
): Promise<SocialFeedCreator[]> {
  const rows = await database
    .select(CREATOR_COLUMNS)
    .from(tradeSocialCreators)
    .where(eq(tradeSocialCreators.userId, userId))
    .orderBy(asc(sql`lower(${tradeSocialCreators.handle})`))
  return rows.map((row) => ({
    id: row.creatorId,
    handle: row.handle,
    displayName: row.displayName,
    picture: row.picture,
  }))
}

/** The whole screen in one trip: folders, creators, and Everyone's view. */
export async function loadSocialFeed(
  userId: string,
  database: CustomShellDb = db
): Promise<SocialFeed> {
  const readAt = Date.now()
  const everyone: SocialFeedScope = {
    folderId: null,
    creatorId: null,
    coin: null,
  }
  const [folders, creators, view] = await Promise.all([
    loadSocialFolders(userId, database),
    listFeedCreators(userId, database),
    loadSocialFeedView(userId, everyone, database),
  ])
  return { ...view, folders, creators, readAt }
}
