import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import {
  CATALOG_MAX_ATTEMPTS,
  cleanTags,
  removeFiles,
  storeCatalogBytes,
  type Transaction,
} from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import {
  downloadPixabayFile,
  fetchPixabayImage,
  fetchPixabayVideo,
  pickPixabayRendition,
  PixabayKeyRefusedError,
  PixabayNotFoundError,
  PixabayRateLimitedError,
} from "@/server/pomodoro/pixabay"
import { PIXABAY_LICENCE_NOTE } from "@/server/pomodoro/pixabay-import"
import { readPixabayKey } from "@/server/pomodoro/pixabay-key"
import { pomodoroCatalogItems, type PomodoroCatalogItem } from "@/server/pomodoro/schema"
import { uploadLimitBytes } from "@/lib/pomodoro/media-limits"
import { readPixabayAddress } from "@/lib/pomodoro/pixabay-links"

/**
 * The `pomodoro-pixabay-imports` worker: fetches the picture or film behind a
 * row "Import from Pixabay" made. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * A picture becomes the theme's still at once. A film is copied into the
 * bucket and handed to the catalogue worker, which shrinks it to 720p and
 * takes its first frame as the still, the same as an upload. Up to five
 * pictures or one film per pass of the shell's fifteen-second loop, so 25
 * photos take about a minute.
 *
 * A music link never reaches here: nothing is fetched for a sound.
 */

/** A picture takes seconds and a 100 MB film a few minutes; a live job is never stolen. */
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000
const STILLS_PER_PASS = 5
const GAVE_UP = "Pixabay's file could not be fetched"

type Job = PomodoroCatalogItem & { importUrl: string }

export async function processPixabayImports() {
  for (let done = 0; done < STILLS_PER_PASS; done += 1) {
    const job = await claimNextPixabayImport()
    if (!job) return
    const outcome = await processPixabayImport(job)
    // A throttled minute or a row put back for another try ends the pass, so
    // the next try waits for the next pass instead of following at once and
    // spending all three tries on one blip.
    if (outcome === "again" || job.sourceKind === "video") return
  }
}

async function claimNextPixabayImport(): Promise<Job | null> {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS)
  // A job whose worker died never reached its own failure handling.
  const gaveUp = await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "failed",
      fileError: GAVE_UP,
      importUrl: null,
      sourceKind: null,
      claimedAt: null,
    })
    .where(
      and(
        sql`${pomodoroCatalogItems.importUrl} is not null`,
        eq(pomodoroCatalogItems.fileStatus, "processing"),
        sql`${pomodoroCatalogItems.claimedAt} < ${staleBefore}`,
        sql`${pomodoroCatalogItems.attempts} >= ${CATALOG_MAX_ATTEMPTS}`
      )
    )
    .returning({ id: pomodoroCatalogItems.id })
  if (gaveUp.length) forgetMediaCatalog()
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
          where ${pomodoroCatalogItems.importUrl} is not null and (
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
  return claimed?.importUrl ? (claimed as Job) : null
}

type Credits = { user: string; pageURL: string; tags: string }

