import { and, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { aiUnitCostCents } from "@/lib/ai/ai-models"
import {
  assetName,
  assetPrompt,
  DEFAULT_IMAGE_MODEL,
  describeActorPictures,
  projectClipAspect,
  sceneName,
  type AssetAspectRatio,
  type GeminiImageModelId,
} from "@/lib/video/asset-factories"
import {
  BOARD_FULL_MESSAGE,
  BOARD_TILES,
  describeExtras,
  extraLine,
  firstFramePictureLines,
  type ExtraPicks,
} from "@/lib/video/extras"
import { isPictureOrigin, type PictureOrigin } from "@/lib/video/clip-origin"
import { REMAKE_NOT_FOUND_MESSAGE } from "@/lib/video/remake-clip"
import { parseTimelineForReset } from "@/lib/video/timeline-schema"
import { withLook } from "@/lib/video/visual-style"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import {
  serializeVideoMedia,
  type VideoMediaItem,
} from "@/server/video/media-list"
import { readProjectLook } from "@/server/video/project-look"
import { requireProjectBudget } from "@/server/video/project-spend"
import { getOwnedProject } from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoFirstFrames,
} from "@/server/video/schema"
import {
  requireOwnedActor,
  sheetLabels,
  sheetPictureIdsFor,
  sheetPicturesToSend,
} from "./actors"
import { extrasByIds, extrasToSend, sentExtras } from "./extras"
import { generateImage, type ImageReference } from "./images"
import { buildPersonBoard } from "./person-board"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

const frameImage = alias(customShellMedia, "first_frame_image")
const actorImage = alias(customShellMedia, "first_frame_actor_image")

/**
 * One opening picture of an actor, made inside one project. `image` is the
 * picture as the Media panel hands it out, so the AI clip panel can drag it
 * onto the timeline the same way.
 */
export type FirstFrameItem = {
  id: string
  name: string
  actor: { id: string; name: string; image_url: string }
  prompt: string
  aspect_ratio: AssetAspectRatio
  image: VideoMediaItem
  /**
   * The actor's pictures it was drawn from, named by their sheet labels.
   * Empty for frames made before this was written down.
   */
  made_from: string[]
  /** The extras it was made with, by their names today. */
  made_with: string[]
  /** How it was made, which the clip it is laid down as keeps for Make it again. */
  origin: PictureOrigin
  created_at: string
}

export type FirstFramePayload = {
  projectId: string
  actorId: string
  /** The scene, such as "Mia holding a coffee in a bright kitchen". */
  prompt: string
  variants: number
  /** Sheet pictures to send. None means the actor's main picture alone. */
  sheetPictureIds?: string[] | null
  /** The extras picked, one per kind. */
  extras?: ExtraPicks | null
  /**
   * Only for a square or 4:3 project, whose shape no picture model makes.
   * Any other project's frames take the project's own shape.
   */
  aspectRatio?: AssetAspectRatio | null
  /** Left out, the standard picture model. Only Make it again offers another. */
  model?: GeminiImageModelId
}

