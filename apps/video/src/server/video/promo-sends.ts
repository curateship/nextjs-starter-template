import { createHash, randomBytes } from "node:crypto"

import { and, desc, eq, gt, inArray, isNotNull, ne, or, sql } from "drizzle-orm"

import {
  PROMO_SEND_FAILED,
  PROMO_SEND_STALE_HOURS,
  PROMO_TOKEN_HOURS,
  type PromoDraftNetwork,
  type PromoSendOptions,
  type PromoSendView,
} from "@/lib/video/promo"
import { now as currentTime, uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { subtitleLines, toSrt } from "@/lib/video/srt"
import { timelineSchema } from "@/lib/video/timeline-schema"
import { SLIDESHOW_FAILED_MESSAGE, SLIDESHOW_SIZE } from "@/server/video/promo-slideshow"
import { ensureCarouselExportPdf } from "@/server/video/carousel-exports"
import { getPromoUrl } from "@/server/video/settings"
import { callPromo, readPromoConnection, videoAddress, PromoRefusal, type PromoConnection } from "@/server/video/promo-link"
import {
  videoCarousels,
  videoProjects,
  videoProjectVideos,
  videoPromoPicks,
  videoPromoSends,
  videoRenderJobs,
  videoThumbnails,
  type VideoPromoSendRow,
} from "@/server/video/schema"

/**
 * Send to Promo (`workspace/docs/send-to-promo.md`). A send is one export or
 * thumbnail going to one Promo project. Video writes the send, makes a
 * token good for two hours, and posts Promo a note naming the files by
 * address. Promo answers at once, then fetches each file with the token and
 * keeps its own copy. Promo tells Video when the item is ready or the copy
 * failed; while the send window is open Video also asks.
 */

const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex")

/** A part Promo may fetch: the file, its cover, a slide, the PDF. */
export type PromoFilePart = { kind: "main" } | { kind: "cover" } | { kind: "pdf" } | { kind: "slide"; index: number }

export function readFilePart(raw: string | null): PromoFilePart | null {
  if (raw === "main" || raw === "cover" || raw === "pdf") return { kind: raw }
  const slide = /^slide-(\d{1,2})$/.exec(raw ?? "")
  return slide ? { kind: "slide", index: Number(slide[1]) } : null
}

/** A send as the window and the Exports row show it. */
export function sendView(row: VideoPromoSendRow): PromoSendView {
  return {
    id: row.id,
    kind: row.kind,
    exportId: row.exportId,
    thumbnailId: row.thumbnailId,
    promoProjectId: row.promoProjectId,
    promoProjectName: row.promoProjectName,
    status: row.status,
    error: row.error,
    promoItemId: row.promoItemId,
    promoItemUrl: row.promoItemUrl,
    progress: row.bytesTotal > 0 ? Math.min(1, row.bytesDone / row.bytesTotal) : 0,
    createdAt: row.createdAt.toISOString(),
  }
}

type ExportRow = typeof videoRenderJobs.$inferSelect

/** What one export is called, where it came from, and its language, for the note. */
async function describeExport(row: ExportRow, db: CustomShellDb) {
  if (row.kind === "carousel") {
    const [carousel] = row.carouselId
      ? await db
          .select({ id: videoCarousels.id, name: videoCarousels.name, carouselProjectId: videoCarousels.carouselProjectId })
          .from(videoCarousels)
          .where(eq(videoCarousels.id, row.carouselId))
          .limit(1)
      : []
    return {
      sourceProjectId: carousel?.carouselProjectId ?? null,
      sourceName: carousel?.name ?? "",
      editPath: carousel
        ? `/admin/video-carousels/${encodeURIComponent(carousel.carouselProjectId)}?carousel=${encodeURIComponent(carousel.id)}`
        : "",
      language: "",
      groupKey: "",
    }
  }
  const [video] = row.videoId
    ? await db
        .select({
          id: videoProjectVideos.id,
          projectId: videoProjectVideos.projectId,
          name: videoProjectVideos.name,
          language: videoProjectVideos.language,
          languageOf: videoProjectVideos.languageOf,
        })
        .from(videoProjectVideos)
        .where(eq(videoProjectVideos.id, row.videoId))
        .limit(1)
    : []
  const projectId = video?.projectId ?? row.projectId
  const [project] = projectId
    ? await db.select({ name: videoProjects.name }).from(videoProjects).where(eq(videoProjects.id, projectId)).limit(1)
    : []
  return {
    sourceProjectId: projectId ?? null,
    sourceName: project?.name ?? video?.name ?? "",
    editPath: projectId
      ? `/admin/video-editor/${encodeURIComponent(projectId)}${video ? `?video=${encodeURIComponent(video.id)}` : ""}`
      : "",
    language: video?.language ?? "",
    // A language copy and its original share the original's id (part 11).
    groupKey: video?.languageOf ?? "",
  }
}

/**
 * The video's captions as .srt words (part 13), cut to the export's range
 * when only part was exported. Read from the video as it is now, since an
 * export keeps no copy of its timeline. "" when it has none.
 */
async function subtitlesFor(row: ExportRow, db: CustomShellDb): Promise<string> {
  if (row.kind !== "video" || !row.videoId) return ""
  const [video] = await db.select({ timeline: videoProjectVideos.timeline }).from(videoProjectVideos).where(eq(videoProjectVideos.id, row.videoId)).limit(1)
  const parsed = timelineSchema.safeParse(video?.timeline)
  if (!parsed.success) return ""
  const range = row.rangeStartMs !== null && row.rangeEndMs !== null ? { startMs: row.rangeStartMs, endMs: row.rangeEndMs } : null
  return toSrt(subtitleLines(parsed.data, range))
}

/** The note Promo is posted for one send of an export, or of its slideshow (part 15). */
async function exportNote(send: VideoPromoSendRow, row: ExportRow, token: string, db: CustomShellDb) {
  const base = `${videoAddress()}/api/connect/promo/file/${token}`
  const about = await describeExport(row, db)
  const options = send.options
  if (send.kind === "slideshow") {
    if (!options.filePath) throw new Error(SLIDESHOW_FAILED_MESSAGE)
    return {
      sendId: send.id,
      projectId: send.promoProjectId,
      replaceItemId: options.replaceItemId,
      kind: "video",
      title: `${row.title ?? about.sourceName} (slideshow)`.slice(0, 200),
      description: row.description ?? "",
      caption: row.caption ?? "",
      aspect: "9:16",
      width: SLIDESHOW_SIZE.width,
      height: SLIDESHOW_SIZE.height,
      durationMs: options.fileDurationMs ?? null,
      file: { url: `${base}?part=main`, mimeType: "video/mp4", size: options.fileSize ?? 0 },
      cover: row.thumbnailStoragePath
        ? { url: `${base}?part=cover`, mimeType: row.thumbnailStoragePath.endsWith(".png") ? "image/png" : "image/jpeg", size: 0 }
        : undefined,
      slides: [],
      groupKey: row.id,
      videoExportId: row.id,
      videoProjectId: about.sourceProjectId ?? "",
      videoProjectName: about.sourceName,
      videoEditUrl: about.editPath ? `${videoAddress()}${about.editPath}` : "",
      drafts: options.drafts ?? [],
    }
  }
  const carousel = row.kind === "carousel"
  const ranges = row.slideRanges ?? []
  return {
    sendId: send.id,
    projectId: send.promoProjectId,
    replaceItemId: options.replaceItemId,
    kind: carousel ? "carousel" : "video",
    title: row.title ?? about.sourceName,
    description: row.description ?? "",
    caption: row.caption ?? "",
    aspect: row.aspect,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    subtitles: await subtitlesFor(row, db),
    file: carousel ? undefined : { url: `${base}?part=main`, mimeType: "video/mp4", size: row.fileSize ?? 0 },
    cover: row.thumbnailStoragePath
      ? { url: `${base}?part=cover`, mimeType: row.thumbnailStoragePath.endsWith(".png") ? "image/png" : "image/jpeg", size: 0 }
      : undefined,
    pdf: carousel && options.pdf ? { url: `${base}?part=pdf`, mimeType: "application/pdf", size: 0 } : undefined,
    slides: carousel
      ? ranges.map((range, index) => ({
          url: `${base}?part=slide-${index}`,
          mimeType: range.type === "video" ? "video/mp4" : "image/png",
          size: range.size,
          kind: range.type === "video" ? "video" : "photo",
        }))
      : [],
    language: about.language,
    groupKey: options.groupKey ?? about.groupKey,
    videoExportId: row.id,
    videoProjectId: about.sourceProjectId ?? "",
    videoProjectName: about.sourceName,
    videoEditUrl: about.editPath ? `${videoAddress()}${about.editPath}` : "",
    drafts: options.drafts ?? [],
  }
}

/** The note for a thumbnail sent on its own as a picture (part 10). */
async function thumbnailNote(send: VideoPromoSendRow, token: string, db: CustomShellDb) {
  const [thumb] = await db
    .select({ title: videoThumbnails.title, shape: videoThumbnails.shape, videoId: videoThumbnails.videoId })
    .from(videoThumbnails)
    .where(and(eq(videoThumbnails.id, send.thumbnailId ?? ""), eq(videoThumbnails.userId, send.userId)))
    .limit(1)
  if (!thumb || !send.options.filePath) throw new Error("That thumbnail isn't there any more.")
  const [video] = await db
    .select({ projectId: videoProjectVideos.projectId, name: videoProjectVideos.name })
    .from(videoProjectVideos)
    .where(eq(videoProjectVideos.id, thumb.videoId))
    .limit(1)
  const base = `${videoAddress()}/api/connect/promo/file/${token}`
  return {
    sendId: send.id,
    projectId: send.promoProjectId,
    replaceItemId: send.options.replaceItemId,
    kind: "picture",
    title: thumb.title || (video ? `${video.name} thumbnail` : "Thumbnail"),
    aspect: thumb.shape === "wide" ? "16:9" : "9:16",
    width: thumb.shape === "wide" ? 1280 : 1080,
    height: thumb.shape === "wide" ? 720 : 1920,
    file: { url: `${base}?part=main`, mimeType: "image/jpeg", size: send.options.fileSize ?? 0 },
    slides: [],
    videoProjectId: video?.projectId ?? "",
    videoProjectName: video?.name ?? "",
    videoEditUrl: video ? `${videoAddress()}/admin/video-editor/${encodeURIComponent(video.projectId)}?video=${encodeURIComponent(thumb.videoId)}` : "",
    drafts: send.options.drafts ?? [],
  }
}

export type SendRequest = {
  userId: string
  /** Ready exports to send. Language copies are added by the caller (part 11). */
  exportIds?: string[]
  thumbnailIds?: string[]
  promoProjects: { id: string; name: string }[]
  drafts?: PromoDraftNetwork[]
  /** Per export or thumbnail id, the Promo item a newer version replaces, keyed `<id>:<promo project>`. */
  replace?: Record<string, string>
  /** Per export id, the original video's id its language copies share. */
  groupKeys?: Record<string, string>
  pdf?: boolean
  /** A carousel also sent as a slideshow, with this music or none (part 15). */
  slideshow?: { soundId: string | null } | null
}

export type SendDeps = {
  db?: CustomShellDb
  fetchImpl?: typeof fetch
  now?: () => Date
  connection?: PromoConnection
  /** Tests wait for the slideshows rather than letting them run after the answer. */
  awaitSlideshows?: boolean
}

/** A fresh token on the send, good for two hours, and the send set back to sending. */
async function arm(send: VideoPromoSendRow, db: CustomShellDb, at: Date, from: VideoPromoSendRow["status"] = "sending") {
  const token = randomBytes(32).toString("hex")
  const [row] = await db
    .update(videoPromoSends)
    .set({
      tokenHash: hashToken(token),
      tokenExpiresAt: new Date(at.getTime() + PROMO_TOKEN_HOURS * 3600_000),
      status: "sending",
      error: "",
      bytesDone: 0,
      updatedAt: at,
      finishedAt: null,
    })
    // Only from the state the caller saw, so two presses of Try again arm it once.
    .where(and(eq(videoPromoSends.id, send.id), eq(videoPromoSends.status, from)))
    .returning()
  if (!row) throw new Error("That send is already on its way.")
  return { row, token }
}

/**
 * Posts one send's note to Promo. A refusal ends the send as failed with
 * Promo's words; an answer keeps it sending until Promo says it arrived.
 */
async function post(
  send: VideoPromoSendRow,
  connection: PromoConnection,
  deps: Required<Pick<SendDeps, "db" | "now">> & { fetchImpl: typeof fetch },
  from: VideoPromoSendRow["status"] = "sending"
) {
  const { db } = deps
  const at = deps.now()
  const { row, token } = await arm(send, db, at, from)
  try {
    let note: unknown
    const ready = await prepareOwnFile(row, db)
    if (ready.kind === "thumbnail") {
      await db.update(videoPromoSends).set({ bytesTotal: ready.options.fileSize ?? 0 }).where(eq(videoPromoSends.id, row.id))
      note = await thumbnailNote(ready, token, db)
    } else {
      const [exported] = await db
        .select()
        .from(videoRenderJobs)
        .where(and(eq(videoRenderJobs.id, row.exportId ?? ""), eq(videoRenderJobs.userId, row.userId), eq(videoRenderJobs.status, "ready")))
        .limit(1)
      if (!exported?.storagePath) throw new Error("That export is not there any more.")
      const total = ready.kind === "slideshow" ? (ready.options.fileSize ?? 0) : (exported.fileSize ?? 0)
      await db.update(videoPromoSends).set({ bytesTotal: total }).where(eq(videoPromoSends.id, row.id))
      note = await exportNote(ready, exported, token, db)
    }
    const answer = await callPromo<{ itemId: string; itemUrl: string; status: string }>(connection, "/api/connect/video/items", note, deps.fetchImpl)
    const [updated] = await db
      .update(videoPromoSends)
      .set({ promoItemId: String(answer.itemId ?? "").slice(0, 64), promoItemUrl: onPromo(connection.url, answer.itemUrl), updatedAt: deps.now() })
      .where(eq(videoPromoSends.id, row.id))
      .returning()
    return updated
  } catch (error) {
    return failSend(row, storedReason(error, row.id), db, deps.now())
  }
}

/**
 * The file a send carries of its own, made the first time it is posted: a
 * thumbnail drawn as a JPEG (part 10), or a carousel's slideshow (part 15).
 * Kept in storage under `video/promo-sends/` until Promo has its copy.
 */
async function prepareOwnFile(row: VideoPromoSendRow, db: CustomShellDb): Promise<VideoPromoSendRow> {
  if (row.options.filePath || (row.kind !== "thumbnail" && row.kind !== "slideshow")) return row
  let made: { storagePath: string; size: number; durationMs?: number }
  if (row.kind === "thumbnail") {
    const { drawThumbnail, getOwnedThumbnail } = await import("@/server/video/thumbnails")
    const jpeg = await drawThumbnail(row.userId, await getOwnedThumbnail(row.userId, row.thumbnailId ?? "", db))
    const storagePath = `video/promo-sends/${row.userId}/${uuid()}.jpg`
    await uploadToR2(storagePath, jpeg, "image/jpeg")
    made = { storagePath, size: jpeg.byteLength }
  } else {
    const { renderSlideshow } = await import("@/server/video/promo-slideshow")
    made = await renderSlideshow(row.userId, row.exportId ?? "", row.options.slideshowSoundId ?? null, db)
  }
  const options: PromoSendOptions = { ...row.options, filePath: made.storagePath, fileSize: made.size, fileDurationMs: made.durationMs }
  const [updated] = await db.update(videoPromoSends).set({ options }).where(eq(videoPromoSends.id, row.id)).returning()
  return updated
}

/** A send's own file goes once Promo has its copy and no other send of it is still waiting. */
async function releaseOwnFile(row: VideoPromoSendRow, db: CustomShellDb) {
  const filePath = row.options.filePath
  if (!filePath) return
  const others = await db
    .select({ id: videoPromoSends.id })
    .from(videoPromoSends)
    .where(and(sql`${videoPromoSends.options}->>'filePath' = ${filePath}`, ne(videoPromoSends.status, "sent"), ne(videoPromoSends.id, row.id)))
    .limit(1)
  if (others.length) return
  await deleteFromR2(filePath).catch((error) => console.error("A file made for Promo stayed in storage", filePath, error))
}

/**
 * Why a send failed, as it is kept and shown on the row and in the bell:
 * Promo's own words, or one of Video's plain sentences. Anything that looks
 * like the server's own text (a failed query, a storage error, several
 * lines) becomes the plain default, and the real error goes to the log.
 */
function storedReason(error: unknown, sendId: string): string {
  const message = error instanceof Error ? error.message : ""
  if (error instanceof PromoRefusal) return message || PROMO_SEND_FAILED
  const plain = /^[A-Z][^\n]{3,300}[.!?]$/.test(message) && !/Failed query|ECONN|violates|duplicate key|\bat \//i.test(message)
  if (plain) return message
  console.error("A send to Promo failed", sendId, error)
  return PROMO_SEND_FAILED
}

/** Ends a send as failed and rings the bell (part 20). */
async function failSend(row: VideoPromoSendRow, message: string, db: CustomShellDb, at: Date) {
  const [failed] = await db
    .update(videoPromoSends)
    .set({ status: "failed", error: message.slice(0, 500), tokenHash: null, tokenExpiresAt: null, updatedAt: at, finishedAt: at })
    .where(and(eq(videoPromoSends.id, row.id), eq(videoPromoSends.status, "sending")))
    .returning()
  if (failed) await ringFailedSend(failed, db, at)
  return failed ?? row
}

/** The bell for a send that did not arrive. Never fails the work that rang it. */
async function ringFailedSend(row: VideoPromoSendRow, db: CustomShellDb, at: Date) {
  try {
    const [exported] = row.exportId
      ? await db.select({ title: videoRenderJobs.title }).from(videoRenderJobs).where(eq(videoRenderJobs.id, row.exportId)).limit(1)
      : []
    const name = exported?.title || (row.kind === "thumbnail" ? "A thumbnail" : "An export")
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: row.userId,
      type: "app_activity",
      message: `${name} didn't reach Promo`,
      detail: `${row.error || PROMO_SEND_FAILED} Press Try again on the Exports page.`.slice(0, 1_000),
      createdAt: at,
    })
    await publishNotificationCreated(row.userId, db)
  } catch (error) {
    console.error("The failed-send notice could not be written", row.id, error)
  }
}

