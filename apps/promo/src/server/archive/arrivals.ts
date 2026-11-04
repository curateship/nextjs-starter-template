import { and, eq, isNull, lt } from "drizzle-orm"
import { z } from "zod"

import {
  ARCHIVE_ITEM_KINDS,
  MAX_ARCHIVE_FILE_BYTES,
  MAX_ARCHIVE_SLIDES,
  type ArchivePending,
  type ArchivePendingFile,
} from "@/lib/archive/items"
import { NETWORKS } from "@/lib/social/networks"
import { appUrlFor } from "@/server/app-url"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { ringBell } from "@/server/social/notices"
import { promoProjects } from "@/server/social/schema"

import { archivePath, archiveItemHref } from "./paths"
import { promoArchiveDrafts, promoArchiveItems, promoArchiveSlides, type PromoArchiveItemRow, type PromoVideoLinkRow } from "./schema"
import { bucketStore, copyIntoStore, type ArchiveStore } from "./store"
import { callVideo, onVideoAddress, VideoLinkRefusal } from "./video-link"

/**
 * Something sent from Video arriving in the Archive
 * (`workspace/docs/archive.md`). Video posts a note naming the files and the
 * project; Promo checks it, makes the item at once as "copying", answers,
 * then fetches each file from Video and keeps its own copy. When every file
 * is in, the item is ready, the bell rings and Video is told. When any file
 * fails, everything copied so far is deleted along with the item, and Video
 * is told why, so Try again in Video starts clean (part 19).
 */

const fileShape = z.object({
  url: z.string().url().max(2_000),
  mimeType: z
    .string()
    .max(100)
    .regex(/^[\w.+-]+\/[\w.+-]+$/),
  size: z.number().int().min(0).max(MAX_ARCHIVE_FILE_BYTES),
})

const shortText = (max: number) => z.string().max(max).default("")

export const arrivalShape = z.object({
  sendId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
  projectId: z.string().min(1).max(36),
  /** The item a newer version replaces (part 18). */
  replaceItemId: z.string().max(36).optional(),
  kind: z.enum(ARCHIVE_ITEM_KINDS),
  title: shortText(200),
  description: shortText(10_000),
  caption: shortText(10_000),
  aspect: shortText(8),
  width: z.number().int().min(0).max(20_000).nullable().default(null),
  height: z.number().int().min(0).max(20_000).nullable().default(null),
  durationMs: z.number().int().min(0).max(24 * 3600_000).nullable().default(null),
  file: fileShape.optional(),
  cover: fileShape.optional(),
  pdf: fileShape.optional(),
  slides: z
    .array(fileShape.extend({ kind: z.enum(["photo", "video"]) }))
    .max(MAX_ARCHIVE_SLIDES)
    .default([]),
  subtitles: shortText(1_500_000),
  language: shortText(40),
  groupKey: shortText(64),
  videoExportId: shortText(64),
  videoProjectId: shortText(64),
  videoProjectName: shortText(200),
  videoEditUrl: shortText(600),
  /** Networks to leave a draft in, ticked in Video's send window (part 35). */
  drafts: z.array(z.enum(NETWORKS)).max(NETWORKS.length).default([]),
})

export type ArrivalNote = z.infer<typeof arrivalShape>

export type ArrivalAnswer = { itemId: string; status: PromoArchiveItemRow["status"]; itemUrl: string }

/** The files to fetch, in the order they are copied: the main file, the slides, then the cover and the PDF. */
function pendingFiles(note: ArrivalNote): ArchivePendingFile[] {
  const files: ArchivePendingFile[] = []
  if (note.file) files.push({ role: "main", ...note.file })
  note.slides.forEach((slide, position) => files.push({ role: "slide", position, ...slide }))
  if (note.cover) files.push({ role: "cover", ...note.cover })
  if (note.pdf) files.push({ role: "pdf", ...note.pdf })
  return files
}

/**
 * Checks a note and makes its item as "copying". The same send twice
 * answers the item the first one made. Throws a `VideoLinkRefusal` saying
 * what is wrong.
 */
