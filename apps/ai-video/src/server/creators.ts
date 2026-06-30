import { and, eq, inArray, sql } from "drizzle-orm"

import { parseCreatorProfileUrl } from "@/server/creator-profile-url"
import { fetchCreatorAvatar } from "@/server/creator-avatars"
import { db } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoCreators,
  aiVideoViralVideos,
  type AiVideoCreator,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  fetchCreatorProfileMetrics,
  type CreatorProfileMetrics,
  type ViralPlatform,
} from "@/server/video-download"

// Creator rows are mostly auto-managed from yt-dlp metadata. Users can also add
// a watched profile manually; reel import still happens only through sync runs.

export type CreatorItem = {
  id: string
  platform: ViralPlatform
  username: string
  display_name: string | null
  follower_count: number | null
  avatar_url: string | null
  reel_count: number
  last_reel_at: string | null
  // Auto-ingestion toggle + when the watcher last listed this profile.
  watch: boolean
  last_checked_at: string | null
  created_at: string
}

export type CreatorListResponse = {
  creators: CreatorItem[]
}

function serializeCreator(
  row: AiVideoCreator,
  reelCount: number,
  lastReelAt: Date | null
): CreatorItem {
  return {
    id: row.id,
    platform: row.platform as ViralPlatform,
    username: row.username,
    display_name: row.displayName,
    follower_count: row.followerCount,
    avatar_url: row.avatarStoragePath
      ? getPublicMediaUrl(row.avatarStoragePath)
      : null,
    reel_count: reelCount,
    last_reel_at: lastReelAt ? lastReelAt.toISOString() : null,
    watch: row.watch,
    last_checked_at: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  }
}

// Creators with their reel counts, most recently active first.
async function queryCreators(userId: string, creatorId?: string) {
  const rows = await db
    .select({
      creator: aiVideoCreators,
      reelCount: sql<number>`count(${aiVideoViralVideos.id})::int`,
      lastReelAt: sql<Date | null>`max(${aiVideoViralVideos.createdAt})`,
    })
    .from(aiVideoCreators)
    .leftJoin(
      aiVideoViralVideos,
      eq(aiVideoViralVideos.creatorId, aiVideoCreators.id)
    )
    .where(
      creatorId
        ? and(
            eq(aiVideoCreators.userId, userId),
            eq(aiVideoCreators.id, creatorId)
          )
        : eq(aiVideoCreators.userId, userId)
    )
    .groupBy(aiVideoCreators.id)
    .orderBy(
      sql`max(${aiVideoViralVideos.createdAt}) desc nulls last`,
      sql`${aiVideoCreators.createdAt} desc`
    )

  return rows.map((row) =>
    serializeCreator(
      row.creator,
      row.reelCount,
      // node-postgres may hand timestamps back as strings in raw sql selects.
      row.lastReelAt ? new Date(row.lastReelAt) : null
    )
  )
}

export async function listCreatorsForCurrentUser(): Promise<CreatorListResponse> {
  const user = await requireUser()
  return { creators: await queryCreators(user.id) }
}

export async function getCreatorForCurrentUser(
  creatorId: string
): Promise<CreatorItem> {
  const user = await requireUser()
  const [creator] = await queryCreators(user.id, creatorId)
  if (!creator) {
    throw new Error("Creator not found")
  }
  return creator
}

export async function createCreatorForCurrentUser(
  profileUrl: string
): Promise<CreatorItem> {
  requireAppOrigin()
  const user = await requireUser()
  const profile = parseCreatorProfileUrl(profileUrl)
  const timestamp = now()

  const [creator] = await db
    .insert(aiVideoCreators)
    .values({
      id: uuid(),
      userId: user.id,
      platform: profile.platform,
      username: profile.username,
      displayName: null,
      watch: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        aiVideoCreators.userId,
        aiVideoCreators.platform,
        aiVideoCreators.username,
      ],
      set: {
        watch: true,
        updatedAt: timestamp,
      },
    })
    .returning()

  if (!creator) {
    throw new Error("Creator was not created")
  }

  if (!creator.avatarStoragePath) {
    await attachCreatorAvatar(creator).catch(() => undefined)
  }
  await refreshCreatorProfileMetrics(creator).catch(() => undefined)

  const [item] = await queryCreators(user.id, creator.id)
  if (!item) {
    throw new Error("Creator was not created")
  }

  return item
}

