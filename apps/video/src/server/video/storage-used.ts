import { sql } from "drizzle-orm"

import type { AppStorageUse } from "@/server/app-options"
import { db, type CustomShellDb } from "@/server/db"

/**
 * What Video keeps in the bucket beside the library's own files, for the
 * Media library's storage total (`media.storageUsed` in
 * `src/app/server-options.ts`). The smooth copy is the one that counts: it is
 * about a tenth of the original, where frames and waveforms are a few
 * hundred kilobytes.
 */
export async function videoStorageUsed(
  ownerId: string | null,
  database: CustomShellDb = db
): Promise<AppStorageUse[]> {
  const result = await database.execute(sql`
    select coalesce(sum(p.file_size), 0)::bigint as bytes
    from video_media_proxies p
    join media m on m.id = p.media_id
    where p.status = 'ready'
      ${ownerId ? sql`and m.user_id = ${ownerId}` : sql``}
  `)
  const bytes = Number((result.rows[0] as { bytes?: string | number } | undefined)?.bytes ?? 0)
  return [{ label: "Smooth copies", bytes }]
}
