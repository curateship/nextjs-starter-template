import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import type { ActorModelId } from "@/lib/actor-models"
import {
  type FirstFrameAspectRatio,
  type FirstFramePayload,
  type FirstFrameReferenceSource,
} from "@/lib/first-frame-models"
import { db } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media-storage"
import { getOwnedActor, normalizeActorTags } from "@/server/actors"
import { getOwnedMedia, saveGeneratedImageToLibrary } from "@/server/media"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoFirstFrames,
  aiVideoActors,
  aiVideoMedia,
  type AiVideoActor,
  type AiVideoFirstFrame,
  type AiVideoMedia,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  enforceImageGenerationRateLimit,
  generateActorImage,
  type ImageGenerationReference,
} from "@/server/actor-actions"

const generatedMedia = alias(aiVideoMedia, "generated_media")
const referenceMedia = alias(aiVideoMedia, "reference_media")

export type FirstFrameActorSummary = {
  id: string
  name: string
  image_url: string
}

export type FirstFrameItem = {
  id: string
  name: string
  actor: FirstFrameActorSummary
  prompt: string
  model: ActorModelId
  tags: string[]
  aspect_ratio: FirstFrameAspectRatio
  reference_source: FirstFrameReferenceSource
  reference_media_id: string | null
  reference_media_url: string | null
  generated_media_id: string | null
  image_url: string | null
  pinned: boolean
  created_at: string
  updated_at: string
}

export type FirstFrameListResponse = {
  firstFrames: FirstFrameItem[]
}

export async function listFirstFramesForCurrentUser(): Promise<FirstFrameListResponse> {
  const user = await requireUser()
  const rows = await db
    .select({
      firstFrame: aiVideoFirstFrames,
      actor: aiVideoActors,
      media: generatedMedia,
      referenceMedia,
    })
    .from(aiVideoFirstFrames)
    .innerJoin(aiVideoActors, eq(aiVideoFirstFrames.actorId, aiVideoActors.id))
    .leftJoin(
      generatedMedia,
      and(
        eq(aiVideoFirstFrames.generatedMediaId, generatedMedia.id),
        eq(generatedMedia.userId, user.id)
      )
    )
    .leftJoin(
      referenceMedia,
      and(
        eq(aiVideoFirstFrames.referenceMediaId, referenceMedia.id),
        eq(referenceMedia.userId, user.id)
      )
    )
    .where(eq(aiVideoFirstFrames.userId, user.id))
    .orderBy(desc(aiVideoFirstFrames.pinned), desc(aiVideoFirstFrames.createdAt))

  return {
    firstFrames: rows.map((row) =>
      serializeFirstFrame(row.firstFrame, row.actor, row.media, row.referenceMedia)
    ),
  }
}

export async function createFirstFrameForCurrentUser(
  data: FirstFramePayload
): Promise<FirstFrameItem> {
  requireAppOrigin()
  const user = await requireUser()
  const actor = await getOwnedActor(user.id, data.actorId)
  const name = cleanFirstFrameName(data.name)
  const prompt = cleanFirstFramePrompt(data.prompt)
  const tags = normalizeActorTags(data.tags)
  const referenceMedia =
    data.referenceSource === "media"
      ? await resolveReferenceMedia(user.id, data.referenceMediaId)
      : null
  const referenceImage =
    data.referenceSource === "media"
      ? referenceMedia
      : {
          storagePath: actor.imageStoragePath,
          mimeType: actor.imageMimeType,
        }
  const generatedPrompt = composeFirstFramePrompt({
    actor,
    prompt,
    aspectRatio: data.aspectRatio,
  })

  await enforceImageGenerationRateLimit(user.id)
  const image = await generateActorImage(
    generatedPrompt,
    data.model,
    referenceImage
  )
  const media = await saveGeneratedImageToLibrary(
    user.id,
    image.bytes,
    image.mimeType,
    `${name}.${extensionForMimeType(image.mimeType)}`
  )

  const createdAt = now()
  const row = {
    id: uuid(),
    userId: user.id,
    actorId: actor.id,
    generatedMediaId: media.id,
    referenceMediaId: referenceMedia?.id ?? null,
    referenceSource: data.referenceSource,
    name,
    prompt,
    model: data.model,
    aspectRatio: data.aspectRatio,
    tags,
    pinned: false,
    createdAt,
    updatedAt: createdAt,
  }

  try {
    const [created] = await db.insert(aiVideoFirstFrames).values(row).returning()
    if (!created) {
      throw new Error("First frame was not created")
    }
    return serializeFirstFrame(created, actor, media, referenceMedia)
  } catch (error) {
    await deleteFromR2(media.storagePath).catch(() => undefined)
    await db
      .delete(aiVideoMedia)
      .where(and(eq(aiVideoMedia.id, media.id), eq(aiVideoMedia.userId, user.id)))
      .catch(() => undefined)
    throw error
  }
}

