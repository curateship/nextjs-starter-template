import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import {
  CATALOG_MAX_ATTEMPTS,
  cleanTags,
  removeFiles,
  storeCatalogBytes,
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
import {
  claimNextLinkImport,
  failLinkImport,
  lockedLinkImportRow,
  putBackLinkImport,
  type LinkImportJob,
} from "@/server/pomodoro/link-imports"
import { processNextMemberImport } from "@/server/pomodoro/member-imports"
import { PIXABAY_LICENCE_NOTE } from "@/server/pomodoro/pixabay-import"
import { readPixabayKey } from "@/server/pomodoro/pixabay-key"
import { pomodoroCatalogItems, type PomodoroCatalogItem } from "@/server/pomodoro/schema"
import { CATALOG_FILM_LIMIT_BYTES } from "@/lib/pomodoro/admin-catalog"
import { formatBytes, uploadLimitBytes } from "@/lib/pomodoro/media-limits"
import { readPixabayAddress } from "@/lib/pomodoro/pixabay-links"

/**
 * The `pomodoro-pixabay-imports` worker: fetches the picture or film behind a
 * row "Import from Pixabay" made. See "Import from Pixabay" in
 * `workspace/docs/catalog-admin.md`.
 *
 * A picture becomes the theme's still at once. A film is copied into the
 * bucket and handed to the catalogue worker, which shrinks it to 720p and
 * takes the frame halfway through it as the still, the same as an upload. Up to five
 * pictures or one film per pass of the shell's fifteen-second loop, so 25
 * photos take about a minute.
 *
 * A music link never reaches here: nothing is fetched for a sound.
 */

/**
 * Longer than the slowest film: eight minutes to fetch 300 MB, then the copy
 * into the bucket. A picture takes seconds. A live job is never stolen.
 */
const CLAIM_TIMEOUT_MS = 12 * 60 * 1000
const STILLS_PER_PASS = 5
const GAVE_UP = "Pixabay's file could not be fetched"

/** Every Pixabay link is stored as a pixabay.com page address. */
const PIXABAY_PREFIX = "https://pixabay.com/"

export async function processPixabayImports() {
  // One member's link first (task 06, part 8), so a long admin import never
  // keeps a member waiting a whole batch.
  await processNextMemberImport()
  for (let done = 0; done < STILLS_PER_PASS; done += 1) {
    const job = await claimNextLinkImport({
      prefix: PIXABAY_PREFIX,
      timeoutMs: CLAIM_TIMEOUT_MS,
      gaveUp: GAVE_UP,
    })
    if (!job) return
    const outcome = await processPixabayImport(job)
    // A throttled minute or a row put back for another try ends the pass, so
    // the next try waits for the next pass instead of following at once and
    // spending all three tries on one blip.
    if (outcome === "again" || job.sourceKind === "video") return
  }
}

type Credits = { user: string; pageURL: string; tags: string }

async function processPixabayImport(job: LinkImportJob): Promise<"done" | "again"> {
  const address = readPixabayAddress(job.importUrl)
  if (!address.ok) {
    await failLinkImport(job, "That Pixabay link could not be read.")
    return "done"
  }
  const id = address.link.id

  const key = await readPixabayKey().catch(() => null)
  if (!key) {
    await failLinkImport(
      job,
      "No readable Pixabay API key is saved. Add it in Settings → Pixabay, then import the link again."
    )
    return "done"
  }

  let stored: string | null = null
  try {
    if (job.sourceKind === "video") {
      const video = await fetchPixabayVideo(key, id)
      const rendition = pickPixabayRendition(video, CATALOG_FILM_LIMIT_BYTES)
      if (!rendition) {
        await failLinkImport(
          job,
          `Pixabay's film is over ${formatBytes(CATALOG_FILM_LIMIT_BYTES)} in every size it offers.`
        )
        return "done"
      }
      const file = await storeCatalogBytes(
        await downloadPixabayFile(rendition.url, CATALOG_FILM_LIMIT_BYTES)
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
      await putBackLinkImport(job, { refund: true })
      return "again"
    }
    if (error instanceof PixabayNotFoundError) {
      await failLinkImport(job, `Pixabay has no item ${id}`)
      return "done"
    }
    if (error instanceof PixabayKeyRefusedError) {
      await failLinkImport(
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
      await failLinkImport(job, GAVE_UP)
      return "done"
    }
    await putBackLinkImport(job, { refund: false })
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

/** A picture is the theme's still. One the admin picked meanwhile is kept. */
async function finishStill(job: LinkImportJob, path: string, image: Credits) {
  const url = await getPublicMediaUrl(path)
  const unused = await db.transaction(async (tx) => {
    const row = await lockedLinkImportRow(tx, job)
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
async function handOverFilm(job: LinkImportJob, path: string, video: Credits) {
  const handed = await db.transaction(async (tx) => {
    const row = await lockedLinkImportRow(tx, job)
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
