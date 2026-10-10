import { eq, ilike, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { freshKey, logCatalogAct } from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { readPixabayKey } from "@/server/pomodoro/pixabay-key"
import { pomodoroCatalogItems } from "@/server/pomodoro/schema"
import type { CatalogKind } from "@/lib/pomodoro/admin-catalog"
import {
  pixabayItemKey,
  readPixabayAddress,
  readPixabayLines,
  type PixabayLine,
} from "@/lib/pomodoro/pixabay-links"

/**
 * "Import from Pixabay": one Draft per pasted link, with its name, source
 * link and licence filled in. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * A picture or film row waits for the `pomodoro-pixabay-imports` worker with
 * `import_url` set (`pixabay-worker.ts`). A music or sound-effect row is made
 * whole at once and waits for its file instead, because Pixabay has no music
 * API and refuses a server that asks for its pages (Tyler, 9 Oct 2026: "a
 * music link makes a half-way Draft").
 */

export const PIXABAY_LICENCE_NOTE = "Pixabay Content Licence"

export type PixabayImportResult = {
  added: number
  refused: { line: number; reason: string }[]
}

export async function importFromPixabay({
  kind,
  links,
  actorUserId,
}: {
  kind: CatalogKind
  links: PixabayLine[]
  actorUserId: string
}): Promise<PixabayImportResult> {
  // Only a picture or film is fetched, so only Themes needs the key. A key
  // that can no longer be unscrambled throws here and is worded by the caller.
  if (kind === "theme" && !(await readPixabayKey())) throw new Error("PIXABAY_KEY_MISSING")

  const read = readPixabayLines(links, kind)
  const refused: PixabayImportResult["refused"] = []

  const added = await db.transaction(async (tx) => {
    // Every Pixabay item already in the catalogue, in any state and of either
    // kind, by the source link each row was made with.
    const existing = await tx
      .select({ label: pomodoroCatalogItems.label, sourceUrl: pomodoroCatalogItems.sourceUrl })
      .from(pomodoroCatalogItems)
      .where(ilike(pomodoroCatalogItems.sourceUrl, "%pixabay.com/%"))
    const known = new Map<string, string>()
    for (const row of existing) {
      const address = row.sourceUrl ? readPixabayAddress(row.sourceUrl) : null
      if (address?.ok) known.set(pixabayItemKey(address.link), row.label)
    }

    const [last] = await tx
      .select({
        position: sql<number>`coalesce(max(${pomodoroCatalogItems.position}), -1)::int`,
      })
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.kind, kind))
    let position = (last?.position ?? -1) + 1

    const ids: string[] = []
    for (const entry of read) {
      if (!entry.ok) {
        refused.push({ line: entry.line, reason: entry.reason })
        continue
      }
      const { link } = entry
      const already = known.get(pixabayItemKey(link))
      if (already !== undefined) {
        refused.push({ line: entry.line, reason: `is already in the catalogue as ${already}` })
        continue
      }
      const fetched = link.family !== "audio"
      const [row] = await tx
        .insert(pomodoroCatalogItems)
        .values({
          kind,
          key: await freshKey(tx, kind, link.label),
          label: link.label,
          descriptor: link.descriptor,
          status: "draft",
          position: position++,
          sourceUrl: link.pageUrl,
          // A sound has no picture, and a theme's arrives with its file.
          pictureUrl: null,
          licence: "free",
          licenceNote: PIXABAY_LICENCE_NOTE,
          // A sound has nothing to fetch: it is ready, with no file, until
          // the admin drops the MP3 in its window.
          fileStatus: fetched ? "queued" : "ready",
          sourceKind: fetched ? (link.family === "video" ? "video" : "image") : null,
          importUrl: fetched ? link.pageUrl : null,
        })
        .returning({ id: pomodoroCatalogItems.id })
      ids.push(row.id)
    }
    await logCatalogAct(tx, actorUserId, "catalog_import", ids)
    return ids.length
  })

  if (added) forgetMediaCatalog()
  return { added, refused }
}
