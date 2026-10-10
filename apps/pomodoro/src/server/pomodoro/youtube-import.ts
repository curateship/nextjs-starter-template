import { eq, or, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { freshKey, logCatalogAct } from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { pomodoroCatalogItems } from "@/server/pomodoro/schema"
import {
  readYoutubeClipRequest,
  YOUTUBE_CLIP_PLACEHOLDER,
} from "@/lib/pomodoro/youtube-links"

/**
 * "Make a theme from a YouTube clip": one Draft theme that waits for the
 * `pomodoro-youtube-imports` worker with `import_url` set
 * (`youtube-worker.ts`). See "Make a theme from a YouTube clip" in
 * `workspace/docs/catalog-admin.md`. Admins only (Tyler, 10 Oct 2026).
 *
 * The licence is "other", never "free": a YouTube video belongs to whoever
 * posted it, so the admin sets the licence on purpose before it goes Live.
 */

export const YOUTUBE_LICENCE_NOTE = "From YouTube"

export type YoutubeImportResult =
  | { ok: true }
  | { ok: false; field: "link" | "start"; reason: string }

export async function importThemeFromYoutube({
  link,
  start,
  actorUserId,
}: {
  link: string
  start: string
  actorUserId: string
}): Promise<YoutubeImportResult> {
  const request = readYoutubeClipRequest(link, start)
  if (!request.ok) return request

  const result = await db.transaction(async (tx): Promise<YoutubeImportResult> => {
    // The same video at the same start, in any state. Another start of the
    // same video is another scene, so it is let through.
    const [already] = await tx
      .select({ label: pomodoroCatalogItems.label })
      .from(pomodoroCatalogItems)
      .where(
        or(
          eq(pomodoroCatalogItems.sourceUrl, request.address),
          eq(pomodoroCatalogItems.importUrl, request.address)
        )
      )
      .limit(1)
    if (already)
      return {
        ok: false,
        field: "link",
        reason: `That stretch is already in the catalogue as ${already.label}.`,
      }

    const [last] = await tx
      .select({
        position: sql<number>`coalesce(max(${pomodoroCatalogItems.position}), -1)::int`,
      })
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.kind, "theme"))
    const [row] = await tx
      .insert(pomodoroCatalogItems)
      .values({
        kind: "theme",
        key: await freshKey(tx, "theme", YOUTUBE_CLIP_PLACEHOLDER),
        label: YOUTUBE_CLIP_PLACEHOLDER,
        descriptor: "video",
        status: "draft",
        position: (last?.position ?? -1) + 1,
        sourceUrl: request.address,
        licence: "other",
        licenceNote: YOUTUBE_LICENCE_NOTE,
        fileStatus: "queued",
        sourceKind: "video",
        importUrl: request.address,
      })
      .returning({ id: pomodoroCatalogItems.id })
    await logCatalogAct(tx, actorUserId, "catalog_import", [row.id])
    return { ok: true }
  })

  if (result.ok) forgetMediaCatalog()
  return result
}
