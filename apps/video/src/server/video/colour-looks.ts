import { and, asc, count, eq } from "drizzle-orm"

import {
  COLOUR_LOOK_NAME_MAX,
  COLOUR_LOOKS_FULL_MESSAGE,
  COLOUR_LOOK_NAME_MESSAGE,
  MAX_COLOUR_LOOKS,
  type SavedColourLook,
} from "@/lib/video/colour-looks"
import { clipLook } from "@/lib/video/film-looks"
import {
  MAX_CLIP_BRIGHTNESS,
  MAX_CLIP_CONTRAST,
  MAX_CLIP_SATURATION,
  MIN_CLIP_BRIGHTNESS,
  MIN_CLIP_CONTRAST,
  MIN_CLIP_SATURATION,
} from "@/lib/video/clip-colour"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoColourLooks } from "@/server/video/schema"

/**
 * Each person's own colour looks (workspace/docs/colour-looks.md): a film look
 * and the three colour sliders under a name, kept per person so they follow
 * them into every project. Saving a name they already have replaces it.
 */

function serialize(row: typeof videoColourLooks.$inferSelect): SavedColourLook {
  return {
    id: row.id,
    name: row.name,
    look: clipLook({ look: row.look ?? undefined }),
    brightness: row.brightness,
    contrast: row.contrast,
    saturation: row.saturation,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export async function listColourLooks(userId: string, database: CustomShellDb = db) {
  const rows = await database
    .select()
    .from(videoColourLooks)
    .where(eq(videoColourLooks.userId, userId))
    .orderBy(asc(videoColourLooks.name))
  return rows.map(serialize)
}

export async function saveColourLook(
  userId: string,
  input: Omit<SavedColourLook, "id">,
  database: CustomShellDb = db
) {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, COLOUR_LOOK_NAME_MAX)
  if (!name) throw new Error(COLOUR_LOOK_NAME_MESSAGE)
  const values = {
    look: clipLook({ look: input.look ?? undefined }),
    brightness: clamp(input.brightness, MIN_CLIP_BRIGHTNESS, MAX_CLIP_BRIGHTNESS),
    contrast: clamp(input.contrast, MIN_CLIP_CONTRAST, MAX_CLIP_CONTRAST),
    saturation: clamp(input.saturation, MIN_CLIP_SATURATION, MAX_CLIP_SATURATION),
  }
  const [existing] = await database
    .select({ id: videoColourLooks.id })
    .from(videoColourLooks)
    .where(and(eq(videoColourLooks.userId, userId), eq(videoColourLooks.name, name)))
    .limit(1)
  const at = now()
  if (existing) {
    const [row] = await database
      .update(videoColourLooks)
      .set({ ...values, updatedAt: at })
      .where(eq(videoColourLooks.id, existing.id))
      .returning()
    return serialize(row)
  }
  const [{ total }] = await database
    .select({ total: count() })
    .from(videoColourLooks)
    .where(eq(videoColourLooks.userId, userId))
  if (total >= MAX_COLOUR_LOOKS) throw new Error(COLOUR_LOOKS_FULL_MESSAGE)
  const [row] = await database
    .insert(videoColourLooks)
    .values({ id: uuid(), userId, name, ...values, createdAt: at, updatedAt: at })
    .returning()
  return serialize(row)
}

/** Deletes one of the person's own looks. Clips that used it keep their colour. */
export async function deleteColourLook(userId: string, id: string, database: CustomShellDb = db) {
  await database
    .delete(videoColourLooks)
    .where(and(eq(videoColourLooks.id, id), eq(videoColourLooks.userId, userId)))
}