export async function updateFirstFrameForCurrentUser(
  firstFrameId: string,
  data: Pick<FirstFramePayload, "name" | "tags">
): Promise<FirstFrameItem> {
  requireAppOrigin()
  const user = await requireUser()
  const name = cleanFirstFrameName(data.name)
  const tags = normalizeActorTags(data.tags)

  const [row] = await db
    .update(aiVideoFirstFrames)
    .set({
      name,
      tags,
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("First frame not found")
  }

  const joined = await getFirstFrameJoin(user.id, row.id)
  if (!joined) {
    throw new Error("First frame not found")
  }
  return serializeFirstFrame(
    joined.firstFrame,
    joined.actor,
    joined.media,
    joined.referenceMedia
  )
}

export async function regenerateFirstFrameForCurrentUser(
  firstFrameId: string,
  data: FirstFramePayload
): Promise<FirstFrameItem> {
  requireAppOrigin()
  const user = await requireUser()
  const [existing] = await db
    .select({ id: aiVideoFirstFrames.id })
    .from(aiVideoFirstFrames)
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, user.id)
      )
    )
    .limit(1)

  if (!existing) {
    throw new Error("First frame not found")
  }

  const actor = await getOwnedActor(user.id, data.actorId)
  const name = cleanFirstFrameName(data.name)
  const prompt = cleanFirstFramePrompt(data.prompt)
  const tags = normalizeActorTags(data.tags)
  const referenceMedia =
    data.referenceSource === "media"
      ? await resolveReferenceMedia(user.id, data.referenceMediaId)
      : null
  const referenceImage =
    data.referenceSource === "media"
      ? referenceMedia
      : {
          storagePath: actor.imageStoragePath,
          mimeType: actor.imageMimeType,
        }
  const generatedPrompt = composeFirstFramePrompt({
    actor,
    prompt,
    aspectRatio: data.aspectRatio,
  })

  await enforceImageGenerationRateLimit(user.id)
  const image = await generateActorImage(
    generatedPrompt,
    data.model,
    referenceImage
  )
  const media = await saveGeneratedImageToLibrary(
    user.id,
    image.bytes,
    image.mimeType,
    `${name}.${extensionForMimeType(image.mimeType)}`
  )

  try {
    const [row] = await db
      .update(aiVideoFirstFrames)
      .set({
        actorId: actor.id,
        generatedMediaId: media.id,
        referenceMediaId: referenceMedia?.id ?? null,
        referenceSource: data.referenceSource,
        name,
        prompt,
        model: data.model,
        aspectRatio: data.aspectRatio,
        tags,
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoFirstFrames.id, firstFrameId),
          eq(aiVideoFirstFrames.userId, user.id)
        )
      )
      .returning()

    if (!row) {
      throw new Error("First frame not found")
    }
    return serializeFirstFrame(row, actor, media, referenceMedia)
  } catch (error) {
    await deleteFromR2(media.storagePath).catch(() => undefined)
    await db
      .delete(aiVideoMedia)
      .where(and(eq(aiVideoMedia.id, media.id), eq(aiVideoMedia.userId, user.id)))
      .catch(() => undefined)
    throw error
  }
}

export async function updateFirstFramePinnedForCurrentUser(
  firstFrameId: string,
  pinned: boolean
): Promise<FirstFrameItem> {
  requireAppOrigin()
  const user = await requireUser()
  const [row] = await db
    .update(aiVideoFirstFrames)
    .set({ pinned, updatedAt: now() })
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, user.id)
      )
    )
    .returning()

  if (!row) {
    throw new Error("First frame not found")
  }

  const joined = await getFirstFrameJoin(user.id, row.id)
  if (!joined) {
    throw new Error("First frame not found")
  }
  return serializeFirstFrame(
    joined.firstFrame,
    joined.actor,
    joined.media,
    joined.referenceMedia
  )
}