/**
 * Starts every send asked for: each export or thumbnail to each Promo
 * project ticked. Answers the sends as they stand after Promo's first
 * answer. Remembers the projects picked for the source project (part 5).
 */
export async function startPromoSends(request: SendRequest, deps: SendDeps = {}): Promise<PromoSendView[]> {
  const db = deps.db ?? defaultDb
  const now = deps.now ?? currentTime
  const fetchImpl = deps.fetchImpl ?? fetch
  const connection = deps.connection ?? (await readPromoConnection(db))
  const exportIds = [...new Set(request.exportIds ?? [])]
  const thumbnailIds = [...new Set(request.thumbnailIds ?? [])]
  if (!request.promoProjects.length) throw new Error("Pick a Promo project first.")
  if (!exportIds.length && !thumbnailIds.length) throw new Error("Pick something to send first.")

  const exports = exportIds.length
    ? await db
        .select()
        .from(videoRenderJobs)
        .where(and(eq(videoRenderJobs.userId, request.userId), inArray(videoRenderJobs.id, exportIds), eq(videoRenderJobs.status, "ready")))
    : []
  if (exports.length !== exportIds.length) throw new Error("One of those exports isn't ready or isn't there any more.")
  const thumbs = thumbnailIds.length
    ? await db
        .select({ id: videoThumbnails.id, videoId: videoThumbnails.videoId })
        .from(videoThumbnails)
        .where(and(eq(videoThumbnails.userId, request.userId), inArray(videoThumbnails.id, thumbnailIds)))
    : []
  if (thumbs.length !== thumbnailIds.length) throw new Error("That thumbnail isn't there any more.")

  const at = now()
  const rows: VideoPromoSendRow[] = []
  const sources = new Set<string>()
  const slideshowOf = (exported: ExportRow) => exported.kind === "carousel" && Boolean(request.slideshow)
  for (const project of request.promoProjects) {
    for (const exported of exports) {
      const about = await describeExport(exported, db)
      if (about.sourceProjectId) sources.add(about.sourceProjectId)
      rows.push(
        newSend(request, at, {
          kind: "export",
          exportId: exported.id,
          sourceProjectId: about.sourceProjectId,
          promoProject: project,
          options: {
            drafts: request.drafts,
            replaceItemId: request.replace?.[`export:${exported.id}:${project.id}`],
            // A carousel and its slideshow share the export's id, so Promo keeps them together.
            groupKey: request.groupKeys?.[exported.id] ?? (slideshowOf(exported) ? exported.id : undefined),
            pdf: exported.kind === "carousel" ? request.pdf : undefined,
          },
        })
      )
      if (slideshowOf(exported)) {
        rows.push(
          newSend(request, at, {
            kind: "slideshow",
            exportId: exported.id,
            sourceProjectId: about.sourceProjectId,
            promoProject: project,
            options: {
              drafts: request.drafts,
              slideshowSoundId: request.slideshow?.soundId ?? null,
              groupKey: exported.id,
              replaceItemId: request.replace?.[`slideshow:${exported.id}:${project.id}`],
            },
          })
        )
      }
    }
    for (const thumb of thumbs) {
      const [video] = await db.select({ projectId: videoProjectVideos.projectId }).from(videoProjectVideos).where(eq(videoProjectVideos.id, thumb.videoId)).limit(1)
      if (video) sources.add(video.projectId)
      rows.push(
        newSend(request, at, {
          kind: "thumbnail",
          thumbnailId: thumb.id,
          sourceProjectId: video?.projectId ?? null,
          promoProject: project,
          options: { drafts: request.drafts, replaceItemId: request.replace?.[`thumbnail:${thumb.id}:${project.id}`] },
        })
      )
    }
  }
  await db.insert(videoPromoSends).values(rows)
  await rememberPicks(request.userId, [...sources], request.promoProjects.map((project) => project.id), db, at)

  const posted: VideoPromoSendRow[] = []
  // One after another: each note is small, and Promo starts copying as it answers.
  for (const row of rows) if (row.kind !== "slideshow") posted.push(await post(row, connection, { db, now, fetchImpl }))
  // A slideshow takes seconds to make, so it is made after the answer, once
  // per export, and then posted to each project.
  const slideshows = rows.filter((row) => row.kind === "slideshow")
  if (slideshows.length) {
    const work = postSlideshows(slideshows, connection, { db, now, fetchImpl })
    if (deps.awaitSlideshows) await work
    else void work.catch((error) => console.error("Slideshows for Promo stopped without finishing", error))
  }
  return [...posted, ...slideshows].map(sendView)
}

