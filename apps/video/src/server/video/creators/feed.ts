import { and, count, desc, eq, exists, lt, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import {
  videoCreatorFolderCreators,
  videoCreatorFolders,
  videoCreatorPosts,
  videoCreators,
  videoViralVideos,
} from "@/server/video/schema"
import {
  CREATOR_FEED_PAGE,
  isCreatorPlatform,
  type CreatorFeedScope,
  type CreatorFeedView,
  type CreatorPost,
  type SavedVideoStatus,
} from "@/lib/video/creators"

/**
 * The middle panel: every video the creators in scope have posted.
 *
 * Whether a video has been broken down is never stored on the post. It is read
 * by joining the saved-videos table on owner, platform and video id — the same
 * three columns both tables are unique on — so a video saved from the Viral
 * page shows as saved here too, with nothing to keep in step.
 *
 * Every query names the owner, so a folder or creator id from somewhere else
 * finds nothing rather than somebody else's posts.
 */

/**
 * What the feed sorts and pages by. Not every platform says when something was
 * posted, so a post without a date falls back to when it was first seen rather
 * than sorting as if it were from 1970.
 */
const postedOrSeen = sql<Date>`coalesce(${videoCreatorPosts.postedAt}, ${videoCreatorPosts.firstSeenAt})`

/** A creator beats a folder, the way the chips in the header read. */
function scopeWhere(ownerId: string, scope: CreatorFeedScope): SQL | undefined {
  const mine = eq(videoCreatorPosts.ownerId, ownerId)

  if (scope.creatorId) {
    return and(mine, eq(videoCreatorPosts.creatorId, scope.creatorId))
  }
  if (scope.folderId) {
    return and(
      mine,
      exists(
        db
          .select({ one: sql`1` })
          .from(videoCreatorFolderCreators)
          .innerJoin(
            videoCreatorFolders,
            eq(videoCreatorFolders.id, videoCreatorFolderCreators.folderId)
          )
          .where(
            and(
              eq(videoCreatorFolderCreators.folderId, scope.folderId),
              eq(videoCreatorFolderCreators.creatorId, videoCreatorPosts.creatorId),
              // The folder has to be this person's, or somebody else's folder
              // id would narrow their feed to creators they cannot see.
              eq(videoCreatorFolders.ownerId, ownerId)
            )
          )
      )
    )
  }
  return mine
}

export async function loadFeedPage(
  ownerId: string,
  scope: CreatorFeedScope,
  before?: string
): Promise<{ posts: CreatorPost[]; more: boolean }> {
  const cursor = before ? new Date(before) : null
  const where =
    cursor && !Number.isNaN(cursor.getTime())
      ? and(scopeWhere(ownerId, scope), lt(postedOrSeen, cursor))
      : scopeWhere(ownerId, scope)

  const rows = await db
    .select({
      post: videoCreatorPosts,
      creatorHandle: videoCreators.handle,
      creatorDisplayName: videoCreators.displayName,
      savedId: videoViralVideos.id,
      savedStatus: videoViralVideos.status,
    })
    .from(videoCreatorPosts)
    .innerJoin(videoCreators, eq(videoCreators.id, videoCreatorPosts.creatorId))
    .leftJoin(
      videoViralVideos,
      and(
        eq(videoViralVideos.ownerId, videoCreatorPosts.ownerId),
        eq(videoViralVideos.platform, videoCreatorPosts.platform),
        eq(videoViralVideos.platformVideoId, videoCreatorPosts.platformVideoId)
      )
    )
    .where(where)
    .orderBy(desc(postedOrSeen))
    // One more than a page, which is how the button below knows there are
    // older ones without counting the whole lot.
    .limit(CREATOR_FEED_PAGE + 1)

  const page = rows.slice(0, CREATOR_FEED_PAGE)
  return {
    posts: page.flatMap((row) => toPost(row)),
    more: rows.length > CREATOR_FEED_PAGE,
  }
}

type FeedRow = {
  post: typeof videoCreatorPosts.$inferSelect
  creatorHandle: string
  creatorDisplayName: string | null
  savedId: string | null
  savedStatus: string | null
}

function toPost(row: FeedRow): CreatorPost[] {
  if (!isCreatorPlatform(row.post.platform)) return []
  return [
    {
      id: row.post.id,
      creatorId: row.post.creatorId,
      creatorHandle: row.creatorHandle,
      creatorDisplayName: row.creatorDisplayName,
      platform: row.post.platform,
      platformVideoId: row.post.platformVideoId,
      url: row.post.url,
      title: row.post.title,
      thumbnailUrl: row.post.thumbnailUrl,
      durationSeconds: row.post.durationSeconds,
      views: row.post.views,
      likes: row.post.likes,
      comments: row.post.comments,
      postedAt: row.post.postedAt?.toISOString() ?? null,
      firstSeenAt: row.post.firstSeenAt.toISOString(),
      savedStatus: (row.savedStatus as SavedVideoStatus | null) ?? null,
      savedVideoId: row.savedId,
    },
  ]
}

/** The page plus how many the scope holds in all, which the header shows. */
export async function loadFeedView(
  ownerId: string,
  scope: CreatorFeedScope
): Promise<CreatorFeedView> {
  const [page, [counted]] = await Promise.all([
    loadFeedPage(ownerId, scope),
    db
      .select({ held: count() })
      .from(videoCreatorPosts)
      .where(scopeWhere(ownerId, scope)),
  ])
  return { ...page, held: counted?.held ?? 0 }
}
