import { and, desc, eq, inArray } from "drizzle-orm"

import {
  assetName,
  assetPrompt,
  DEFAULT_IMAGE_MODEL,
} from "@/lib/video/asset-factories"
import {
  EXTRA_KINDS,
  EXTRA_NOT_FOUND_MESSAGE,
  EXTRA_PICTURE_MISSING_MESSAGE,
  extraDrawPrompt,
  sendingOrder,
  type ExtraKind,
  type ExtraPicks,
  type SentExtra,
} from "@/lib/video/extras"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { findOwnedImageByUrl, serializeMedia } from "@/server/media/library"
import { customShellMedia } from "@/server/schema"
import { videoExtras, videoProjects, type VideoExtraRow } from "@/server/video/schema"
import { generateImage } from "./images"
import { discardGeneratedAsset, saveGeneratedAsset } from "./media"

type MediaRow = typeof customShellMedia.$inferSelect

export type ExtraItem = {
  id: string
  kind: ExtraKind
  name: string
  prompt: string
  image_url: string
  image_media_id: string
  created_at: string
  updated_at: string
}

export type ExtraPayload = {
  kind: ExtraKind
  name: string
  prompt: string
  /** The picture the Media picker handed back. Ignored when drawing. */
  imageMediaUrl?: string | null
}

async function serializeExtra(extra: VideoExtraRow, image: MediaRow): Promise<ExtraItem> {
  return {
    id: extra.id,
    kind: extra.kind as ExtraKind,
    name: extra.name,
    prompt: extra.prompt,
    image_url: (await serializeMedia(image)).url,
    image_media_id: extra.imageMediaId,
    created_at: extra.createdAt.toISOString(),
    updated_at: extra.updatedAt.toISOString(),
  }
}

function extraRows(userId: string, extraIds?: string[]) {
  return db
    .select({ extra: videoExtras, image: customShellMedia })
    .from(videoExtras)
    .innerJoin(
      customShellMedia,
      and(
        eq(videoExtras.imageMediaId, customShellMedia.id),
        eq(customShellMedia.userId, userId)
      )
    )
    .where(
      and(
        eq(videoExtras.userId, userId),
        extraIds ? inArray(videoExtras.id, extraIds) : undefined
      )
    )
    .orderBy(desc(videoExtras.createdAt), desc(videoExtras.id))
}

/** Every extra this person has, newest first. */
export async function listExtras(userId: string): Promise<{ extras: ExtraItem[] }> {
  const rows = await extraRows(userId)
  return {
    extras: await Promise.all(rows.map((row) => serializeExtra(row.extra, row.image))),
  }
}

async function getExtra(userId: string, extraId: string) {
  const [row] = await extraRows(userId, [extraId])
  if (!row) throw new Error(EXTRA_NOT_FOUND_MESSAGE)
  return serializeExtra(row.extra, row.image)
}

/** The picture an extra keeps: one picked from this person's Media, or drawn. */
async function pictureFor(userId: string, payload: ExtraPayload, draw: boolean) {
  if (draw) {
    const generated = await generateImage({
      userId,
      model: DEFAULT_IMAGE_MODEL,
      aspectRatio: "9:16",
      prompt: extraDrawPrompt(payload.kind, assetPrompt(payload.prompt)),
      references: [],
    })
    const media = await saveGeneratedAsset({
      userId,
      ...generated,
      fileType: "image",
      name: assetName(payload.name, "Extra"),
    })
    return { mediaId: media.id, drawn: media }
  }
  const picked = payload.imageMediaUrl
    ? await findOwnedImageByUrl(userId, payload.imageMediaUrl)
    : null
  if (!picked) throw new Error(EXTRA_PICTURE_MISSING_MESSAGE)
  return { mediaId: picked.id, drawn: null }
}