export async function deleteFirstFrameForCurrentUser(
  firstFrameId: string
): Promise<{ firstFrameId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const [row] = await db
    .delete(aiVideoFirstFrames)
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, user.id)
      )
    )
    .returning({ id: aiVideoFirstFrames.id })

  if (!row) {
    throw new Error("First frame not found")
  }

  return { firstFrameId: row.id }
}

export async function deleteFirstFramesForCurrentUser(
  firstFrameIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(firstFrameIds))
  if (!uniqueIds.length) return { deletedCount: 0 }

  const rows = await db
    .delete(aiVideoFirstFrames)
    .where(
      and(
        eq(aiVideoFirstFrames.userId, user.id),
        inArray(aiVideoFirstFrames.id, uniqueIds)
      )
    )
    .returning({ id: aiVideoFirstFrames.id })

  return { deletedCount: rows.length }
}

function serializeFirstFrame(
  row: AiVideoFirstFrame,
  actor: AiVideoActor,
  media: AiVideoMedia | null,
  referenceMedia: AiVideoMedia | null = null
): FirstFrameItem {
  return {
    id: row.id,
    name: row.name,
    actor: {
      id: actor.id,
      name: actor.name,
      image_url: getPublicMediaUrl(actor.imageStoragePath),
    },
    prompt: row.prompt,
    model: row.model as ActorModelId,
    tags: parseTags(row.tags),
    aspect_ratio: row.aspectRatio as FirstFrameAspectRatio,
    reference_source: row.referenceSource as FirstFrameReferenceSource,
    reference_media_id: row.referenceMediaId,
    reference_media_url: referenceMedia
      ? getPublicMediaUrl(referenceMedia.storagePath)
      : null,
    generated_media_id: row.generatedMediaId,
    image_url: media ? getPublicMediaUrl(media.storagePath) : null,
    pinned: row.pinned,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

async function getFirstFrameJoin(userId: string, firstFrameId: string) {
  const [row] = await db
    .select({
      firstFrame: aiVideoFirstFrames,
      actor: aiVideoActors,
      media: generatedMedia,
      referenceMedia,
    })
    .from(aiVideoFirstFrames)
    .innerJoin(aiVideoActors, eq(aiVideoFirstFrames.actorId, aiVideoActors.id))
    .leftJoin(
      generatedMedia,
      and(
        eq(aiVideoFirstFrames.generatedMediaId, generatedMedia.id),
        eq(generatedMedia.userId, userId)
      )
    )
    .leftJoin(
      referenceMedia,
      and(
        eq(aiVideoFirstFrames.referenceMediaId, referenceMedia.id),
        eq(referenceMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(aiVideoFirstFrames.id, firstFrameId),
        eq(aiVideoFirstFrames.userId, userId)
      )
    )
    .limit(1)

  return row ?? null
}

async function resolveReferenceMedia(userId: string, mediaId?: string | null) {
  if (!mediaId) {
    throw new Error("Reference image is required")
  }
  const media = await getOwnedMedia(userId, mediaId)
  if (media.fileType !== "image") {
    throw new Error("Reference media must be an image")
  }
  return media satisfies ImageGenerationReference
}

function cleanFirstFrameName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("First frame name is required")
  }
  return name.slice(0, 255)
}

function cleanFirstFramePrompt(value: string) {
  const prompt = value.trim()
  if (!prompt) {
    throw new Error("Prompt is required")
  }
  return prompt.slice(0, 5000)
}

function composeFirstFramePrompt({
  actor,
  prompt,
  aspectRatio,
}: {
  actor: AiVideoActor
  prompt: string
  aspectRatio: FirstFrameAspectRatio
}) {
  return `Create a polished first frame image for an AI video.

Actor name: ${actor.name}
Actor description: ${actor.prompt}
Aspect ratio: ${aspectRatio}
First frame direction: ${prompt}

Preserve the actor's identity and make the image feel like the opening composition of a short-form video.`
}

function parseTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => typeof tag === "string")
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  return "png"
}