/** Makes each export's slideshow once and posts it to every project it goes to. */
async function postSlideshows(
  rows: VideoPromoSendRow[],
  connection: PromoConnection,
  deps: Required<Pick<SendDeps, "db" | "now">> & { fetchImpl: typeof fetch }
) {
  const byExport = new Map<string, VideoPromoSendRow[]>()
  for (const row of rows) byExport.set(row.exportId ?? "", [...(byExport.get(row.exportId ?? "") ?? []), row])
  for (const group of byExport.values()) {
    const [first, ...rest] = group
    try {
      const made = await prepareOwnFile(first, deps.db)
      // Each project's row keeps its own options (its replace, its drafts) and shares the one file.
      const shared: VideoPromoSendRow[] = []
      for (const row of rest) {
        const [updated] = await deps.db
          .update(videoPromoSends)
          .set({ options: { ...row.options, filePath: made.options.filePath, fileSize: made.options.fileSize, fileDurationMs: made.options.fileDurationMs } })
          .where(eq(videoPromoSends.id, row.id))
          .returning()
        if (updated) shared.push(updated)
      }
      for (const row of [made, ...shared]) await post(row, connection, deps)
    } catch (error) {
      const message = storedReason(error, first.id)
      for (const row of group) await failSend(row, message, deps.db, deps.now())
    }
  }
}

