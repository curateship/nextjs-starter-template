import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { CATALOG_MAX_ATTEMPTS, type Transaction } from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { pomodoroCatalogItems, type PomodoroCatalogItem } from "@/server/pomodoro/schema"

/**
 * The queue a catalogue row waits in while its file is fetched from a link:
 * a Pixabay picture or film (`pixabay-worker.ts`) or a YouTube clip
 * (`youtube-worker.ts`). The row's `import_url` holds the link until the file
 * arrives.
 *
 * Each worker claims only links that start with its own prefix, so neither
 * ever takes the other's row and fails it as a link it cannot read.
 */

export type LinkImportJob = PomodoroCatalogItem & { importUrl: string }

export async function claimNextLinkImport({
  prefix,
  timeoutMs,
  gaveUp,
}: {
  /** Only rows whose `import_url` starts with this. */
  prefix: string
  /** Longer than the slowest fetch, so a live job is never stolen. */
  timeoutMs: number
  /** What the row says once a dead worker has used up its tries. */
  gaveUp: string
}): Promise<LinkImportJob | null> {
  const staleBefore = new Date(Date.now() - timeoutMs)
  const ours = sql`${pomodoroCatalogItems.importUrl} like ${`${prefix}%`}`
  // A job whose worker died never reached its own failure handling.
  const dead = await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "failed",
      fileError: gaveUp,
      importUrl: null,
      sourceKind: null,
      claimedAt: null,
    })
    .where(
      and(
        ours,
        eq(pomodoroCatalogItems.fileStatus, "processing"),
        sql`${pomodoroCatalogItems.claimedAt} < ${staleBefore}`,
        sql`${pomodoroCatalogItems.attempts} >= ${CATALOG_MAX_ATTEMPTS}`
      )
    )
    .returning({ id: pomodoroCatalogItems.id })
  if (dead.length) forgetMediaCatalog()
  const [claimed] = await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "processing",
      claimedAt: new Date(),
      attempts: sql`${pomodoroCatalogItems.attempts} + 1`,
    })
    .where(
      eq(
        pomodoroCatalogItems.id,
        sql`(
          select ${pomodoroCatalogItems.id} from ${pomodoroCatalogItems}
          where ${ours} and (
            ${pomodoroCatalogItems.fileStatus} = 'queued'
            or (${pomodoroCatalogItems.fileStatus} = 'processing'
              and ${pomodoroCatalogItems.claimedAt} < ${staleBefore}
              and ${pomodoroCatalogItems.attempts} < ${CATALOG_MAX_ATTEMPTS})
          )
          order by ${pomodoroCatalogItems.createdAt}
          limit 1
          for update skip locked
        )`
      )
    )
    .returning()
  return claimed?.importUrl ? (claimed as LinkImportJob) : null
}

/** The row as it is now, while it still waits on this same import. */
export async function lockedLinkImportRow(tx: Transaction, job: LinkImportJob) {
  const [row] = await tx
    .select()
    .from(pomodoroCatalogItems)
    .where(
      and(
        eq(pomodoroCatalogItems.id, job.id),
        eq(pomodoroCatalogItems.importUrl, job.importUrl)
      )
    )
    .for("update")
    .limit(1)
  return row ?? null
}

/** Back in the queue. A throttled try gives its attempt back, so a busy minute burns nothing. */
export async function putBackLinkImport(job: LinkImportJob, { refund }: { refund: boolean }) {
  await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "queued",
      claimedAt: null,
      ...(refund ? { attempts: sql`greatest(${pomodoroCatalogItems.attempts} - 1, 0)` } : {}),
    })
    .where(
      and(
        eq(pomodoroCatalogItems.id, job.id),
        eq(pomodoroCatalogItems.importUrl, job.importUrl)
      )
    )
}

/** No more tries: the row says why, and the admin can upload a file of their own. */
export async function failLinkImport(job: LinkImportJob, reason: string) {
  await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "failed",
      fileError: reason.slice(0, 300),
      importUrl: null,
      sourceKind: null,
      claimedAt: null,
    })
    .where(
      and(
        eq(pomodoroCatalogItems.id, job.id),
        eq(pomodoroCatalogItems.importUrl, job.importUrl)
      )
    )
}