async function processPixabayImport(job: Job): Promise<"done" | "again"> {
  const address = readPixabayAddress(job.importUrl)
  if (!address.ok) {
    await failImport(job, "That Pixabay link could not be read.")
    return "done"
  }
  const id = address.link.id

  const key = await readPixabayKey().catch(() => null)
  if (!key) {
    await failImport(
      job,
      "No readable Pixabay API key is saved. Add it in Settings → Pixabay, then import the link again."
    )
    return "done"
  }

  let stored: string | null = null
  try {
    if (job.sourceKind === "video") {
      const video = await fetchPixabayVideo(key, id)
      const rendition = pickPixabayRendition(video, uploadLimitBytes("video"))
      if (!rendition) {
        await failImport(job, "Pixabay's film is over 100 MB in every size it offers.")
        return "done"
      }
      const file = await storeCatalogBytes(
        await downloadPixabayFile(rendition.url, uploadLimitBytes("video"))
      )
      stored = file.path
      if (file.kind !== "video") throw new Error("INVALID_FILE_CONTENT")
      await handOverFilm(job, file.path, video)
    } else {
      const image = await fetchPixabayImage(key, id)
      const file = await storeCatalogBytes(
        await downloadPixabayFile(image.largeImageURL, uploadLimitBytes("image"))
      )
      stored = file.path
      if (file.kind !== "image") throw new Error("INVALID_FILE_CONTENT")
      await finishStill(job, file.path, image)
    }
    return "done"
  } catch (error) {
    if (stored) await removeFiles([stored])
    if (error instanceof PixabayRateLimitedError) {
      await putBack(job, { refund: true })
      return "again"
    }
    if (error instanceof PixabayNotFoundError) {
      await failImport(job, `Pixabay has no item ${id}`)
      return "done"
    }
    if (error instanceof PixabayKeyRefusedError) {
      await failImport(
        job,
        "The Pixabay API key was refused. Check it in Settings → Pixabay."
      )
      return "done"
    }
    // Only the message: a fetch error can carry the address, and the key is in it.
    console.error(
      "pixabay import failed",
      job.id,
      error instanceof Error ? error.message : "unknown error"
    )
    if (job.attempts >= CATALOG_MAX_ATTEMPTS) {
      await failImport(job, GAVE_UP)
      return "done"
    }
    await putBack(job, { refund: false })
    return "again"
  }
}

/**
 * What Pixabay says about the item, written only where the admin has not
 * already filled the field in while it was being fetched.
 */
function creditsFor(row: PomodoroCatalogItem, credits: Credits) {
  return {
    artist: row.artist || credits.user.slice(0, 120) || null,
    sourceUrl: row.sourceUrl || credits.pageURL.slice(0, 500) || null,
    licence: row.licence ?? "free",
    licenceNote: row.licenceNote ?? PIXABAY_LICENCE_NOTE,
    tags: row.tags.length ? row.tags : cleanTags(credits.tags.split(",")),
  }
}

/** The row as it is now, while it still waits on this same import. */
async function lockedJobRow(tx: Transaction, job: Job) {
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

/** A picture is the theme's still. One the admin picked meanwhile is kept. */
async function finishStill(job: Job, path: string, image: Credits) {
  const url = await getPublicMediaUrl(path)
  const unused = await db.transaction(async (tx) => {
    const row = await lockedJobRow(tx, job)
    // Deleted, or given a file of the admin's own while this was fetching.
    if (!row) return path
    const keepPicture = Boolean(row.pictureUrl)
    await tx
      .update(pomodoroCatalogItems)
      .set({
        ...creditsFor(row, image),
        pictureUrl: keepPicture ? row.pictureUrl : url,
        picturePath: keepPicture ? row.picturePath : path,
        fileStatus: "ready",
        fileError: null,
        importUrl: null,
        sourceKind: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pomodoroCatalogItems.id, row.id))
    return keepPicture ? path : null
  })
  forgetMediaCatalog()
  if (unused) await removeFiles([unused])
}

/**
 * A film goes to the catalogue worker as though the admin had uploaded it,
 * with its tries counted from nothing, so it is shrunk to 720p with its first
 * frame as the still.
 */
async function handOverFilm(job: Job, path: string, video: Credits) {
  const handed = await db.transaction(async (tx) => {
    const row = await lockedJobRow(tx, job)
    if (!row) return false
    await tx
      .update(pomodoroCatalogItems)
      .set({
        ...creditsFor(row, video),
        sourcePath: path,
        sourceKind: "video",
        importUrl: null,
        fileStatus: "queued",
        fileError: null,
        attempts: 0,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pomodoroCatalogItems.id, row.id))
    return true
  })
  if (!handed) await removeFiles([path])
}

/** Back in the queue. A throttled try gives its attempt back, so a busy minute burns nothing. */
async function putBack(job: Job, { refund }: { refund: boolean }) {
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
async function failImport(job: Job, reason: string) {
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