function newSend(
  request: SendRequest,
  at: Date,
  part: {
    kind: VideoPromoSendRow["kind"]
    exportId?: string
    thumbnailId?: string
    sourceProjectId: string | null
    promoProject: { id: string; name: string }
    options: PromoSendOptions
  }
): VideoPromoSendRow {
  return {
    id: uuid(),
    userId: request.userId,
    kind: part.kind,
    exportId: part.exportId ?? null,
    thumbnailId: part.thumbnailId ?? null,
    sourceProjectId: part.sourceProjectId,
    promoProjectId: part.promoProject.id,
    promoProjectName: part.promoProject.name.slice(0, 200),
    status: "sending",
    error: "",
    promoItemId: "",
    promoItemUrl: "",
    tokenHash: null,
    tokenExpiresAt: null,
    bytesDone: 0,
    bytesTotal: 0,
    options: Object.fromEntries(Object.entries(part.options).filter(([, value]) => value !== undefined)),
    createdAt: at,
    updatedAt: at,
    finishedAt: null,
  }
}

/** The Promo projects last picked for these video or carousel projects. */
async function rememberPicks(userId: string, sources: string[], promoProjectIds: string[], db: CustomShellDb, at: Date) {
  for (const sourceProjectId of sources) {
    await db
      .insert(videoPromoPicks)
      .values({ sourceProjectId, userId, promoProjectIds, updatedAt: at })
      .onConflictDoUpdate({ target: videoPromoPicks.sourceProjectId, set: { promoProjectIds, updatedAt: at } })
  }
}

