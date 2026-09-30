import { randomUUID } from "node:crypto"
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  readSocialHandle,
  socialAddressToCheck,
  SOCIAL_PLATFORM,
  type SocialPlatform,
} from "@/lib/trade/social/creator"
import type {
  SocialCreatorsQuery,
  SortDirection,
} from "@/lib/trade/social/creators-query"
import type {
  ParsedSocialCreator,
  SocialLink,
} from "@/lib/trade/social/x-profile"
import {
  SOCIAL_QUIET_DAYS,
  type SocialCreator,
} from "@/lib/trade/social/dashboard"
import { DAY_MS } from "@/lib/format/format-time"
import { resolvePublicWebhookTarget } from "@/server/automations/net-guard"
import { db } from "@/server/db"
import { tradeSocialCreators, tradeSocialPosts } from "@/server/trade/schema"

/**
 * The tracked accounts, one member's at a time.
 *
 * **Every query here is filtered by the member's own id**, in the same `where`
 * as the row it is looking for. Nothing is read first and checked for
 * ownership afterwards, because that leaves a window where the row is already
 * in memory.
 */

/** A member cannot track an unbounded number of accounts. */
const MAX_CREATORS = 200

export class SocialCreatorError extends Error {}

function toCreator(row: {
  id: string
  platform: SocialPlatform
  handle: string
  displayName: string | null
  picture: string | null
  followers: number | null
  followersAt: Date | null
  links: SocialLink[]
  createdAt: Date
}): SocialCreator {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    displayName: row.displayName,
    picture: row.picture,
    followers: row.followers,
    followersAt: row.followersAt ? row.followersAt.getTime() : null,
    links: row.links ?? [],
    addedAt: row.createdAt.getTime(),
  }
}

const CREATOR_COLUMNS = {
  id: tradeSocialCreators.id,
  platform: tradeSocialCreators.platform,
  handle: tradeSocialCreators.handle,
  displayName: tradeSocialCreators.displayName,
  picture: tradeSocialCreators.picture,
  followers: tradeSocialCreators.followers,
  followersAt: tradeSocialCreators.followersAt,
  links: tradeSocialCreators.links,
  createdAt: tradeSocialCreators.createdAt,
}

/**
 * What a read said about the account itself: its follower count, its display
 * name, its picture.
 *
 * **A field the reader stayed quiet about is left alone.** Pasting a block of
 * posts with no account details must not wipe a follower count an earlier
 * paste supplied. `followers_at` moves only when the count does, so the screen
 * can say how old the number is.
 */
export async function saveSocialCreatorDetails(
  userId: string,
  creatorId: string,
  details: ParsedSocialCreator
): Promise<boolean> {
  const patch: Partial<typeof tradeSocialCreators.$inferInsert> = {}
  if (details.followers !== null) {
    patch.followers = details.followers
    patch.followersAt = new Date()
  }
  if (details.displayName !== null) patch.displayName = details.displayName
  if (details.picture !== null) patch.picture = details.picture
  if (details.links !== null) patch.links = details.links
  if (Object.keys(patch).length === 0) return false

  await db
    .update(tradeSocialCreators)
    .set(patch)
    .where(
      and(
        eq(tradeSocialCreators.userId, userId),
        eq(tradeSocialCreators.id, creatorId)
      )
    )
  return true
}

/** One creator by handle, ignoring case. Null when this member has no such row. */
export async function findSocialCreator(
  userId: string,
  handle: string
): Promise<SocialCreator | null> {
  const [row] = await db
    .select(CREATOR_COLUMNS)
    .from(tradeSocialCreators)
    .where(
      and(
        eq(tradeSocialCreators.userId, userId),
        eq(tradeSocialCreators.platform, SOCIAL_PLATFORM),
        sql`lower(${tradeSocialCreators.handle}) = lower(${handle})`
      )
    )
    .limit(1)
  return row ? toCreator(row) : null
}

/**
 * Track an X account, from an address or a bare handle.
 *
 * A pasted address goes past `resolvePublicWebhookTarget` before anything
 * else, so a link pointing at this server, a private network or plain
 * `localhost` is refused here rather than being fetched later by whatever
 * reader is plugged in at the time.
 */
export async function addSocialCreator(
  userId: string,
  input: string
): Promise<SocialCreator> {
  const address = socialAddressToCheck(input)
  if (address !== null) {
    try {
      await resolvePublicWebhookTarget(address)
    } catch {
      throw new SocialCreatorError("SOCIAL_HANDLE_PRIVATE_ADDRESS")
    }
  }

  const handle = readSocialHandle(input)
  const existing = await findSocialCreator(userId, handle)
  if (existing) throw new SocialCreatorError("SOCIAL_CREATOR_EXISTS")

  const [{ held }] = await db
    .select({ held: sql<number>`count(*)::int` })
    .from(tradeSocialCreators)
    .where(eq(tradeSocialCreators.userId, userId))
  if (held >= MAX_CREATORS) {
    throw new SocialCreatorError("SOCIAL_CREATORS_FULL")
  }

  const id = randomUUID()
  const [row] = await db
    .insert(tradeSocialCreators)
    .values({
      id,
      userId,
      platform: SOCIAL_PLATFORM,
      handle,
      displayName: null,
      picture: null,
    })
    // Two windows submitted at once race to the same unique index. The loser
    // takes the winner's row rather than showing a database error.
    .onConflictDoNothing()
    .returning(CREATOR_COLUMNS)

  if (row) return toCreator(row)
  const settled = await findSocialCreator(userId, handle)
  if (!settled) throw new SocialCreatorError("SOCIAL_CREATOR_NOT_SAVED")
  return settled
}

