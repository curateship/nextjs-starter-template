import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetName,
  assetPrompt,
  normalizeAssetTags,
  type AssetAspectRatio,
  type GeminiImageModelId,
} from "@/lib/video/asset-factories"
import { requireCanonicalTimeline } from "@/lib/video/timeline-schema"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findOwnedImageByUrl,
  getOwnedMedia,
  serializeMedia,
} from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { writeProjectTimeline } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
  videoProjects,
  type VideoFirstFrameRow,
} from "@/server/video/schema"
import { requireOwnedActor } from "./actors"
import { generateImage } from "./images"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

const frameImage = alias(customShellMedia, "first_frame_image")
const frameReference = alias(customShellMedia, "first_frame_reference")
const actorImage = alias(customShellMedia, "first_frame_actor_image")

export type FirstFrameItem = {
  id: string
  name: string
  actor: { id: string; name: string; image_url: string }
  prompt: string
  model: GeminiImageModelId
  aspect_ratio: AssetAspectRatio
  tags: string[]
  pinned: boolean
  image_media_id: string
  image_url: string
  reference_media_id: string | null
  reference_media_url: string | null
  created_at: string
  updated_at: string
}

export type FirstFramePayload = {
  name: string
  actorId: string
  prompt: string
  model: GeminiImageModelId
  aspectRatio: AssetAspectRatio
  tags: string
  referenceMediaId?: string | null
  referenceMediaUrl?: string | null
  variants: number
}

function parseTags(value: unknown) {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : []
}

function serializeFirstFrame(
  frame: VideoFirstFrameRow,
  actor: typeof videoActors.$inferSelect,
  actorMedia: typeof customShellMedia.$inferSelect,
  image: typeof customShellMedia.$inferSelect,
  reference: typeof customShellMedia.$inferSelect | null
): FirstFrameItem {
  return {
    id: frame.id,
    name: frame.name,
    actor: {
      id: actor.id,
      name: actor.name,
      image_url: serializeMedia(actorMedia).url,
    },
    prompt: frame.prompt,
    model: frame.model as GeminiImageModelId,
    aspect_ratio: frame.aspectRatio as AssetAspectRatio,
    tags: parseTags(frame.tags),
    pinned: frame.pinned,
    image_media_id: frame.imageMediaId,
    image_url: serializeMedia(image).url,
    reference_media_id: frame.referenceMediaId,
    reference_media_url: reference ? serializeMedia(reference).url : null,
    created_at: frame.createdAt.toISOString(),
    updated_at: frame.updatedAt.toISOString(),
  }
}

function listRows(userId: string, firstFrameId?: string) {
  return db
    .select({
      frame: videoFirstFrames,
      actor: videoActors,
      actorMedia: actorImage,
      image: frameImage,
      reference: frameReference,
    })
    .from(videoFirstFrames)
    .innerJoin(
      videoActors,
      and(
        eq(videoFirstFrames.actorId, videoActors.id),
        eq(videoActors.userId, userId)
      )
    )
    .innerJoin(
      actorImage,
      and(
        eq(videoActors.imageMediaId, actorImage.id),
        eq(actorImage.userId, userId)
      )
    )
    .innerJoin(
      frameImage,
      and(
        eq(videoFirstFrames.imageMediaId, frameImage.id),
        eq(frameImage.userId, userId)
      )
    )
    .leftJoin(
      frameReference,
      and(
        eq(videoFirstFrames.referenceMediaId, frameReference.id),
        eq(frameReference.userId, userId)
      )
    )
    .where(
      and(
        eq(videoFirstFrames.userId, userId),
        firstFrameId ? eq(videoFirstFrames.id, firstFrameId) : undefined
      )
    )
    .orderBy(desc(videoFirstFrames.pinned), desc(videoFirstFrames.createdAt))
}

export async function listFirstFrames(userId: string) {
  const rows = await listRows(userId)
  return {
    firstFrames: rows.map((row) =>
      serializeFirstFrame(
        row.frame,
        row.actor,
        row.actorMedia,
        row.image,
        row.reference
      )
    ),
  }
}

async function oneFrame(userId: string, frameId: string) {
  const [row] = await listRows(userId, frameId).limit(1)
  return row ?? null
}

