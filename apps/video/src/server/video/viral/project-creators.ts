import { and, desc, eq, sql } from "drizzle-orm"

import { isCreatorPlatform } from "@/lib/video/creators"
import { viralSays, YOUTUBE_QUOTA_MESSAGE, type ViralVideo } from "@/lib/video/viral"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  videoCreatorPosts,
  videoCreators,
  videoViralProjectCreators,
  videoViralProjects,
} from "@/server/video/schema"
import { getYoutubeApiKey } from "@/server/video/settings"
import {
  addCreatorByLink,
  CREATOR_ERRORS,
} from "@/server/video/creators/creators"
import { parseCreatorProfileLink } from "@/server/video/creators/profile-url"
import { listRecentUploads } from "@/server/video/creators/uploads"
import { recordUploads } from "@/server/video/creators/watch"
import { coverUrl } from "@/server/video/creators/covers"
import {
  dropUnlinkedCreators,
  requireOwnedViralProject,
} from "@/server/video/viral/projects"
import { creatorChannelId, scoreVideos } from "@/server/video/viral/project-view"
import { listYoutubeChannelUploads } from "@/server/video/viral/youtube"
import {
  recordYoutubeUnits,
  youtubeUnitsLeftToday,
} from "@/server/video/viral/youtube-units"

/**
 * Creators inside a Viral project: looking at one channel's uploads,
 * following them, and unfollowing.
 *
 * A creator is stored once per person and linked to each project, so the
 * watch timer checks them once whatever number of projects they are in.
 * Unfollowing in one project keeps them in the others; a creator left in no
 * project is unfollowed for good, and their saved breakdowns stay.
 */

/** How many of a channel's newest uploads the middle panel shows. */
const UPLOADS_SHOWN = 20

/** Reading a channel's uploads: the list is one unit, their numbers one more. */
const UPLOAD_UNITS = 2

/**
 * One channel's newest uploads, for the middle panel. A followed creator's
 * come from what the watch timer already saved and cost nothing; anyone else
 * is asked of YouTube, for 2 units of today's allowance.
 */
export async function loadChannelUploads(
  ownerId: string,
  projectId: string,
  channel: { platform: string; channelId: string; followedId: string | null; subscribers: number | null }
): Promise<ViralVideo[]> {
  const project = await requireOwnedViralProject(ownerId, projectId)

  if (channel.followedId) {
    const [creator] = await db
      .select()
      .from(videoCreators)
      .where(
        and(
          eq(videoCreators.id, channel.followedId),
          eq(videoCreators.ownerId, ownerId)
        )
      )
    if (!creator || !isCreatorPlatform(creator.platform)) {
      throw viralSays("That creator is no longer followed.")
    }
    const posts = await db
      .select()
      .from(videoCreatorPosts)
      .where(eq(videoCreatorPosts.creatorId, creator.id))
      .orderBy(
        desc(
          sql`coalesce(${videoCreatorPosts.postedAt}, ${videoCreatorPosts.firstSeenAt})`
        )
      )
      .limit(UPLOADS_SHOWN)
    const platform = creator.platform
    const covers = await Promise.all(posts.map(coverUrl))
    return scoreVideos(
      ownerId,
      posts.map((post, index) => ({
        platform,
        platformVideoId: post.platformVideoId,
        url: post.url,
        title: post.title ?? "Untitled",
        channelId: creatorChannelId(creator),
        channelName: creator.displayName ?? `@${creator.handle}`,
        subscribers: creator.followerCount,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        postedAt: post.postedAt?.toISOString() ?? null,
        durationSeconds: post.durationSeconds,
        thumbnailUrl: covers[index],
        keywords: [],
        isNew: false,
        topicMatch: null,
        source: "creator" as const,
        sample: false,
      }))
    )
  }

  if (project.isSample) {
    throw viralSays("This is a sample channel, so it has no uploads to show.")
  }
  if (channel.platform !== "youtube") {
    throw viralSays("Only YouTube channels can be looked at without following them.")
  }
  const apiKey = await getYoutubeApiKey()
  if (!apiKey) {
    throw viralSays("Looking at a channel needs the YouTube key. Paste one in Settings → YouTube first.")
  }
  if ((await youtubeUnitsLeftToday()) < UPLOAD_UNITS) {
    throw viralSays(YOUTUBE_QUOTA_MESSAGE)
  }
  const uploads = await listYoutubeChannelUploads(channel.channelId, UPLOADS_SHOWN, apiKey)
  await recordYoutubeUnits(UPLOAD_UNITS, "viral_channel")
  await db
    .update(videoViralProjects)
    .set({ unitsSpent: sql`${videoViralProjects.unitsSpent} + ${UPLOAD_UNITS}` })
    .where(eq(videoViralProjects.id, projectId))

  return scoreVideos(
    ownerId,
    uploads.map((upload) => ({
      platform: "youtube" as const,
      platformVideoId: upload.platformVideoId,
      url: upload.url,
      title: upload.title ?? "Untitled",
      channelId: channel.channelId,
      channelName: "",
      subscribers: channel.subscribers,
      views: upload.views,
      likes: upload.likes,
      comments: upload.comments,
      postedAt: upload.postedAt?.toISOString() ?? null,
      durationSeconds: upload.durationSeconds,
      thumbnailUrl: upload.thumbnailUrl,
      keywords: [],
      isNew: false,
      topicMatch: null,
      source: "creator" as const,
      sample: false,
    }))
  )
}

