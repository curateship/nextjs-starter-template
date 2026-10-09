import { asc, eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { pomodoroCatalogItems } from "@/server/pomodoro/schema"
import type {
  CatalogSound,
  CatalogTheme,
  MediaCatalog,
} from "@/lib/pomodoro/catalog"

/**
 * The Live themes and sounds, as every page and every save reads them. See
 * `workspace/docs/catalog-admin.md`.
 *
 * Only a Live item with a finished file is in it. A Draft, or a new item
 * whose first file is still being re-encoded or was refused, is left out, so
 * to a member it simply does not exist: a room that picked it falls back to
 * the default scene or to silence, and saving it is refused. A Live item whose
 * file is being replaced keeps its old file until the new one is finished.
 *
 * Every page load reads this, so it is held for a few seconds. An admin's own
 * change drops it at once (`forgetMediaCatalog`), so their next page shows it.
 */

const CACHE_MS = 5_000

// Held with the database it came from, so a test's fresh database, or any
// caller naming another one, never reads a list from somewhere else.
let cached: { from: CustomShellDb; at: number; catalog: MediaCatalog } | null =
  null

export function forgetMediaCatalog() {
  cached = null
}

export async function loadMediaCatalog(
  database: CustomShellDb = db
): Promise<MediaCatalog> {
  if (cached && cached.from === database && Date.now() - cached.at < CACHE_MS)
    return cached.catalog
  const rows = await database
    .select()
    .from(pomodoroCatalogItems)
    .where(eq(pomodoroCatalogItems.status, "live"))
    .orderBy(
      asc(pomodoroCatalogItems.position),
      asc(pomodoroCatalogItems.createdAt)
    )

  const themes: CatalogTheme[] = []
  const sounds: CatalogSound[] = []
  for (const row of rows) {
    const publishedAt = row.publishedAt?.toISOString() ?? null
    if (row.kind === "theme") {
      // A theme is drawn from its still at the very least.
      if (!row.pictureUrl) continue
      themes.push({
        key: row.key,
        label: row.label,
        hint: row.hint,
        descriptor: row.descriptor,
        locked: row.locked,
        tags: row.tags,
        stillUrl: row.pictureUrl,
        videoUrl: row.fileUrl,
        publishedAt,
      })
    } else {
      if (!row.fileUrl) continue
      sounds.push({
        key: row.key,
        label: row.label,
        hint: row.hint,
        descriptor: row.descriptor,
        locked: row.locked,
        tags: row.tags,
        fileUrl: row.fileUrl,
        pictureUrl: row.pictureUrl,
        volume: row.volume,
        publishedAt,
      })
    }
  }
  const catalog = { themes, sounds }
  cached = { from: database, at: Date.now(), catalog }
  return catalog
}
