import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { videoCreatorPosts, videoCreators } from "@/server/video/schema"
import { isUniqueViolation } from "@/server/video/unique-violation"
import { getYoutubeApiKey } from "@/server/video/settings"
import {
  creatorProfileUrl,
  parseCreatorProfileLink,
} from "@/server/video/creators/profile-url"
import { readYoutubeChannel } from "@/server/video/creators/uploads"
import {
  CREATOR_PACE_SAMPLE,
  isCreatorPlatform,
  type ResearchCreator,
} from "@/lib/video/creators"

/**
 * The creators somebody follows.
 *
 * Every query names the owner, so one person's list can never answer another's
 * — an id belonging to somebody else simply finds nothing rather than
 * refusing, which tells the asker less.
 */

export const CREATOR_ERRORS = {
  notFound: "CREATOR_NOT_FOUND",
  alreadyFollowed: "CREATOR_ALREADY_FOLLOWED",
  youtubeKeyMissing: "YOUTUBE_KEY_MISSING",
  youtubeChannelMissing: "YOUTUBE_CHANNEL_NOT_FOUND",
} as const

/** How long an avatar fetch may take before the add gives up on it. */
const AVATAR_TIMEOUT_MS = 10_000
/** An avatar bigger than this is not an avatar. */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/**
 * How far back the views-a-day figure looks. Long enough that a creator who
 * posts monthly still has a few posts in it, short enough that the query stays
 * small however long somebody has been followed.
 */
const PACE_WINDOW_DAYS = 90

/** Picture formats a profile picture may be. Deliberately no SVG. */
const AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

export async function listCreators(
  ownerId: string
): Promise<ResearchCreator[]> {
  const rows = await db
    .select()
    .from(videoCreators)
    .where(eq(videoCreators.ownerId, ownerId))
    .orderBy(videoCreators.handle)
  if (rows.length === 0) return []

  const pace = await readViewsPerDay(
    ownerId,
    rows.map((row) => row.id)
  )

  return rows.flatMap((row) => {
    if (!isCreatorPlatform(row.platform)) return []
    return [
      {
        id: row.id,
        platform: row.platform,
        handle: row.handle,
        displayName: row.displayName,
        followerCount: row.followerCount,
        profileUrl: row.profileUrl || creatorProfileUrl(row),
        watch: row.watch,
        lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
        // Served by the app's own route, which checks the session, rather than
        // the platform's address: those expire and leak who is looking.
        avatarUrl: row.avatarStoragePath
          ? `/api/v1/video/creators/${row.id}/avatar`
          : null,
        viewsPerDay: pace.get(row.id) ?? null,
      },
    ]
  })
}

/**
 * How fast each creator's recent work is being watched: views a day across
 * their newest posts. Worked out on the way past rather than stored, so it is
 * never a stale number nobody recalculated, and it reads only what the watch
 * timer already fetched.
 */
