import { and, asc, count, desc, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import {
  assetName,
  assetPrompt,
  MAIN_PICTURE_REMOVE_MESSAGE,
  MAX_SHEET_LABEL_LENGTH,
  MAX_SHEET_PICTURES,
  normalizeAssetTags,
  SHEET_DUPLICATE_MESSAGE,
  SHEET_FULL_MESSAGE,
  SHEET_PICTURE_NOT_FOUND_MESSAGE,
  type ImageModelId,
} from "@/lib/video/asset-factories"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { withLook } from "@/lib/video/visual-style"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  findOwnedImageByUrl,
  getOwnedMedia,
  serializeMedia,
} from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { chosenProjectLook } from "@/server/video/project-look"
import { requireProjectBudget } from "@/server/video/project-spend"
import {
  videoActors,
  videoActorSheetPictures,
  videoAiGenerations,
  videoFirstFrames,
  type VideoActorRow,
  type VideoActorSheetPictureRow,
} from "@/server/video/schema"
import { generateImage } from "./images"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

const actorImage = alias(customShellMedia, "actor_image")
const actorReference = alias(customShellMedia, "actor_reference")

export type ActorStatus = "active" | "inactive"

/** One picture on an actor's character sheet. */
export type ActorSheetPicture = {
  id: string
  media_id: string
  url: string
  label: string | null
  /** The actor's main picture: the one on its card and sent by default. */
  main: boolean
}

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
  /** The main picture first, then the others oldest first. */
  sheet: ActorSheetPicture[]
  created_at: string
  updated_at: string
}

type SheetRow = {
  picture: VideoActorSheetPictureRow
  media: typeof customShellMedia.$inferSelect
}

export type ActorPayload = {
  name: string
  prompt: string
  model: ImageModelId
  status: ActorStatus
  tags: string
  referenceMediaId?: string | null
  referenceMediaUrl?: string | null
  /** A project whose look the picture is made in. Not kept on the actor. */
  lookProjectId?: string | null
}

function tags(value: unknown) {
  return Array.isArray(value)
    ? value.filter((tag): tag is string => typeof tag === "string")
    : []
}

/** The sheets of these actors, each oldest first. */
async function sheetRows(userId: string, actorIds: string[]) {
  const sheets = new Map<string, SheetRow[]>()
  if (!actorIds.length) return sheets
  const rows = await db
    .select({ picture: videoActorSheetPictures, media: customShellMedia })
    .from(videoActorSheetPictures)
    .innerJoin(
      customShellMedia,
      and(
        eq(videoActorSheetPictures.mediaId, customShellMedia.id),
        eq(customShellMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoActorSheetPictures.userId, userId),
        inArray(videoActorSheetPictures.actorId, actorIds)
      )
    )
    .orderBy(asc(videoActorSheetPictures.createdAt), asc(videoActorSheetPictures.id))
  for (const row of rows) {
    const sheet = sheets.get(row.picture.actorId) ?? []
    sheet.push(row)
    sheets.set(row.picture.actorId, sheet)
  }
  return sheets
}

function mainFirst(actor: VideoActorRow, sheet: SheetRow[]) {
  return [
    ...sheet.filter((row) => row.media.id === actor.imageMediaId),
    ...sheet.filter((row) => row.media.id !== actor.imageMediaId),
  ]
}