/**
 * Follows a YouTube channel found in the project's results, the same way as
 * pasting its address.
 */
export async function followChannel(
  ownerId: string,
  projectId: string,
  channelId: string
): Promise<void> {
  await followByLink(
    ownerId,
    projectId,
    `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`
  )
}

/**
 * Follows a creator from a profile link, on any of the three platforms.
 * Somebody already followed in another project is linked rather than added
 * twice. A new YouTube creator's newest uploads are read straight away, so
 * the grid has them before the watch timer's next turn.
 */
export async function followByLink(
  ownerId: string,
  projectId: string,
  link: string
): Promise<{ platform: string }> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample) {
    throw viralSays("This is a sample project. Make your own project to follow creators.")
  }
  let parsed: ReturnType<typeof parseCreatorProfileLink>
  try {
    parsed = parseCreatorProfileLink(link)
  } catch (error) {
    // Its sentences are written for a person ("Paste the creator's profile
    // link, not a link to one of their videos.").
    throw viralSays(error instanceof Error ? error.message : "Check the link.")
  }
  let creatorId =
    (parsed.channelId
      ? await findFollowed(ownerId, { platformChannelId: parsed.channelId })
      : null) ?? (await findFollowed(ownerId, { platform: parsed.platform, handle: parsed.handle }))
  const isNew = !creatorId
  if (!creatorId) {
    try {
      creatorId = (await addCreatorByLink(ownerId, link, "viral")).id
    } catch (error) {
      if (error instanceof Error && error.message === CREATOR_ERRORS.alreadyFollowed) {
        creatorId = await findFollowed(ownerId, {
          platform: parsed.platform,
          handle: parsed.handle,
        })
      }
      if (!creatorId) throw error
    }
  }
  await linkCreator(projectId, creatorId)
  if (isNew && parsed.platform === "youtube") await readFirstUploads(creatorId)
  return { platform: parsed.platform }
}

/** Takes a creator out of this project; out of every project means unfollowed. */
export async function unfollowInProject(
  ownerId: string,
  projectId: string,
  creatorId: string
): Promise<void> {
  await requireOwnedViralProject(ownerId, projectId)
  await db
    .delete(videoViralProjectCreators)
    .where(
      and(
        eq(videoViralProjectCreators.projectId, projectId),
        eq(videoViralProjectCreators.creatorId, creatorId)
      )
    )
  await dropUnlinkedCreators(ownerId, [creatorId])
}

async function linkCreator(projectId: string, creatorId: string) {
  await db
    .insert(videoViralProjectCreators)
    .values({ projectId, creatorId, createdAt: now() })
    .onConflictDoNothing()
}

async function findFollowed(
  ownerId: string,
  match: { platformChannelId: string } | { platform: string; handle: string }
): Promise<string | null> {
  const [row] = await db
    .select({ id: videoCreators.id })
    .from(videoCreators)
    .where(
      "platformChannelId" in match
        ? and(
            eq(videoCreators.ownerId, ownerId),
            eq(videoCreators.platform, "youtube"),
            eq(videoCreators.platformChannelId, match.platformChannelId)
          )
        : and(
            eq(videoCreators.ownerId, ownerId),
            eq(videoCreators.platform, match.platform),
            sql`lower(${videoCreators.handle}) = lower(${match.handle})`
          )
    )
    .limit(1)
  return row?.id ?? null
}

/**
 * A newly followed YouTube creator's ten newest uploads, read now rather
 * than at the watch timer's next turn. Best effort: following them stands
 * whether or not this works.
 */
async function readFirstUploads(creatorId: string) {
  try {
    const [creator] = await db
      .select()
      .from(videoCreators)
      .where(eq(videoCreators.id, creatorId))
    if (!creator || creator.platform !== "youtube") return
    const apiKey = await getYoutubeApiKey()
    if (!apiKey) return
    const found = await listRecentUploads({
      platform: "youtube",
      handle: creator.handle,
      channelId: creator.platformChannelId,
      howMany: 10,
      youtubeApiKey: apiKey,
    })
    await recordYoutubeUnits(UPLOAD_UNITS, "creator_follow")
    await recordUploads(creator, found.uploads)
    await db
      .update(videoCreators)
      .set({ lastCheckedAt: now() })
      .where(eq(videoCreators.id, creatorId))
  } catch (error) {
    console.error("A new creator's first uploads could not be read", error)
  }
}
