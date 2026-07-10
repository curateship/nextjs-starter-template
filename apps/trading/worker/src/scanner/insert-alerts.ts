import { sql } from "drizzle-orm"

import { db } from "@/server/db"
import { scannerAlerts } from "@/server/schema"
import { now, uuid } from "@/server/util"
import type { AlertDraft } from "./alert-engine"

/**
 * Persists alert drafts, deduped on dedupeKey — the one place scanner
 * modules write to scanner_alerts.
 */
export async function insertAlerts(
  drafts: AlertDraft[],
  createdAt: Date = now()
) {
  if (drafts.length === 0) return
  await db
    .insert(scannerAlerts)
    .values(
      drafts.map((draft) => ({
        id: uuid(),
        type: draft.type,
        coin: draft.coin ?? null,
        address: draft.address ?? null,
        title: draft.title,
        body: draft.body ?? null,
        data: draft.data ?? null,
        dedupeKey: draft.dedupeKey,
        createdAt,
      }))
    )
    .onConflictDoNothing({
      target: scannerAlerts.dedupeKey,
      where: sql`dedupe_key is not null`,
    })
}