export async function createExtra(userId: string, payload: ExtraPayload, draw: boolean) {
  const name = assetName(payload.name, "Extra")
  const prompt = assetPrompt(payload.prompt)
  const picture = await pictureFor(userId, payload, draw)
  const at = now()
  const id = uuid()
  try {
    await db.insert(videoExtras).values({
      id,
      userId,
      kind: payload.kind,
      name,
      prompt,
      imageMediaId: picture.mediaId,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    if (picture.drawn) await discardGeneratedAsset(picture.drawn)
    throw error
  }
  return getExtra(userId, id)
}

/**
 * Saves an extra's name, description and picture. Drawing again makes a new
 * picture; the one it replaces stays in Media. The kind never changes.
 */
export async function updateExtra(
  userId: string,
  extraId: string,
  payload: Omit<ExtraPayload, "kind">,
  draw: boolean
) {
  const [current] = await db
    .select()
    .from(videoExtras)
    .where(and(eq(videoExtras.id, extraId), eq(videoExtras.userId, userId)))
    .limit(1)
  if (!current) throw new Error(EXTRA_NOT_FOUND_MESSAGE)
  const name = assetName(payload.name, "Extra")
  const prompt = assetPrompt(payload.prompt)
  const picture = await pictureFor(
    userId,
    { ...payload, kind: current.kind as ExtraKind },
    draw
  )
  try {
    const [updated] = await db
      .update(videoExtras)
      .set({ name, prompt, imageMediaId: picture.mediaId, updatedAt: now() })
      .where(and(eq(videoExtras.id, extraId), eq(videoExtras.userId, userId)))
      .returning({ id: videoExtras.id })
    if (!updated) throw new Error(EXTRA_NOT_FOUND_MESSAGE)
  } catch (error) {
    if (picture.drawn) await discardGeneratedAsset(picture.drawn)
    throw error
  }
  return getExtra(userId, extraId)
}

/** Deletes extras and never their files, which stay in Media. */
export async function deleteExtras(userId: string, extraIds: string[]) {
  const ids = [...new Set(extraIds)]
  if (!ids.length) return { deleted_ids: [] as string[] }
  const rows = await db
    .delete(videoExtras)
    .where(and(eq(videoExtras.userId, userId), inArray(videoExtras.id, ids)))
    .returning({ id: videoExtras.id })
  return { deleted_ids: rows.map((row) => row.id) }
}

/** Only known kinds and string ids, whatever a stored or sent value holds. */
function cleanPicks(value: unknown): ExtraPicks {
  if (!value || typeof value !== "object") return {}
  const picks: ExtraPicks = {}
  for (const kind of EXTRA_KINDS) {
    const id = (value as Record<string, unknown>)[kind]
    if (typeof id === "string" && id) picks[kind] = id
  }
  return picks
}

/**
 * The picked extras, each checked to be this person's and of the kind it was
 * picked as, in the order they are sent, with the picture each sends.
 */
export async function extrasToSend(userId: string, picks: ExtraPicks | null | undefined) {
  const wanted = cleanPicks(picks)
  const ids = Object.values(wanted)
  if (!ids.length) return []
  const rows = await extraRows(userId, ids)
  const found = EXTRA_KINDS.flatMap((kind) => {
    const row = rows.find(
      (candidate) => candidate.extra.id === wanted[kind] && candidate.extra.kind === kind
    )
    return row ? [{ kind, extra: row.extra, media: row.image }] : []
  })
  if (found.length !== ids.length) throw new Error(EXTRA_NOT_FOUND_MESSAGE)
  return sendingOrder(found)
}

/** The record of what was sent, kept on a frame and on each piece of a shot. */
export function sentExtras(
  extras: Awaited<ReturnType<typeof extrasToSend>>
): SentExtra[] {
  return extras.map((item) => ({
    kind: item.kind,
    extra_id: item.extra.id,
    media_id: item.media.id,
  }))
}

/** Names and descriptions of these extras as they are today, for prompts and rows. */
export async function extrasByIds(userId: string, extraIds: string[]) {
  const ids = [...new Set(extraIds)]
  if (!ids.length) return []
  return db
    .select({ id: videoExtras.id, name: videoExtras.name, prompt: videoExtras.prompt })
    .from(videoExtras)
    .where(and(eq(videoExtras.userId, userId), inArray(videoExtras.id, ids)))
}

/**
 * A project's picked extras. An extra deleted since, or one no longer of
 * the kind it was picked as, is passed over.
 */
export async function readProjectExtraPicks(userId: string, projectId: string) {
  const [project] = await db
    .select({ picks: videoProjects.extraPicks })
    .from(videoProjects)
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  const stored = cleanPicks(project.picks)
  const ids = Object.values(stored)
  if (!ids.length) return { picks: {} as ExtraPicks }
  const rows = await db
    .select({ id: videoExtras.id, kind: videoExtras.kind })
    .from(videoExtras)
    .where(and(eq(videoExtras.userId, userId), inArray(videoExtras.id, ids)))
  const picks: ExtraPicks = {}
  for (const kind of EXTRA_KINDS) {
    if (rows.some((row) => row.id === stored[kind] && row.kind === kind)) {
      picks[kind] = stored[kind]
    }
  }
  return { picks }
}

/** Saves a project's picks as they now stand. Each one must be this person's. */
export async function saveProjectExtraPicks(
  userId: string,
  projectId: string,
  picks: ExtraPicks
) {
  const sent = await extrasToSend(userId, picks)
  const clean: ExtraPicks = Object.fromEntries(
    sent.map((item) => [item.kind, item.extra.id])
  )
  const [updated] = await db
    .update(videoProjects)
    .set({ extraPicks: clean })
    .where(and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId)))
    .returning({ id: videoProjects.id })
  if (!updated) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  return { picks: clean }
}
