import { eq } from "drizzle-orm"

import {
  createDefaultBrandKit,
  normalizeBrandKit,
  type VideoBrandKit,
} from "@/lib/video/brand-kit"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { videoSettings } from "@/server/video/schema"

/**
 * The install's brand kit. One row, id `default`, written the first time
 * somebody saves — until then every reader gets the built-in kit, so the editor
 * has colours and fonts to draw with on a brand new install.
 */

const SETTINGS_ROW_ID = "default"

export async function getVideoBrandKit(
  database: CustomShellDb = db
): Promise<VideoBrandKit> {
  const [row] = await database
    .select()
    .from(videoSettings)
    .where(eq(videoSettings.id, SETTINGS_ROW_ID))
    .limit(1)
  return row ? normalizeBrandKit(row.brandKit) : createDefaultBrandKit()
}

export async function saveVideoBrandKit(
  value: unknown,
  database: CustomShellDb = db
): Promise<VideoBrandKit> {
  const brandKit = normalizeBrandKit(value)
  const timestamp = now()
  await database
    .insert(videoSettings)
    .values({
      id: SETTINGS_ROW_ID,
      brandKit,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: videoSettings.id,
      set: { brandKit, updatedAt: timestamp },
    })
  return brandKit
}