export async function acceptArrival(
  link: PromoVideoLinkRow,
  note: ArrivalNote,
  db: CustomShellDb = defaultDb,
  now = new Date()
): Promise<ArrivalAnswer> {
  const userId = link.userId
  const [already] = await db
    .select({ id: promoArchiveItems.id, status: promoArchiveItems.status, projectId: promoArchiveItems.projectId })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.userId, userId), eq(promoArchiveItems.sendId, note.sendId)))
    .limit(1)
  if (already) return { itemId: already.id, status: already.status, itemUrl: appUrlFor(archiveItemHref(already.projectId, already.id)) }

  const [project] = await db
    .select({ id: promoProjects.id })
    .from(promoProjects)
    .where(and(eq(promoProjects.id, note.projectId), eq(promoProjects.userId, userId)))
    .limit(1)
  if (!project) throw new VideoLinkRefusal(404, "That Promo project is not there any more. Pick another one.")

  if ((note.kind === "carousel") !== note.slides.length > 0) {
    throw new VideoLinkRefusal(400, "A carousel comes with its slides, and nothing else does.")
  }
  if (note.kind !== "carousel" && !note.file) throw new VideoLinkRefusal(400, "The file is missing.")
  const files = pendingFiles(note)
  // Promo fetches only from the Video address that pressed Test, so a key
  // can never point Promo at some other server.
  if (!files.every((file) => onVideoAddress(link, file.url))) {
    throw new VideoLinkRefusal(400, "Press Test on Video's Settings → Promo first, so Promo knows Video's address.")
  }
  const editUrl = note.videoEditUrl && onVideoAddress(link, note.videoEditUrl) ? note.videoEditUrl : ""

  if (note.replaceItemId) {
    const [old] = await db
      .select({ id: promoArchiveItems.id })
      .from(promoArchiveItems)
      .where(
        and(
          eq(promoArchiveItems.id, note.replaceItemId),
          eq(promoArchiveItems.userId, userId),
          eq(promoArchiveItems.projectId, note.projectId),
          eq(promoArchiveItems.status, "ready")
        )
      )
      .limit(1)
    if (!old) throw new VideoLinkRefusal(404, "The archive item to replace is not there any more. Send it as new.")
  }

  const id = uuid()
  await db.insert(promoArchiveItems).values({
    id,
    userId,
    projectId: note.projectId,
    kind: note.kind,
    status: "copying",
    title: note.title.trim(),
    description: note.description,
    caption: note.caption,
    aspect: note.aspect,
    width: note.width,
    height: note.height,
    durationMs: note.durationMs,
    subtitles: note.subtitles,
    source: "video",
    sendId: note.sendId,
    videoExportId: note.videoExportId,
    videoProjectId: note.videoProjectId,
    videoProjectName: note.videoProjectName,
    videoEditUrl: editUrl,
    groupKey: note.groupKey,
    language: note.language,
    pending: { files, replaceItemId: note.replaceItemId, drafts: note.drafts },
    createdAt: now,
    updatedAt: now,
  })
  return { itemId: id, status: "copying", itemUrl: appUrlFor(archiveItemHref(note.projectId, id)) }
}

export type CopyDeps = {
  db?: CustomShellDb
  store?: ArchiveStore
  fetchImpl?: typeof fetch
  tell?: (userId: string, body: unknown) => Promise<unknown>
  now?: () => Date
}

/** A copy that has not finished in three hours is taken as dead, and its item as failed. */
export const COPY_HOURS = 3

/** A file name's ending from its type. */
function extensionFor(mimeType: string): string {
  const known: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
  }
  return known[mimeType] ?? "bin"
}

function fileName(file: ArchivePendingFile): string {
  const ending = extensionFor(file.mimeType)
  if (file.role === "slide") return `slide-${String((file.position ?? 0) + 1).padStart(2, "0")}.${ending}`
  return `${file.role}.${ending}`
}

/**
 * Fetches every file of one copying item and finishes it. Claims the item
 * first, so two runs never copy the same one. Never throws: a failure is
 * the item's end, told to Video.
 */