// Called from the viral pipeline after metadata lands. Matches on the
// lowercased handle so future reels from the same account attach to the same
// creator. Returns the creator id to store on the viral row, or null when the
// platform gave no handle (the reel simply stays unlinked).
export async function upsertCreatorFromReel(
  userId: string,
  platform: ViralPlatform,
  data: { handle: string | null; displayName: string | null }
): Promise<string | null> {
  const username = data.handle?.trim().toLowerCase().slice(0, 255)
  if (!username) return null

  const timestamp = now()
  const [creator] = await db
    .insert(aiVideoCreators)
    .values({
      id: uuid(),
      userId,
      platform,
      username,
      displayName: data.displayName,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [
        aiVideoCreators.userId,
        aiVideoCreators.platform,
        aiVideoCreators.username,
      ],
      // Keep the stored display name when the new reel didn't include one.
      set: {
        ...(data.displayName ? { displayName: data.displayName } : {}),
        updatedAt: timestamp,
      },
    })
    .returning()

  if (!creator) return null

  // Best-effort profile picture, fetched once — never fails the pipeline.
  if (!creator.avatarStoragePath) {
    await attachCreatorAvatar(creator).catch(() => undefined)
  }
  if (creator.followerCount === null) {
    await refreshCreatorProfileMetrics(creator).catch(() => undefined)
  }

  return creator.id
}

// Best-effort platform profile stats. This intentionally never blocks the
// archive flow; blocked/unavailable platforms leave follower_count null.
export async function refreshCreatorProfileMetrics(creator: AiVideoCreator) {
  const metrics = await fetchCreatorProfileMetrics(
    creator.platform as ViralPlatform,
    creator.username
  )
  await applyCreatorProfileMetrics(creator, metrics)
}

export async function applyCreatorProfileMetrics(
  creator: AiVideoCreator,
  metrics: CreatorProfileMetrics
) {
  if (!metrics.displayName && metrics.followerCount === null) return

  const updates: Partial<Pick<AiVideoCreator, "displayName" | "followerCount">> & {
    updatedAt: Date
  } = { updatedAt: now() }

  if (metrics.displayName) {
    updates.displayName = metrics.displayName
  }
  if (metrics.followerCount !== null) {
    updates.followerCount = metrics.followerCount
  }

  await db
    .update(aiVideoCreators)
    .set(updates)
    .where(eq(aiVideoCreators.id, creator.id))
}

// Fetches the platform avatar and stores it on R2 + the creator row.
async function attachCreatorAvatar(creator: AiVideoCreator) {
  const avatar = await fetchCreatorAvatar(
    creator.platform as ViralPlatform,
    creator.username
  )
  if (!avatar) return

  const storagePath = `creator-avatars/${creator.userId}/${creator.id}.jpg`
  await uploadToR2(storagePath, avatar.bytes, avatar.contentType)
  await db
    .update(aiVideoCreators)
    .set({ avatarStoragePath: storagePath, updatedAt: now() })
    .where(eq(aiVideoCreators.id, creator.id))
}

// Deleting a creator also deletes all of their archived reels (footage,
// thumbnails, analysis — the full Viral Archive cascade), then the avatar.
export async function deleteCreatorsForCurrentUser(
  creatorIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(creatorIds))

  const creators = await db
    .select()
    .from(aiVideoCreators)
    .where(
      and(
        eq(aiVideoCreators.userId, user.id),
        inArray(aiVideoCreators.id, uniqueIds)
      )
    )
  if (!creators.length) {
    return { deletedCount: 0 }
  }

  // Dynamic import breaks the static cycle (viral-videos.ts imports this file
  // for the pipeline upsert).
  const { destroyViralVideo } = await import("@/server/viral-videos")

  for (const creator of creators) {
    const reels = await db
      .select()
      .from(aiVideoViralVideos)
      .where(
        and(
          eq(aiVideoViralVideos.userId, user.id),
          eq(aiVideoViralVideos.creatorId, creator.id)
        )
      )
    for (const reel of reels) {
      await destroyViralVideo(user.id, reel)
    }

    if (creator.avatarStoragePath) {
      await deleteFromR2(creator.avatarStoragePath).catch(() => undefined)
    }
    await db.delete(aiVideoCreators).where(eq(aiVideoCreators.id, creator.id))
  }

  return { deletedCount: creators.length }
}
