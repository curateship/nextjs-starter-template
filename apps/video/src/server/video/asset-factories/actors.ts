import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetName,
  assetPrompt,
  normalizeAssetTags,
  type ImageModelId,
} from "@/lib/video/asset-factories"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findOwnedImageByUrl,
  getOwnedMedia,
  serializeMedia,
} from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
  type VideoActorRow,
} from "@/server/video/schema"
import { generateImage } from "./images"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

const actorImage = alias(customShellMedia, "actor_image")
const actorReference = alias(customShellMedia, "actor_reference")

export type ActorStatus = "active" | "inactive"

export type ActorItem = {
  id: string
  name: string
  prompt: string
  model: ImageModelId
  status: ActorStatus
  tags: string[]
  image_url: string
  image_media_id: string
  reference_media_id: string | null
  reference_media_url: string | null
  created_at: string
  updated_at: string
}

export type ActorPayload = {
  name: string
  prompt: string
  model: ImageModelId
  status: ActorStatus
  tags: string
  referenceMediaId?: string | null
  referenceMediaUrl?: string | null
}

function tags(value: unknown) {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : []
}

function serializeActor(
  actor: VideoActorRow,
  image: typeof customShellMedia.$inferSelect,
  reference: typeof customShellMedia.$inferSelect | null
): ActorItem {
  return {
    id: actor.id,
    name: actor.name,
    prompt: actor.prompt,
    model: actor.model as ImageModelId,
    status: actor.status as ActorStatus,
    tags: tags(actor.tags),
    image_url: serializeMedia(image).url,
    image_media_id: actor.imageMediaId,
    reference_media_id: actor.referenceMediaId,
    reference_media_url: reference ? serializeMedia(reference).url : null,
    created_at: actor.createdAt.toISOString(),
    updated_at: actor.updatedAt.toISOString(),
  }
}

async function actorJoin(userId: string, actorId: string) {
  const [row] = await db
    .select({ actor: videoActors, reference: actorReference })
    .from(videoActors)
    .leftJoin(
      actorReference,
      and(
        eq(videoActors.referenceMediaId, actorReference.id),
        eq(actorReference.userId, userId)
      )
    )
    .where(and(eq(videoActors.id, actorId), eq(videoActors.userId, userId)))
    .limit(1)
  return row ?? null
}

export async function requireOwnedActor(userId: string, actorId: string) {
  const row = await actorJoin(userId, actorId)
  if (!row) throw new Error("Actor not found")
  return row.actor
}

async function referenceFor(
  userId: string,
  mediaId?: string | null,
  mediaUrl?: string | null
) {
  const resolvedId =
    mediaId ??
    (mediaUrl ? (await findOwnedImageByUrl(userId, mediaUrl))?.id : null)
  if (!resolvedId) return null
  const media = await getOwnedMedia(userId, resolvedId)
  if (media.fileType !== "image") {
    throw new Error("Reference media must be an image")
  }
  return media
}

export async function listActors(userId: string): Promise<{ actors: ActorItem[] }> {
  const rows = await db
    .select({ actor: videoActors, image: actorImage, reference: actorReference })
    .from(videoActors)
    .innerJoin(
      actorImage,
      and(
        eq(videoActors.imageMediaId, actorImage.id),
        eq(actorImage.userId, userId)
      )
    )
    .leftJoin(
      actorReference,
      and(
        eq(videoActors.referenceMediaId, actorReference.id),
        eq(actorReference.userId, userId)
      )
    )
    .where(eq(videoActors.userId, userId))
    .orderBy(desc(videoActors.createdAt))
  return {
    actors: rows.map((row) =>
      serializeActor(row.actor, row.image, row.reference)
    ),
  }
}

export async function createActor(userId: string, payload: ActorPayload) {
  const name = assetName(payload.name, "Actor")
  const prompt = assetPrompt(payload.prompt)
  const reference = await referenceFor(
    userId,
    payload.referenceMediaId,
    payload.referenceMediaUrl
  )
  const generated = await generateImage({
    userId,
    model: payload.model,
    prompt: `Create a consistent, reusable on-camera character portrait. ${prompt}`,
    aspectRatio: "9:16",
    reference,
  })
  const media = await saveGeneratedAsset({
    userId,
    ...generated,
    fileType: "image",
    name,
  })
  const at = now()
  try {
    const [created] = await db
      .insert(videoActors)
      .values({
        id: uuid(),
        userId,
        name,
        prompt,
        model: payload.model,
        status: payload.status,
        tags: normalizeAssetTags(payload.tags),
        imageMediaId: media.id,
        referenceMediaId: reference?.id ?? null,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    return serializeActor(created, media, reference)
  } catch (error) {
    await discardGeneratedAsset(media)
    throw error
  }
}

export async function updateActor(
  userId: string,
  actorId: string,
  payload: ActorPayload,
  regenerate: boolean
) {
  const current = await requireOwnedActor(userId, actorId)
  const currentImage = await getOwnedMedia(userId, current.imageMediaId)
  const name = assetName(payload.name, "Actor")
  const prompt = assetPrompt(payload.prompt)
  const reference = await referenceFor(
    userId,
    payload.referenceMediaId,
    payload.referenceMediaUrl
  )
  let generatedMedia: Awaited<ReturnType<typeof saveGeneratedAsset>> | null = null
  if (regenerate) {
    const generated = await generateImage({
      userId,
      model: payload.model,
      prompt: `Re-pose this same character while preserving their identity. ${prompt}`,
      aspectRatio: "9:16",
      reference: reference ?? currentImage,
    })
    generatedMedia = await saveGeneratedAsset({
      userId,
      ...generated,
      fileType: "image",
      name,
    })
  }

  try {
    const [updated] = await db
      .update(videoActors)
      .set({
        name,
        prompt,
        model: payload.model,
        status: payload.status,
        tags: normalizeAssetTags(payload.tags),
        imageMediaId: generatedMedia?.id ?? current.imageMediaId,
        referenceMediaId: reference?.id ?? null,
        updatedAt: now(),
      })
      .where(and(eq(videoActors.id, actorId), eq(videoActors.userId, userId)))
      .returning()
    if (!updated) throw new Error("Actor not found")
    return serializeActor(updated, generatedMedia ?? currentImage, reference)
  } catch (error) {
    if (generatedMedia) await discardGeneratedAsset(generatedMedia)
    throw error
  }
}

export async function deleteActors(userId: string, actorIds: string[]) {
  const ids = [...new Set(actorIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .innerJoin(
      videoFirstFrames,
      eq(videoAiGenerations.firstFrameId, videoFirstFrames.id)
    )
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoFirstFrames.actorId, ids),
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) {
    throw new Error("Wait for this actor's video generation to finish")
  }
  const rows = await db
    .delete(videoActors)
    .where(and(eq(videoActors.userId, userId), inArray(videoActors.id, ids)))
    .returning({ id: videoActors.id })
  return { deleted_ids: rows.map((row) => row.id) }
}

export async function actorImageFor(userId: string, actorId: string) {
  const [row] = await db
    .select({ media: actorImage })
    .from(videoActors)
    .innerJoin(
      actorImage,
      and(
        eq(videoActors.imageMediaId, actorImage.id),
        eq(actorImage.userId, userId)
      )
    )
    .where(and(eq(videoActors.id, actorId), eq(videoActors.userId, userId)))
    .limit(1)
  if (!row) throw new Error("Actor not found")
  return row.media
}