async function serializeActor(
  actor: VideoActorRow,
  image: typeof customShellMedia.$inferSelect,
  reference: typeof customShellMedia.$inferSelect | null,
  sheet: SheetRow[]
): Promise<ActorItem> {
  return {
    id: actor.id,
    name: actor.name,
    prompt: actor.prompt,
    model: actor.model as ImageModelId,
    status: actor.status as ActorStatus,
    tags: tags(actor.tags),
    image_url: (await serializeMedia(image)).url,
    image_media_id: actor.imageMediaId,
    reference_media_id: actor.referenceMediaId,
    reference_media_url: reference
      ? (await serializeMedia(reference)).url
      : null,
    sheet: await Promise.all(
      mainFirst(actor, sheet).map(async (row) => ({
        id: row.picture.id,
        media_id: row.media.id,
        url: (await serializeMedia(row.media)).url,
        label: row.picture.label,
        main: row.media.id === actor.imageMediaId,
      }))
    ),
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

async function actorItems(userId: string, actorId?: string) {
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
    .where(
      and(
        eq(videoActors.userId, userId),
        actorId ? eq(videoActors.id, actorId) : undefined
      )
    )
    .orderBy(desc(videoActors.createdAt))
  const sheets = await sheetRows(
    userId,
    rows.map((row) => row.actor.id)
  )
  return Promise.all(
    rows.map((row) =>
      serializeActor(row.actor, row.image, row.reference, sheets.get(row.actor.id) ?? [])
    )
  )
}

export async function listActors(userId: string): Promise<{ actors: ActorItem[] }> {
  return { actors: await actorItems(userId) }
}

async function getActor(userId: string, actorId: string) {
  const [actor] = await actorItems(userId, actorId)
  if (!actor) throw new Error("Actor not found")
  return actor
}

/**
 * An actor made in a project's look is made for that project: its picture goes
 * on the project's spend line and is held to the project's limit.
 */
async function lookAndBudget(userId: string, payload: ActorPayload) {
  if (payload.lookProjectId) {
    await requireProjectBudget(
      userId,
      payload.lookProjectId,
      aiUnitCostCents(payload.model, 1)
    )
  }
  return chosenProjectLook(userId, payload.lookProjectId)
}

export async function createActor(userId: string, payload: ActorPayload) {
  const name = assetName(payload.name, "Actor")
  const prompt = assetPrompt(payload.prompt)
  const reference = await referenceFor(
    userId,
    payload.referenceMediaId,
    payload.referenceMediaUrl
  )
  const look = await lookAndBudget(userId, payload)
  const generated = await generateImage({
    userId,
    model: payload.model,
    aspectRatio: "9:16",
    projectId: payload.lookProjectId,
    ...withLook(
      look,
      `Create a consistent, reusable on-camera character portrait. ${prompt}`,
      reference ? [reference] : []
    ),
  })
  const media = await saveGeneratedAsset({
    userId,
    ...generated,
    fileType: "image",
    name,
  })
  const at = now()
  const actorId = uuid()
  try {
    await db.transaction(async (tx) => {
      await tx.insert(videoActors).values({
        id: actorId,
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
      await tx.insert(videoActorSheetPictures).values({
        id: uuid(),
        userId,
        actorId,
        mediaId: media.id,
        label: null,
        createdAt: at,
      })
    })
  } catch (error) {
    await discardGeneratedAsset(media)
    throw error
  }
  return getActor(userId, actorId)
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
    const look = await lookAndBudget(userId, payload)
    const generated = await generateImage({
      userId,
      model: payload.model,
      aspectRatio: "9:16",
      projectId: payload.lookProjectId,
      ...withLook(
        look,
        `Re-pose this same character while preserving their identity. ${prompt}`,
        [reference ?? currentImage]
      ),
    })
    generatedMedia = await saveGeneratedAsset({
      userId,
      ...generated,
      fileType: "image",
      name,
    })
  }

  // A new pose joins the sheet as its main picture. The pose it replaces stays
  // on the sheet, where it can be picked again or removed.
  try {
    const at = now()
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(videoActors)
        .set({
          name,
          prompt,
          model: payload.model,
          status: payload.status,
          tags: normalizeAssetTags(payload.tags),
          imageMediaId: generatedMedia?.id ?? current.imageMediaId,
          referenceMediaId: reference?.id ?? null,
          updatedAt: at,
        })
        .where(and(eq(videoActors.id, actorId), eq(videoActors.userId, userId)))
        .returning({ id: videoActors.id })
      if (!updated) throw new Error("Actor not found")
      if (generatedMedia) {
        await tx.insert(videoActorSheetPictures).values({
          id: uuid(),
          userId,
          actorId,
          mediaId: generatedMedia.id,
          label: null,
          createdAt: at,
        })
      }
    })
  } catch (error) {
    if (generatedMedia) await discardGeneratedAsset(generatedMedia)
    throw error
  }
  return getActor(userId, actorId)
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

function sheetLabel(label: string | null | undefined) {
  return label?.trim().replace(/\s+/g, " ").slice(0, MAX_SHEET_LABEL_LENGTH) || null
}

async function ownedSheetPicture(userId: string, pictureId: string) {
  const [row] = await db
    .select()
    .from(videoActorSheetPictures)
    .where(
      and(
        eq(videoActorSheetPictures.id, pictureId),
        eq(videoActorSheetPictures.userId, userId)
      )
    )
    .limit(1)
  if (!row) throw new Error(SHEET_PICTURE_NOT_FOUND_MESSAGE)
  return row
}

/** Puts one of this person's Media pictures on an actor's sheet. */
export async function addSheetPicture(
  userId: string,
  actorId: string,
  picture: { mediaId?: string | null; mediaUrl?: string | null; label?: string | null }
) {
  const actor = await requireOwnedActor(userId, actorId)
  const media = await referenceFor(userId, picture.mediaId, picture.mediaUrl)
  if (!media) throw new Error("Media not found")
  const [{ pictures }] = await db
    .select({ pictures: count() })
    .from(videoActorSheetPictures)
    .where(eq(videoActorSheetPictures.actorId, actor.id))
  if (pictures >= MAX_SHEET_PICTURES) throw new Error(SHEET_FULL_MESSAGE)
  const added = await db
    .insert(videoActorSheetPictures)
    .values({
      id: uuid(),
      userId,
      actorId: actor.id,
      mediaId: media.id,
      label: sheetLabel(picture.label),
      createdAt: now(),
    })
    .onConflictDoNothing()
    .returning({ id: videoActorSheetPictures.id })
  if (!added.length) throw new Error(SHEET_DUPLICATE_MESSAGE)
  return getActor(userId, actor.id)
}

/** Names one sheet picture, such as "Side". An empty name clears it. */
export async function labelSheetPicture(
  userId: string,
  pictureId: string,
  label: string | null
) {
  const [row] = await db
    .update(videoActorSheetPictures)
    .set({ label: sheetLabel(label) })
    .where(
      and(
        eq(videoActorSheetPictures.id, pictureId),
        eq(videoActorSheetPictures.userId, userId)
      )
    )
    .returning({ actorId: videoActorSheetPictures.actorId })
  if (!row) throw new Error(SHEET_PICTURE_NOT_FOUND_MESSAGE)
  return getActor(userId, row.actorId)
}

/**
 * Makes one sheet picture the actor's main picture: the one on its card, on
 * the projects list, and sent first to every first frame. The actor's row is
 * locked first and the picture looked for again, so a removal of the same
 * picture at the same moment cannot leave a main picture off the sheet.
 */
export async function makeMainSheetPicture(userId: string, pictureId: string) {
  const picture = await ownedSheetPicture(userId, pictureId)
  await db.transaction(async (tx) => {
    await tx
      .select({ id: videoActors.id })
      .from(videoActors)
      .where(
        and(eq(videoActors.id, picture.actorId), eq(videoActors.userId, userId))
      )
      .for("update")
    const [still] = await tx
      .select({ id: videoActorSheetPictures.id })
      .from(videoActorSheetPictures)
      .where(eq(videoActorSheetPictures.id, picture.id))
    if (!still) throw new Error(SHEET_PICTURE_NOT_FOUND_MESSAGE)
    await tx
      .update(videoActors)
      .set({ imageMediaId: picture.mediaId, updatedAt: now() })
      .where(
        and(eq(videoActors.id, picture.actorId), eq(videoActors.userId, userId))
      )
  })
  return getActor(userId, picture.actorId)
}

/**
 * Takes a picture off the sheet. The file stays in Media. The main picture is
 * refused, so an actor always has one; the actor's row is locked while this
 * is checked, so a main picture chosen at the same moment cannot slip past.
 */
export async function removeSheetPicture(userId: string, pictureId: string) {
  const picture = await ownedSheetPicture(userId, pictureId)
  await db.transaction(async (tx) => {
    const [actor] = await tx
      .select({ imageMediaId: videoActors.imageMediaId })
      .from(videoActors)
      .where(
        and(eq(videoActors.id, picture.actorId), eq(videoActors.userId, userId))
      )
      .for("update")
    if (!actor) throw new Error("Actor not found")
    if (actor.imageMediaId === picture.mediaId) {
      throw new Error(MAIN_PICTURE_REMOVE_MESSAGE)
    }
    await tx
      .delete(videoActorSheetPictures)
      .where(eq(videoActorSheetPictures.id, picture.id))
  })
  return getActor(userId, picture.actorId)
}

/**
 * The actor's pictures a first frame is drawn from, in the order they are
 * sent: the picked sheet pictures with the main one first, or the main picture
 * alone when none were picked.
 */
export async function sheetPicturesToSend(
  userId: string,
  actor: VideoActorRow,
  pictureIds?: string[] | null
) {
  const ids = [...new Set(pictureIds ?? [])]
  if (!ids.length) return [await getOwnedMedia(userId, actor.imageMediaId)]
  const sheet = (await sheetRows(userId, [actor.id])).get(actor.id) ?? []
  const picked = sheet.filter((row) => ids.includes(row.picture.id))
  if (picked.length !== ids.length) {
    throw new Error(SHEET_PICTURE_NOT_FOUND_MESSAGE)
  }
  return mainFirst(actor, picked).map((row) => row.media)
}

/** Each actor's sheet as label and Media id, for naming what a frame used. */
export async function sheetLabels(userId: string, actorIds: string[]) {
  const sheets = await sheetRows(userId, actorIds)
  return new Map(
    [...sheets].map(([actorId, rows]) => [
      actorId,
      rows.map((row) => ({ mediaId: row.media.id, label: row.picture.label })),
    ])
  )
}