/**
 * One row of the creators list: who they are, how much is held for them, and
 * when the newest post held was written.
 */
export type SocialCreatorRow = SocialCreator & {
  postsHeld: number
  lastPostAt: number | null
}

export type SocialCreatorsList = {
  rows: SocialCreatorRow[]
  /** Every creator this member tracks, before the search and filters. */
  total: number
  /** The server's own clock, so "2 days ago" is worked out against it. */
  readAt: number
}

/**
 * `%` and `_` are wildcards in `ILIKE`, so a search for "50%" would otherwise
 * match everything. The value itself is a bound parameter, never spliced into
 * the statement.
 */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

/**
 * The creators list, searched, filtered and sorted by the database.
 *
 * **The search runs here, not in the browser**, because it reads the text of
 * every post held: searching "sol" has to find a creator who talks about SOL
 * under a handle that never says so, and the posts are not on the screen to
 * search. It is a plain `ILIKE` today. Task 29 builds the real saved search
 * and replaces it, so nothing here is worth indexing twice.
 *
 * `total` is counted without the search and filters, so the footer can say
 * "4 of 30" rather than making the reader wonder where the others went.
 */
export async function listSocialCreatorRows(
  userId: string,
  query: SocialCreatorsQuery
): Promise<SocialCreatorsList> {
  const readAt = Date.now()

  // Held counts and the newest post, one row per creator. A creator with no
  // posts is missing from this and picked up by the left join as a null.
  const held = db
    .select({
      creatorId: tradeSocialPosts.creatorId,
      posts: sql<number>`count(*)::int`.as("posts"),
      lastAt: sql<Date | null>`max(${tradeSocialPosts.postedAt})`.as("last_at"),
    })
    .from(tradeSocialPosts)
    .where(eq(tradeSocialPosts.userId, userId))
    .groupBy(tradeSocialPosts.creatorId)
    .as("held")

  const postsHeld = sql<number>`coalesce(${held.posts}, 0)`
  const conditions = [eq(tradeSocialCreators.userId, userId)]

  const text = query.q.trim()
  if (text) {
    const pattern = likePattern(text)
    // A separate name for the same table: `held` above is already using it,
    // and the query builder qualifies both sides of the correlation itself.
    const match = alias(tradeSocialPosts, "search_posts")
    const inPosts = exists(
      db
        .select({ one: sql`1` })
        .from(match)
        .where(
          and(
            eq(match.userId, userId),
            eq(match.creatorId, tradeSocialCreators.id),
            ilike(match.text, pattern)
          )
        )
    )
    conditions.push(
      or(
        ilike(tradeSocialCreators.handle, pattern),
        ilike(tradeSocialCreators.displayName, pattern),
        inPosts
      )!
    )
  }

  if (query.posts === "under50") conditions.push(sql`${postsHeld} < 50`)
  if (query.posts === "50to500")
    conditions.push(sql`${postsHeld} between 50 and 500`)
  if (query.posts === "over500") conditions.push(sql`${postsHeld} > 500`)

  const week = new Date(readAt - 7 * DAY_MS)
  const month = new Date(readAt - SOCIAL_QUIET_DAYS * DAY_MS)
  if (query.last === "week") conditions.push(gte(held.lastAt, week))
  if (query.last === "month") conditions.push(gte(held.lastAt, month))
  // "Gone quiet" needs a last post, the same rule the creator's own "Quiet
  // since" tile follows. A creator nothing has ever been pasted for has not
  // gone quiet; nobody has imported anything for them yet, so `lastAt` is null
  // and the comparison drops them.
  if (query.last === "older") conditions.push(lt(held.lastAt, month))

  // A column nobody has a number for sorts last whichever way the arrow
  // points, rather than filling the top of the list with dashes.
  const byHandle = asc(sql`lower(${tradeSocialCreators.handle})`)
  const nullsLast = (column: SQL, dir: SortDirection) =>
    dir === "asc"
      ? sql`${column} asc nulls last`
      : sql`${column} desc nulls last`
  const direction = query.dir === "asc" ? asc : desc
  const order: SQL[] =
    query.sort === "handle"
      ? [direction(sql`lower(${tradeSocialCreators.handle})`) as SQL]
      : query.sort === "posts"
        ? [direction(postsHeld) as SQL, byHandle as SQL]
        : query.sort === "followers"
          ? [
              nullsLast(sql`${tradeSocialCreators.followers}`, query.dir),
              byHandle as SQL,
            ]
          : [nullsLast(sql`${held.lastAt}`, query.dir), byHandle as SQL]

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        ...CREATOR_COLUMNS,
        postsHeld,
        lastAt: held.lastAt,
      })
      .from(tradeSocialCreators)
      .leftJoin(held, eq(held.creatorId, tradeSocialCreators.id))
      .where(and(...conditions))
      .orderBy(...order)
      .limit(MAX_CREATORS),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(tradeSocialCreators)
      .where(eq(tradeSocialCreators.userId, userId)),
  ])

  return {
    rows: rows.map((row) => ({
      ...toCreator(row),
      postsHeld: row.postsHeld,
      lastPostAt: row.lastAt ? new Date(row.lastAt).getTime() : null,
    })),
    total: counted?.total ?? 0,
    readAt,
  }
}
