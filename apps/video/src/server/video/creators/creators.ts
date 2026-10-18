import { and, eq, isNotNull } from "drizzle-orm"

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
import { recordYoutubeUnits } from "@/server/video/viral/youtube-units"

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

/** Picture formats a profile picture may be. Deliberately no SVG. */
const AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

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
): Promise<{ id: string }> {
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
    await recordYoutubeUnits(1, "creator_follow")
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

  return { id }
}

/**
 * Unfollows a creator for good. Their saved posts and project links go with
 * them through the foreign keys, and their kept covers leave storage; any
 * video already saved and broken down stays,
 * because it belongs to whoever saved it rather than to the creator.
 */
export async function deleteCreator(
  ownerId: string,
  creatorId: string
): Promise<void> {
  // The covers kept for their posts live in storage, not in the rows the
  // foreign key deletes, so they are listed first and removed after.
  const covers = await db
    .select({ path: videoCreatorPosts.thumbnailStoragePath })
    .from(videoCreatorPosts)
    .where(
      and(
        eq(videoCreatorPosts.creatorId, creatorId),
        eq(videoCreatorPosts.ownerId, ownerId),
        isNotNull(videoCreatorPosts.thumbnailStoragePath)
      )
    )
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
  const stored = [
    removed.avatarStoragePath,
    ...covers.map((cover) => cover.path),
  ].filter((path): path is string => Boolean(path))
  for (const path of stored) {
    await deleteFromR2(path).catch(() => undefined)
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
  return storePicture(
    avatarUrl,
    `video-creator-avatars/${ownerId}/${creatorId}.img`
  )
}

/**
 * Fetches a picture from a platform's own address and keeps a copy at
 * `storagePath`. Shared by creators' profile pictures and their videos'
 * covers. Answers the stored path, or null when the picture could not be had.
 */
export async function storePicture(
  pictureUrl: string,
  storagePath: string
): Promise<string | null> {
  try {
    if (!pictureUrl.startsWith("https://")) return null
    // A redirect is refused rather than followed: the address came from a
    // platform's answer, and following it blindly could walk the server to
    // an address inside its own network.
    const response = await fetch(pictureUrl, {
      redirect: "error",
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