export async function copyArrival(itemId: string, deps: CopyDeps = {}): Promise<"ready" | "failed" | "skipped"> {
  const db = deps.db ?? defaultDb
  const store = deps.store ?? bucketStore
  const fetchImpl = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => new Date())
  const tell = deps.tell ?? ((userId: string, body: unknown) => callVideo(userId, "/api/connect/promo/events", body, { db }))

  const startedAt = now()
  const [item] = await db
    .update(promoArchiveItems)
    .set({ claimedAt: startedAt, attempts: 1, updatedAt: startedAt })
    .where(and(eq(promoArchiveItems.id, itemId), eq(promoArchiveItems.status, "copying"), isNull(promoArchiveItems.claimedAt)))
    .returning()
  if (!item) return "skipped"

  const pending: ArchivePending = item.pending ?? { files: [] }
  const stored: { file: ArchivePendingFile; path: string; bytes: number }[] = []
  try {
    for (const file of pending.files) {
      const path = archivePath(item.userId, item.id, fileName(file))
      const bytes = await copyIntoStore(
        { url: file.url, mimeType: file.mimeType, expectedBytes: file.size },
        path,
        { store, fetchImpl, maxBytes: MAX_ARCHIVE_FILE_BYTES, timeoutMs: COPY_HOURS * 3600_000 }
      )
      stored.push({ file, path, bytes })
    }
  } catch (error) {
    await failArrival(item, error instanceof Error ? error.message : "The copy failed.", stored.map((entry) => entry.path), { db, store, tell })
    return "failed"
  }

  const main = stored.find((entry) => entry.file.role === "main")
  const cover = stored.find((entry) => entry.file.role === "cover")
  const pdf = stored.find((entry) => entry.file.role === "pdf")
  const slides = stored.filter((entry) => entry.file.role === "slide")
  const files = {
    storagePath: main?.path ?? "",
    mimeType: main?.file.mimeType ?? "",
    coverPath: cover?.path ?? "",
    pdfPath: pdf?.path ?? "",
    fileSize: stored.reduce((sum, entry) => sum + entry.bytes, 0),
  }
  const at = now()
  const target = pending.replaceItemId ?? item.id
  let oldPaths: string[] = []

  try {
    await db.transaction(async (tx) => {
      if (pending.replaceItemId) {
        // A newer version takes the old item's place: its files, words and
        // subtitles change, and its drafts and posted marks stay (part 18).
        const [old] = await tx
          .select()
          .from(promoArchiveItems)
          .where(and(eq(promoArchiveItems.id, pending.replaceItemId), eq(promoArchiveItems.userId, item.userId)))
          .limit(1)
        if (!old) throw new Error("The archive item to replace is not there any more. Send it as new.")
        const oldSlides = await tx.select({ path: promoArchiveSlides.storagePath }).from(promoArchiveSlides).where(eq(promoArchiveSlides.itemId, old.id))
        oldPaths = [old.storagePath, old.coverPath, old.pdfPath, ...oldSlides.map((slide) => slide.path)].filter(Boolean)
        await tx.delete(promoArchiveSlides).where(eq(promoArchiveSlides.itemId, old.id))
        // The stand-in row goes first, because its send id moves onto the old item.
        await tx.delete(promoArchiveItems).where(eq(promoArchiveItems.id, item.id))
        await tx
          .update(promoArchiveItems)
          .set({
            ...files,
            kind: item.kind,
            title: item.title,
            description: item.description,
            caption: item.caption,
            aspect: item.aspect,
            width: item.width,
            height: item.height,
            durationMs: item.durationMs,
            subtitles: item.subtitles,
            videoExportId: item.videoExportId,
            videoEditUrl: item.videoEditUrl || old.videoEditUrl,
            sendId: item.sendId,
            updatedAt: at,
          })
          .where(eq(promoArchiveItems.id, old.id))
      } else {
        await tx
          .update(promoArchiveItems)
          .set({ ...files, status: "ready", pending: null, updatedAt: at })
          .where(eq(promoArchiveItems.id, item.id))
      }
      if (slides.length) {
        await tx.insert(promoArchiveSlides).values(
          slides.map((entry) => ({
            id: uuid(),
            itemId: target,
            position: entry.file.position ?? 0,
            kind: entry.file.kind ?? "photo",
            storagePath: entry.path,
            mimeType: entry.file.mimeType,
            fileSize: entry.bytes,
          }))
        )
      }
      const drafts = pending.drafts ?? []
      if (drafts.length) {
        await tx
          .insert(promoArchiveDrafts)
          .values(drafts.map((network) => ({ id: uuid(), userId: item.userId, itemId: target, projectId: item.projectId, network, createdAt: at })))
          .onConflictDoNothing()
      }
    })
  } catch (error) {
    await failArrival(item, error instanceof Error ? error.message : "The copy failed.", stored.map((entry) => entry.path), { db, store, tell })
    return "failed"
  }

  for (const path of oldPaths) await store.remove(path).catch((error) => console.error("An old archive file stayed in the bucket", path, error))

  const href = archiveItemHref(item.projectId, target)
  const [project] = await db.select({ name: promoProjects.name }).from(promoProjects).where(eq(promoProjects.id, item.projectId)).limit(1)
  await ringBell(
    item.userId,
    {
      kind: "archive_arrived",
      targetId: target,
      message: `Arrived in the archive: ${item.title || "Untitled"}`,
      detail: project ? `In ${project.name}.` : "",
      href,
    },
    db,
    at
  )
  await tell(item.userId, { type: "arrived", sendId: item.sendId, itemId: target, itemUrl: appUrlFor(href) }).catch((error) =>
    console.error("Video was not told an archive item arrived", target, error)
  )
  return "ready"
}