async function readViewsPerDay(
  ownerId: string,
  creatorIds: string[]
): Promise<Map<string, number>> {
  // Only the recent window is read. Without it this would pull every post
  // anybody has ever made — a year of thirty watched creators is tens of
  // thousands of rows, fetched on every load of the page, to work out an
  // average over ten of them. The window is also what the figure means: how
  // fast their *recent* work is being watched.
  const since = new Date(Date.now() - PACE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db
    .select({
      creatorId: videoCreatorPosts.creatorId,
      views: videoCreatorPosts.views,
      postedAt: videoCreatorPosts.postedAt,
      firstSeenAt: videoCreatorPosts.firstSeenAt,
    })
    .from(videoCreatorPosts)
    .where(
      and(
        eq(videoCreatorPosts.ownerId, ownerId),
        inArray(videoCreatorPosts.creatorId, creatorIds),
        gte(
          sql`coalesce(${videoCreatorPosts.postedAt}, ${videoCreatorPosts.firstSeenAt})`,
          since
        )
      )
    )
    .orderBy(desc(videoCreatorPosts.postedAt))

  const seen = new Map<string, { views: number; days: number }>()
  const counted = new Map<string, number>()
  const today = Date.now()

  for (const row of rows) {
    const taken = counted.get(row.creatorId) ?? 0
    if (taken >= CREATOR_PACE_SAMPLE) continue
    counted.set(row.creatorId, taken + 1)
    if (row.views === null) continue

    const posted = (row.postedAt ?? row.firstSeenAt).getTime()
    // A post from today has not had a day to be watched yet, so it counts as
    // one day rather than a fraction that would read as a huge pace.
    const days = Math.max(1, (today - posted) / (24 * 60 * 60 * 1000))
    const running = seen.get(row.creatorId) ?? { views: 0, days: 0 }
    seen.set(row.creatorId, {
      views: running.views + row.views,
      days: running.days + days,
    })
  }

  const pace = new Map<string, number>()
  for (const [creatorId, totals] of seen) {
    if (totals.days > 0) {
      pace.set(creatorId, Math.round(totals.views / totals.days))
    }
  }
  return pace
}

/**
 * Follows a creator from a pasted profile link.
 *
 * A YouTube link costs one API unit, to turn the handle into the channel id
 * that listing uploads needs. The other two are added from the link alone and
 * fill their details in on the first watch tick.
 */
export async function addCreatorByLink(
  ownerId: string,
  link: string,
  source: string | null = null
): Promise<ResearchCreator> {
  const parsed = parseCreatorProfileLink(link)

  let handle = parsed.handle
  let channelId = parsed.channelId
  let displayName: string | null = null
  let followerCount: number | null = null
  let avatarUrl: string | null = null

  if (parsed.platform === "youtube") {
    const apiKey = await getYoutubeApiKey()
    if (!apiKey) throw new Error(CREATOR_ERRORS.youtubeKeyMissing)
    const channel = await readYoutubeChannel(
      channelId ? { channelId } : { handle },
      apiKey
    )
    if (!channel) throw new Error(CREATOR_ERRORS.youtubeChannelMissing)
    channelId = channel.channelId
    // YouTube's current @handle wins over the pasted one, which may be an old
    // name that still redirects.
    handle = channel.handle?.toLowerCase() || handle
    displayName = channel.title
    followerCount = channel.subscribers
    avatarUrl = channel.avatarUrl
  }

  const id = uuid()
  const at = now()
  const avatarStoragePath = avatarUrl
    ? await storeAvatar(ownerId, id, avatarUrl)
    : null

  try {
    await db.insert(videoCreators).values({
      id,
      ownerId,
      platform: parsed.platform,
      handle,
      platformChannelId: channelId,
      displayName,
      followerCount,
      avatarStoragePath,
      profileUrl: creatorProfileUrl({
        platform: parsed.platform,
        handle,
        platformChannelId: channelId,
      }),
      watch: true,
      lastCheckedAt: null,
      source,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (avatarStoragePath) {
      await deleteFromR2(avatarStoragePath).catch(() => undefined)
    }
    // Following somebody twice is not a failure worth a red toast, so it is
    // named and the panel says so plainly.
    if (isUniqueViolation(error)) {
      throw new Error(CREATOR_ERRORS.alreadyFollowed)
    }
    throw error
  }

  const [created] = await listCreatorsById(ownerId, [id])
  if (!created) throw new Error(CREATOR_ERRORS.notFound)
  return created
}

async function listCreatorsById(ownerId: string, ids: string[]) {
  const all = await listCreators(ownerId)
  return all.filter((creator) => ids.includes(creator.id))
}

/** Turns the watch timer on or off for one creator, keeping its posts. */
export async function setCreatorWatch(
  ownerId: string,
  creatorId: string,
  watch: boolean
): Promise<void> {
  const [changed] = await db
    .update(videoCreators)
    .set({ watch, updatedAt: now() })
    .where(
      and(eq(videoCreators.id, creatorId), eq(videoCreators.ownerId, ownerId))
    )
    .returning({ id: videoCreators.id })
  if (!changed) throw new Error(CREATOR_ERRORS.notFound)
}

/**
 * Unfollows a creator. Their feed posts and folder memberships go with them
 * through the foreign keys; any video already saved and broken down stays,
 * because it belongs to whoever saved it rather than to the creator.
 */
export async function deleteCreator(
  ownerId: string,
  creatorId: string
): Promise<void> {
  const [removed] = await db
    .delete(videoCreators)
    .where(
      and(eq(videoCreators.id, creatorId), eq(videoCreators.ownerId, ownerId))
    )
    .returning({
      id: videoCreators.id,
      avatarStoragePath: videoCreators.avatarStoragePath,
    })
  if (!removed) throw new Error(CREATOR_ERRORS.notFound)
  if (removed.avatarStoragePath) {
    await deleteFromR2(removed.avatarStoragePath).catch(() => undefined)
  }
}

/** Where one creator's avatar is stored, for the session-checked route. */
export async function creatorAvatarPath(
  ownerId: string,
  creatorId: string
): Promise<string> {
  const [row] = await db
    .select({ avatarStoragePath: videoCreators.avatarStoragePath })
    .from(videoCreators)
    .where(
      and(eq(videoCreators.id, creatorId), eq(videoCreators.ownerId, ownerId))
    )
  if (!row?.avatarStoragePath) throw new Error(CREATOR_ERRORS.notFound)
  return row.avatarStoragePath
}

/**
 * Fetches a creator's picture and keeps a copy.
 *
 * Best effort on purpose: a missing picture is no reason to refuse to follow
 * somebody. The address comes from the platform's own API answer, never from
 * anything typed, and only an image that is actually an image is kept.
 */
async function storeAvatar(
  ownerId: string,
  creatorId: string,
  avatarUrl: string
): Promise<string | null> {
  try {
    if (!avatarUrl.startsWith("https://")) return null
    const response = await fetch(avatarUrl, {
      signal: AbortSignal.timeout(AVATAR_TIMEOUT_MS),
    })
    if (!response.ok) return null

    const contentType = response.headers.get("content-type") ?? ""
    const mimeType = contentType.split(";")[0].trim().toLowerCase()
    // A named list rather than "starts with image/", because SVG is a document
    // that can carry script. Served back from our own address it would run
    // there, so it never gets stored however the platform labels it.
    if (!AVATAR_TYPES.has(mimeType)) return null

    const bytes = await readCappedBytes(response)
    if (!bytes) return null

    const storagePath = `video-creator-avatars/${ownerId}/${creatorId}.img`
    await uploadToR2(storagePath, bytes, mimeType)
    return storagePath
  } catch (error) {
    console.error("A creator's picture could not be saved", error)
    return null
  }
}

/**
 * Reads a response, giving up the moment it passes the cap.
 *
 * Reading it whole and measuring afterwards is what this avoids: a reply that
 * never stops would be held in memory in full before anybody noticed how big
 * it was. Same shape as the generated-video reader in
 * `asset-factories/generations.ts`.
 */
async function readCappedBytes(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > AVATAR_MAX_BYTES) return null

  const reader = response.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > AVATAR_MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  if (!size) return null

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Writes back whatever a watch tick learned about a creator. */
export async function refreshCreatorProfile(
  creatorId: string,
  profile: { displayName: string | null; followerCount: number | null }
): Promise<void> {
  const changes: Record<string, unknown> = { updatedAt: now() }
  if (profile.displayName) changes.displayName = profile.displayName
  if (profile.followerCount !== null) {
    changes.followerCount = profile.followerCount
  }
  await db
    .update(videoCreators)
    .set(changes)
    .where(eq(videoCreators.id, creatorId))
}

/** True when this person follows this creator. Guards a folder write. */
export async function ownsCreator(
  ownerId: string,
  creatorId: string
): Promise<boolean> {
  const [row] = await db
    .select({ one: sql<number>`1` })
    .from(videoCreators)
    .where(
      and(eq(videoCreators.id, creatorId), eq(videoCreators.ownerId, ownerId))
    )
  return !!row
}