function frameRows(userId: string, projectId: string, frameIds?: string[]) {
  return db
    .select({
      frame: videoFirstFrames,
      actor: videoActors,
      actorMedia: actorImage,
      image: frameImage,
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
    .where(
      and(
        eq(videoFirstFrames.userId, userId),
        eq(videoFirstFrames.projectId, projectId),
        frameIds ? inArray(videoFirstFrames.id, frameIds) : undefined
      )
    )
    .orderBy(desc(videoFirstFrames.createdAt), desc(videoFirstFrames.id))
}

async function serializeFrames(
  userId: string,
  rows: Awaited<ReturnType<typeof frameRows>>
): Promise<FirstFrameItem[]> {
  const images = await serializeVideoMedia(rows.map((row) => row.image))
  const sheets = await sheetLabels(
    userId,
    [...new Set(rows.map((row) => row.actor.id))]
  )
  const extras = await extrasByIds(
    userId,
    rows.flatMap((row) => row.frame.extras.map((extra) => extra.extra_id))
  )
  return Promise.all(
    rows.map(async (row, index) => ({
      id: row.frame.id,
      name: row.frame.name,
      actor: {
        id: row.actor.id,
        name: row.actor.name,
        image_url: (await serializeMedia(row.actorMedia)).url,
      },
      prompt: row.frame.prompt,
      aspect_ratio: row.frame.aspectRatio as AssetAspectRatio,
      image: images[index],
      made_from: describeActorPictures(
        row.frame.actorMediaIds,
        sheets.get(row.actor.id) ?? [],
        row.actor.imageMediaId
      ),
      made_with: describeExtras(row.frame.extras, extras),
      origin: {
        tool: "first-frame" as const,
        model: row.frame.model,
        prompt: row.frame.prompt,
        referenceMediaIds: row.frame.actorMediaIds,
        actorId: row.actor.id,
        extras: row.frame.extras,
        aspectRatio: row.frame.aspectRatio as AssetAspectRatio,
      },
      created_at: row.frame.createdAt.toISOString(),
    }))
  )
}

/** This project's first frames, newest first. */
export async function listFirstFrames(userId: string, projectId: string) {
  await getOwnedProject(userId, projectId)
  return {
    firstFrames: await serializeFrames(userId, await frameRows(userId, projectId)),
  }
}

/**
 * Makes one or more first frames of an actor for a project. The shape is the
 * project's and the look is the project's, so neither is asked. Every picture
 * goes on the project's spend line, and the project's limit is checked for
 * all of them before the first is made.
 */
export async function createFirstFrames(
  userId: string,
  payload: FirstFramePayload
): Promise<{ firstFrames: FirstFrameItem[]; warning: string | null }> {
  const project = await getOwnedProject(userId, payload.projectId)
  const aspectRatio = projectClipAspect(project.aspect) ?? payload.aspectRatio
  if (!aspectRatio) {
    throw new Error("Pick 9:16 or 16:9 for this project's first frames")
  }
  const actor = await requireOwnedActor(userId, payload.actorId)
  const actorPictures = await sheetPicturesToSend(
    userId,
    actor,
    payload.sheetPictureIds
  )
  const extras = await extrasToSend(userId, payload.extras)
  const onBoard = extras.filter((item) => item.kind !== "backdrop")
  const backdrop = extras.find((item) => item.kind === "backdrop")
  const tiles = [...actorPictures, ...onBoard.map((item) => item.media)]
  if (tiles.length > BOARD_TILES) throw new Error(BOARD_FULL_MESSAGE)
  const prompt = assetPrompt(payload.prompt)
  const name = assetName(sceneName(prompt), "First frame")
  const model: GeminiImageModelId = payload.model ?? DEFAULT_IMAGE_MODEL
  await requireProjectBudget(
    userId,
    project.id,
    aiUnitCostCents(model, payload.variants)
  )
  const look = await readProjectLook(userId, project.id)
  // Everything worn or held goes on one board with the actor's angles, and
  // the backdrop as its own picture, so with the look picture a request never
  // passes the 3 pictures Google takes. One picture of the actor and no
  // extras keeps the request exactly as it always was.
  const person = tiles.length > 1 ? await buildPersonBoard(tiles) : tiles[0]
  const references: ImageReference[] = backdrop ? [person, backdrop.media] : [person]
  const sheet = (await sheetLabels(userId, [actor.id])).get(actor.id) ?? []
  const pictureLines = firstFramePictureLines({
    actorName: actor.name,
    angles: describeActorPictures(
      actorPictures.map((picture) => picture.id),
      sheet,
      actor.imageMediaId
    ),
    extras: extras.map((item) => ({ kind: item.kind, name: item.extra.name })),
  })
  const pictures = pictureLines.map((line) => ` ${line}`).join("")
  const extraWords = extras
    .map((item) => ` ${extraLine(item.kind, item.extra.prompt)}`)
    .join("")

  const createdIds: string[] = []
  let warning: string | null = null
  for (let variant = 1; variant <= payload.variants; variant += 1) {
    try {
      const image = await generateImage({
        userId,
        model,
        aspectRatio,
        projectId: project.id,
        ...withLook<ImageReference>(
          look,
          `Create a polished opening frame for a short video. Preserve the actor's identity.${pictures} Actor: ${actor.name}. Actor description: ${actor.prompt}.${extraWords} Direction: ${prompt}. Variant ${variant} of ${payload.variants}.`,
          references
        ),
      })
      const variantName = payload.variants > 1 ? `${name} ${variant}` : name
      const media = await saveGeneratedAsset({
        userId,
        ...image,
        fileType: "image",
        name: variantName,
      })
      const at = now()
      try {
        const [frame] = await db
          .insert(videoFirstFrames)
          .values({
            id: uuid(),
            userId,
            projectId: project.id,
            actorId: actor.id,
            name: variantName,
            prompt,
            model,
            aspectRatio,
            tags: [],
            pinned: false,
            imageMediaId: media.id,
            actorMediaIds: actorPictures.map((picture) => picture.id),
            extras: sentExtras(extras),
            createdAt: at,
            updatedAt: at,
          })
          .returning({ id: videoFirstFrames.id })
        createdIds.push(frame.id)
      } catch (error) {
        await discardGeneratedAsset(media)
        throw error
      }
    } catch (error) {
      if (!createdIds.length) throw error
      warning = `${createdIds.length} of ${payload.variants} ${createdIds.length === 1 ? "was" : "were"} made before the next one failed: ${error instanceof Error ? error.message : "Image generation failed"}`
      break
    }
  }
  return {
    firstFrames: await serializeFrames(
      userId,
      await frameRows(userId, project.id, createdIds)
    ),
    warning,
  }
}

/**
 * Makes a picture on the timeline again from what it was made from: the same
 * actor, sheet pictures and extras, with the direction and model the Make it
 * again window sends. It is read off the saved timeline, so the editor saves
 * first. The new picture is a first frame of its own, in the AI clip panel;
 * the editor swaps it into the clip (`workspace/docs/regenerate-a-scene.md`).
 */
export async function remakeFirstFrame(
  userId: string,
  payload: {
    projectId: string
    clipId: string
    prompt: string
    model: GeminiImageModelId
  }
): Promise<FirstFrameItem> {
  const project = await getOwnedProject(userId, payload.projectId)
  const { timeline } = parseTimelineForReset(project.timeline)
  const clip = timeline.tracks
    .flatMap((track) => track.clips)
    .find((candidate) => candidate.id === payload.clipId)
  if (clip?.kind !== "image" || !clip.origin || !isPictureOrigin(clip.origin)) {
    throw new Error(REMAKE_NOT_FOUND_MESSAGE)
  }
  const { origin } = clip
  const actor = await requireOwnedActor(userId, origin.actorId)
  const made = await createFirstFrames(userId, {
    projectId: project.id,
    actorId: actor.id,
    prompt: payload.prompt,
    variants: 1,
    sheetPictureIds: await sheetPictureIdsFor(userId, actor, origin.referenceMediaIds),
    extras: Object.fromEntries(origin.extras.map((extra) => [extra.kind, extra.extra_id])),
    aspectRatio: origin.aspectRatio,
    model: payload.model,
  })
  return made.firstFrames[0]
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