export async function createFirstFrames(
  userId: string,
  payload: FirstFramePayload
): Promise<{ firstFrames: FirstFrameItem[]; warning: string | null }> {
  const actor = await requireOwnedActor(userId, payload.actorId)
  const actorMedia = await getOwnedMedia(userId, actor.imageMediaId)
  const name = assetName(payload.name, "First frame")
  const prompt = assetPrompt(payload.prompt)
  const selectedReferenceId =
    payload.referenceMediaId ??
    (payload.referenceMediaUrl
      ? (await findOwnedImageByUrl(userId, payload.referenceMediaUrl))?.id
      : null)
  const reference = selectedReferenceId
    ? await getOwnedMedia(userId, selectedReferenceId)
    : actorMedia
  if (reference.fileType !== "image") {
    throw new Error("Reference media must be an image")
  }

  const created: FirstFrameItem[] = []
  for (let variant = 1; variant <= payload.variants; variant += 1) {
    try {
      const image = await generateImage({
        userId,
        model: payload.model,
        aspectRatio: payload.aspectRatio,
        reference,
        prompt: `Create a polished opening frame for a short video. Preserve the actor's identity. Actor: ${actor.name}. Actor description: ${actor.prompt}. Direction: ${prompt}. Variant ${variant} of ${payload.variants}.`,
      })
      const media = await saveGeneratedAsset({
        userId,
        ...image,
        fileType: "image",
        name: payload.variants > 1 ? `${name} ${variant}` : name,
      })
      const at = now()
      try {
        const [frame] = await db
          .insert(videoFirstFrames)
          .values({
            id: uuid(),
            userId,
            actorId: actor.id,
            name: payload.variants > 1 ? `${name} ${variant}` : name,
            prompt,
            model: payload.model,
            aspectRatio: payload.aspectRatio,
            tags: normalizeAssetTags(payload.tags),
            pinned: false,
            imageMediaId: media.id,
            referenceMediaId: selectedReferenceId,
            createdAt: at,
            updatedAt: at,
          })
          .returning()
        created.push(
          serializeFirstFrame(
            frame,
            actor,
            actorMedia,
            media,
            selectedReferenceId ? reference : null
          )
        )
      } catch (error) {
        await discardGeneratedAsset(media)
        throw error
      }
    } catch (error) {
      if (!created.length) throw error
      return {
        firstFrames: created,
        warning: `${created.length} variant${created.length === 1 ? " was" : "s were"} made before the next one failed: ${error instanceof Error ? error.message : "Image generation failed"}`,
      }
    }
  }
  return { firstFrames: created, warning: null }
}

export async function setFirstFramePinned(
  userId: string,
  firstFrameId: string,
  pinned: boolean
) {
  const [updated] = await db
    .update(videoFirstFrames)
    .set({ pinned, updatedAt: now() })
    .where(
      and(
        eq(videoFirstFrames.id, firstFrameId),
        eq(videoFirstFrames.userId, userId)
      )
    )
    .returning({ id: videoFirstFrames.id })
  if (!updated) throw new Error("First frame not found")
  const row = await oneFrame(userId, firstFrameId)
  if (!row) throw new Error("First frame not found")
  return serializeFirstFrame(
    row.frame,
    row.actor,
    row.actorMedia,
    row.image,
    row.reference
  )
}

export async function deleteFirstFrames(userId: string, firstFrameIds: string[]) {
  const ids = [...new Set(firstFrameIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const active = await db
    .select({ id: videoAiGenerations.id })
    .from(videoAiGenerations)
    .where(
      and(
        eq(videoAiGenerations.userId, userId),
        inArray(videoAiGenerations.firstFrameId, ids),
        inArray(videoAiGenerations.status, ["queued", "processing"])
      )
    )
    .limit(1)
  if (active.length) {
    throw new Error("Wait for this first frame's video generation to finish")
  }
  const rows = await db
    .delete(videoFirstFrames)
    .where(
      and(
        eq(videoFirstFrames.userId, userId),
        inArray(videoFirstFrames.id, ids)
      )
    )
    .returning({ id: videoFirstFrames.id })
  return { deleted_ids: rows.map((row) => row.id) }
}

export async function insertFirstFrame(
  userId: string,
  firstFrameId: string,
  projectId: string
) {
  const frame = await oneFrame(userId, firstFrameId)
  if (!frame) throw new Error("First frame not found")
  const [project] = await db
    .select()
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error("Project not found")
  const timeline = requireCanonicalTimeline(project.timeline)
  if (timeline.tracks.length >= 50) throw new Error("Project timeline is full")
  const media = serializeMedia(frame.image)
  const next = requireCanonicalTimeline({
    ...timeline,
    tracks: [
      ...timeline.tracks,
      {
        id: uuid(),
        muted: false,
        clips: [
          {
            id: uuid(),
            kind: "image",
            name: frame.frame.name,
            startMs: 0,
            durationMs: 4_000,
            trimStartMs: 0,
            mediaId: media.id,
            url: media.url,
          },
        ],
      },
    ],
  })
  await writeProjectTimeline(userId, project.id, next, project.version)
  return { project_id: project.id, project_name: project.name }
}