/** Ends a failed copy: its files and its item go, and Video is told why. */
async function failArrival(
  item: PromoArchiveItemRow,
  reason: string,
  paths: string[],
  { db, store, tell }: { db: CustomShellDb; store: ArchiveStore; tell: (userId: string, body: unknown) => Promise<unknown> }
) {
  for (const path of paths) await store.remove(path).catch((error) => console.error("A half-copied archive file stayed in the bucket", path, error))
  await db.delete(promoArchiveItems).where(eq(promoArchiveItems.id, item.id))
  await tell(item.userId, { type: "failed", sendId: item.sendId, error: reason.slice(0, 500) }).catch((error) =>
    console.error("Video was not told an archive copy failed", item.id, error)
  )
}

/**
 * The ticker's pass: starts any copy whose start was lost (the server
 * stopped between the answer and the copy), and fails any that has run past
 * its time. Each copy runs on its own; this never waits for one.
 */
export async function sweepArrivals(deps: CopyDeps = {}): Promise<void> {
  const db = deps.db ?? defaultDb
  const store = deps.store ?? bucketStore
  const now = deps.now ?? (() => new Date())
  const tell = deps.tell ?? ((userId: string, body: unknown) => callVideo(userId, "/api/connect/promo/events", body, { db }))
  const at = now()
  const dead = await db
    .select()
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.status, "copying"), lt(promoArchiveItems.claimedAt, new Date(at.getTime() - COPY_HOURS * 3600_000))))
    .limit(20)
  for (const item of dead) {
    const paths = (item.pending?.files ?? []).map((file) => archivePath(item.userId, item.id, fileName(file)))
    await failArrival(item, "The copy took too long and was stopped. Try again.", paths, { db, store, tell })
  }
  const lost = await db
    .select({ id: promoArchiveItems.id })
    .from(promoArchiveItems)
    .where(
      and(
        eq(promoArchiveItems.status, "copying"),
        isNull(promoArchiveItems.claimedAt),
        lt(promoArchiveItems.createdAt, new Date(at.getTime() - 60_000))
      )
    )
    .limit(5)
  for (const { id } of lost) startCopy(id, deps.db ?? defaultDb, deps)
}

/**
 * Starts a copy without waiting for it. A failure it could not record
 * itself (the database gone mid-copy) is logged, never left to crash the
 * server; the upkeep pass ends that item after its three hours.
 */
export function startCopy(itemId: string, db: CustomShellDb, deps: CopyDeps = {}): void {
  copyArrival(itemId, { ...deps, db }).catch((error) => console.error("An archive copy stopped without finishing", itemId, error))
}