/** The Promo projects picked last time for this video or carousel project, or none. */
export async function readPicks(userId: string, sourceProjectId: string, db: CustomShellDb = defaultDb): Promise<string[]> {
  const [row] = await db
    .select({ ids: videoPromoPicks.promoProjectIds })
    .from(videoPromoPicks)
    .where(and(eq(videoPromoPicks.sourceProjectId, sourceProjectId), eq(videoPromoPicks.userId, userId)))
    .limit(1)
  return row?.ids ?? []
}

/** Try again on a failed send: the same send, a fresh token, posted again (part 19). */
export async function retryPromoSend(userId: string, sendId: string, deps: SendDeps = {}): Promise<PromoSendView> {
  const db = deps.db ?? defaultDb
  const [row] = await db
    .select()
    .from(videoPromoSends)
    .where(and(eq(videoPromoSends.id, sendId), eq(videoPromoSends.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That send isn't there any more.")
  if (row.status !== "failed") throw new Error("Only a failed send can be tried again.")
  const connection = deps.connection ?? (await readPromoConnection(db))
  return sendView(await post(row, connection, { db, now: deps.now ?? currentTime, fetchImpl: deps.fetchImpl ?? fetch }, "failed"))
}

/** The newest send of each thing to each Promo project, for the Exports rows (part 17). */
export async function listPromoSends(
  userId: string,
  ids: { exportIds?: string[]; thumbnailIds?: string[] },
  db: CustomShellDb = defaultDb
): Promise<PromoSendView[]> {
  const exportIds = ids.exportIds ?? []
  const thumbnailIds = ids.thumbnailIds ?? []
  if (!exportIds.length && !thumbnailIds.length) return []
  const which = [
    ...(exportIds.length ? [inArray(videoPromoSends.exportId, exportIds)] : []),
    ...(thumbnailIds.length ? [inArray(videoPromoSends.thumbnailId, thumbnailIds)] : []),
  ]
  const rows = await db
    .select()
    .from(videoPromoSends)
    .where(and(eq(videoPromoSends.userId, userId), or(...which)))
    .orderBy(desc(videoPromoSends.createdAt))
  const newest = new Map<string, VideoPromoSendRow>()
  for (const row of rows) {
    // A carousel and its slideshow are two things sent, so each keeps its own newest send.
    const key = `${row.kind}:${row.exportId ?? row.thumbnailId}:${row.promoProjectId}`
    if (!newest.has(key)) newest.set(key, row)
  }
  return [...newest.values()].map(sendView)
}

/**
 * Asks Promo about sends still on their way, for the send window and the
 * Exports page while they wait. A send Promo no longer has failed there; one
 * past its time is taken as failed.
 */
export async function refreshPromoSends(userId: string, sendIds: string[], deps: SendDeps = {}): Promise<PromoSendView[]> {
  const db = deps.db ?? defaultDb
  const now = deps.now ?? currentTime
  if (!sendIds.length) return []
  const rows = await db
    .select()
    .from(videoPromoSends)
    .where(and(eq(videoPromoSends.userId, userId), inArray(videoPromoSends.id, sendIds)))
  let connection: PromoConnection | null = deps.connection ?? null
  const out: VideoPromoSendRow[] = []
  for (const row of rows) {
    if (row.status !== "sending" || !row.promoItemId) {
      out.push(row)
      continue
    }
    const at = now()
    if (at.getTime() - armedAt(row).getTime() > PROMO_SEND_STALE_HOURS * 3600_000) {
      out.push(await failSend(row, "The send took too long and was stopped. Try again.", db, at))
      continue
    }
    // The bar comes from Video's own count, so Promo is asked at most every
    // 20 seconds a send; its own news usually lands first.
    if (at.getTime() - row.updatedAt.getTime() < ASK_PROMO_EVERY_MS) {
      out.push(row)
      continue
    }
    await db.update(videoPromoSends).set({ updatedAt: at }).where(eq(videoPromoSends.id, row.id))
    try {
      connection ??= await readPromoConnection(db)
      const answer = await callPromo<{ status: string; itemId?: string; itemUrl?: string }>(
        connection,
        `/api/connect/video/sends/${encodeURIComponent(row.id)}`,
        undefined,
        deps.fetchImpl ?? fetch
      )
      if (answer.status === "ready") out.push(await markArrived(row.id, answer.itemId ?? row.promoItemId, answer.itemUrl ?? row.promoItemUrl, db, at))
      else if (answer.status === "gone") out.push(await failSend(row, "Promo couldn't copy it. Try again.", db, at))
      else out.push(row)
    } catch {
      // Promo didn't answer this time; the send waits for its own news.
      out.push(row)
    }
  }
  return out.map(sendView)
}

/** An Open in Promo address, kept only when it is on the saved Promo address. */
function onPromo(promoUrl: string, itemUrl: unknown): string {
  if (typeof itemUrl !== "string") return ""
  try {
    return new URL(itemUrl).origin === new URL(promoUrl).origin ? itemUrl.slice(0, 600) : ""
  } catch {
    return ""
  }
}

async function markArrived(sendId: string, itemId: string, itemUrl: string, db: CustomShellDb, at: Date) {
  const promoUrl = await getPromoUrl(db)
  const [row] = await db
    .update(videoPromoSends)
    .set({ status: "sent", promoItemId: itemId.slice(0, 64), promoItemUrl: onPromo(promoUrl, itemUrl), tokenHash: null, tokenExpiresAt: null, updatedAt: at, finishedAt: at })
    .where(eq(videoPromoSends.id, sendId))
    .returning()
  await releaseOwnFile(row, db)
  return row
}

/**
 * A post went out in Promo from something this export sent (part 41): the
 * export's video, or its carousel, turns to Posted, as if set by hand on its
 * menu. Answers whether the export was known.
 */
export async function markPosted(videoExportId: string, db: CustomShellDb = defaultDb, at: Date = currentTime()): Promise<{ known: boolean }> {
  // Only an export that really reached Promo, and only its owner's records.
  const [sent] = await db
    .select({ userId: videoPromoSends.userId })
    .from(videoPromoSends)
    .where(and(eq(videoPromoSends.exportId, videoExportId), eq(videoPromoSends.status, "sent")))
    .limit(1)
  if (!sent) return { known: false }
  const [row] = await db
    .select({ kind: videoRenderJobs.kind, videoId: videoRenderJobs.videoId, carouselId: videoRenderJobs.carouselId })
    .from(videoRenderJobs)
    .where(and(eq(videoRenderJobs.id, videoExportId), eq(videoRenderJobs.userId, sent.userId)))
    .limit(1)
  if (!row) return { known: false }
  if (row.kind === "carousel" && row.carouselId) {
    await db
      .update(videoCarousels)
      .set({ status: "posted", updatedAt: at })
      .where(and(eq(videoCarousels.id, row.carouselId), eq(videoCarousels.userId, sent.userId)))
  } else if (row.videoId) {
    await db
      .update(videoProjectVideos)
      .set({ status: "posted", updatedAt: at })
      .where(and(eq(videoProjectVideos.id, row.videoId), eq(videoProjectVideos.userId, sent.userId)))
  }
  return { known: true }
}

/**
 * What Promo tells Video at `/api/connect/promo/events`: a send arrived or
 * failed. Answers whether the send was known.
 */
export async function applyPromoEvent(
  event:
    | { type: "arrived"; sendId: string; itemId: string; itemUrl: string }
    | { type: "failed"; sendId: string; error: string }
    | { type: "posted"; videoExportId: string; network: string; postUrl: string },
  db: CustomShellDb = defaultDb,
  at: Date = currentTime()
): Promise<{ known: boolean }> {
  if (event.type === "posted") return markPosted(event.videoExportId, db, at)
  const [row] = await db.select().from(videoPromoSends).where(eq(videoPromoSends.id, event.sendId)).limit(1)
  if (!row) return { known: false }
  if (event.type === "arrived") await markArrived(row.id, event.itemId, event.itemUrl, db, at)
  else await failSend(row, event.error || "Promo couldn't copy it. Try again.", db, at)
  return { known: true }
}

/** The send a file token belongs to, while it lasts. */
export async function sendForToken(token: string, db: CustomShellDb = defaultDb, at: Date = currentTime()) {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const [row] = await db
    .select()
    .from(videoPromoSends)
    .where(and(eq(videoPromoSends.tokenHash, hashToken(token)), isNotNull(videoPromoSends.tokenExpiresAt), gt(videoPromoSends.tokenExpiresAt, at)))
    .limit(1)
  return row ?? null
}

/** Where a part of a send's file lives in storage, and the byte range of a slide. */
export async function locatePart(
  send: VideoPromoSendRow,
  part: PromoFilePart,
  db: CustomShellDb = defaultDb
): Promise<{ storagePath: string; contentType: string; range?: string } | null> {
  // A drawn thumbnail or a slideshow is the send's own file.
  if ((send.kind === "thumbnail" || send.kind === "slideshow") && part.kind === "main") {
    const filePath = send.options.filePath
    return filePath ? { storagePath: filePath, contentType: send.kind === "thumbnail" ? "image/jpeg" : "video/mp4" } : null
  }
  if (send.kind === "thumbnail") return null
  const [row] = await db
    .select()
    .from(videoRenderJobs)
    .where(and(eq(videoRenderJobs.id, send.exportId ?? ""), eq(videoRenderJobs.userId, send.userId), eq(videoRenderJobs.status, "ready")))
    .limit(1)
  if (!row?.storagePath) return null
  if (part.kind === "cover") {
    return row.thumbnailStoragePath
      ? { storagePath: row.thumbnailStoragePath, contentType: row.thumbnailStoragePath.endsWith(".png") ? "image/png" : "image/jpeg" }
      : null
  }
  if (send.kind === "slideshow") return null
  if (row.kind === "carousel") {
    const ranges = row.slideRanges ?? []
    if (part.kind === "pdf") return { storagePath: await ensureCarouselExportPdf(row.storagePath, ranges), contentType: "application/pdf" }
    if (part.kind !== "slide") return null
    const range = ranges[part.index]
    if (!range) return null
    return {
      storagePath: row.storagePath,
      contentType: range.type === "video" ? "video/mp4" : "image/png",
      range: `bytes=${range.start}-${range.start + range.size - 1}`,
    }
  }
  return part.kind === "main" ? { storagePath: row.storagePath, contentType: "video/mp4" } : null
}

/** How often a send on its way may ask Promo how it is doing. */
const ASK_PROMO_EVERY_MS = 20_000

/** How often the fetched count is written while the main file streams. */
const PROGRESS_EVERY_MS = 2_000

/**
 * Streams one part to Promo. The main file's bytes are counted onto the send
 * as they go, so the window can show how far it has got (part 4).
 */
export async function streamPart(send: VideoPromoSendRow, part: PromoFilePart, db: CustomShellDb = defaultDb): Promise<Response> {
  const located = await locatePart(send, part, db)
  if (!located) return Response.json({ error: "No such file." }, { status: 404 })
  const object = await getFromR2(located.storagePath, located.range)
  if (!object.Body) return Response.json({ error: "The stored file is empty." }, { status: 502 })
  const headers = new Headers({ "content-type": located.contentType, "cache-control": "no-store", "x-content-type-options": "nosniff" })
  if (object.ContentLength !== undefined) headers.set("content-length", String(object.ContentLength))
  const source = object.Body.transformToWebStream()
  if (part.kind !== "main") return new Response(source, { headers })

  let done = 0
  let written = Date.now()
  const save = () => {
    written = Date.now()
    return db
      .update(videoPromoSends)
      .set({ bytesDone: done })
      .where(eq(videoPromoSends.id, send.id))
      .then(
        () => undefined,
        () => undefined
      )
  }
  const counted = source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        done += chunk.byteLength
        // Written along the way without waiting, so the file never slows for it.
        if (Date.now() - written > PROGRESS_EVERY_MS) void save()
        controller.enqueue(chunk)
      },
      // The last count is waited for, so the file ends only once it is written.
      flush: () => save(),
    })
  )
  return new Response(counted, { headers })
}

/**
 * The ticker's pass: a send whose note Promo never answered, or that has
 * waited past its time, ends as failed with a bell.
 */
export async function sweepStalePromoSends(db: CustomShellDb = defaultDb, at: Date = currentTime()) {
  const cutoff = at.getTime() - PROMO_SEND_STALE_HOURS * 3600_000
  const waiting = await db.select().from(videoPromoSends).where(eq(videoPromoSends.status, "sending")).limit(200)
  const stale = waiting.filter((row) => armedAt(row).getTime() < cutoff).slice(0, 20)
  for (const row of stale) await failSend(row, "The send took too long and was stopped. Try again.", db, at)
}

/**
 * When a send last set out: its token is made then and lasts two hours, so
 * Try again on an old send starts its clock again. A send not armed yet,
 * such as a slideshow still being made, counts from when it was made.
 */
function armedAt(row: VideoPromoSendRow): Date {
  return row.tokenExpiresAt ? new Date(row.tokenExpiresAt.getTime() - PROMO_TOKEN_HOURS * 3600_000) : row.createdAt
}
