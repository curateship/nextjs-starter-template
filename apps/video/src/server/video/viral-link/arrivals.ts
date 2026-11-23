import { and, desc, eq, isNull, lt, ne } from "drizzle-orm"
import { z } from "zod"

import { now as currentTime, uuid } from "@/server/auth/security"
import { appUrl } from "@/server/app-url"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications, customShellUsers } from "@/server/schema"
import { saveGeneratedAsset } from "@/server/video/asset-factories/media"
import { attachMediaToScope } from "@/server/video/media-list"
import { insertVideo } from "@/server/video/project-videos"
import {
  videoProjectMedia,
  videoProjects,
  videoProjectVideos,
  videoViralArrivals,
  type VideoViralArrivalRow,
  type VideoViralLinkRow,
  type ViralArrivalPending,
} from "@/server/video/schema"

import { callViral, cleanViralUrl, readViralSecret, rememberViralUrl, ViralLinkRefusal } from "./link"

/**
 * Send to Video, from a Viral vault item (`workspace/docs/viral-connection.md`).
 *
 * Viral posts a note naming the Video project, the script, the notes, the
 * vault item's address and, when the original video comes too, a token for
 * fetching it. Video makes the draft at once and answers; the file is then
 * fetched from Viral's own address, kept in Video's media library and put on
 * the project's Media shelf. When it is in, the bell rings and Viral is told.
 * When it fails, a draft this send made is deleted and Viral is told why, so
 * sending again starts clean. Viral's send id is kept, so the same send twice
 * makes one draft.
 */

export const SCRIPT_MAX = 20_000
export const NOTES_MAX = 20_000
const NAME_MAX = 80

/** The biggest original Video takes from Viral. A viral short is a few megabytes. */
export const MAX_VIRAL_FILE_BYTES = 200 * 1024 * 1024

/** A copy that has not finished in an hour is taken as dead. */
export const COPY_MINUTES = 60

export const helloShape = z.object({ viralUrl: z.string().max(500) })

export const draftShape = z.object({
  sendId: z.string().min(1).max(64),
  projectId: z.string().min(1).max(36),
  title: z.string().max(300).default(""),
  script: z.string().max(SCRIPT_MAX).default(""),
  notes: z.string().max(NOTES_MAX).default(""),
  vaultItemUrl: z.string().max(600).default(""),
  viralProjectName: z.string().max(200).default(""),
  file: z
    .object({
      token: z.string().min(16).max(200).regex(/^[A-Za-z0-9_-]+$/),
      name: z.string().max(300).default(""),
      contentType: z.string().max(100),
      size: z.number().int().min(0).max(MAX_VIRAL_FILE_BYTES),
    })
    .nullable()
    .default(null),
  replaceVideoId: z.string().min(1).max(36).optional(),
})

export type DraftNote = z.infer<typeof draftShape>

export type DraftAnswer = { videoId: string; editUrl: string; status: "copying" | "ready" }

export type SendStatus =
  | { status: "copying" | "ready"; videoId: string; editUrl: string }
  | { status: "gone" }

/** The draft's name: the title, or the script's first line, cut to a name's length. */
export function viralDraftName(title: string, script: string): string {
  const source = title.trim() || script.trim().split("\n")[0]?.trim() || ""
  return (source.length > NAME_MAX ? `${source.slice(0, NAME_MAX - 1).trimEnd()}…` : source) || "From Viral"
}

/** The editor's address for one video. */
export function editUrlFor(projectId: string, videoId: string): string {
  return `${appUrl().replace(/\/+$/, "")}/admin/video-editor/${encodeURIComponent(projectId)}?video=${encodeURIComponent(videoId)}`
}

/** The projects Viral's picker lists: the key's admin's own, not archived, newest first. */
async function projectsOf(userId: string, db: CustomShellDb): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: videoProjects.id, name: videoProjects.name })
    .from(videoProjects)
    .where(and(eq(videoProjects.userId, userId), isNull(videoProjects.archivedAt)))
    .orderBy(desc(videoProjects.updatedAt))
    .limit(200)
}

/**
 * Test in Viral's Settings → Video connection: keeps the Viral address it
 * came from, the only one Video fetches files from or calls back, and
 * answers whose Video this is and its projects.
 */
export async function hello(link: VideoViralLinkRow, data: z.infer<typeof helloShape>, db: CustomShellDb = defaultDb) {
  const viralUrl = cleanViralUrl(data.viralUrl)
  if (!viralUrl) throw new ViralLinkRefusal(400, "Viral's address must be a web address, and https on the live server.")
  await rememberViralUrl(link.userId, viralUrl, db)
  const [owner] = await db.select({ name: customShellUsers.name }).from(customShellUsers).where(eq(customShellUsers.id, link.userId)).limit(1)
  return { name: owner?.name ?? "", projects: await projectsOf(link.userId, db) }
}

/** The Video project picker in Viral's send window. */
export async function projects(link: VideoViralLinkRow, db: CustomShellDb = defaultDb) {
  return { projects: await projectsOf(link.userId, db) }
}

/** What one existing send answers when Viral sends it again or asks after it. */
function statusOf(row: Pick<VideoViralArrivalRow, "status" | "videoId" | "projectId">): SendStatus {
  if (row.status === "failed" || !row.videoId) return { status: "gone" }
  return { status: row.status, videoId: row.videoId, editUrl: editUrlFor(row.projectId, row.videoId) }
}

/** Where one send stands, for Viral's window while it waits. Only the key's own sends answer. */
export async function sendStatus(link: VideoViralLinkRow, sendId: string, db: CustomShellDb = defaultDb): Promise<SendStatus> {
  const [row] = await db
    .select()
    .from(videoViralArrivals)
    .where(and(eq(videoViralArrivals.userId, link.userId), eq(videoViralArrivals.sendId, sendId)))
    .limit(1)
  return row ? statusOf(row) : { status: "gone" }
}

/**
 * The link back to the vault item, kept only when it is on the Viral address
 * Test saved, so a draft never carries another site's link or a script.
 */
function onViral(viralUrl: string, vaultItemUrl: string): string {
  try {
    return new URL(vaultItemUrl).origin === new URL(viralUrl).origin ? vaultItemUrl : ""
  } catch {
    return ""
  }
}

/** Writes what a send carries onto its draft. */
function wordsFor(pending: ViralArrivalPending) {
  return {
    viralScript: pending.script || null,
    viralNotes: pending.notes || null,
    viralVaultUrl: pending.vaultItemUrl || null,
  }
}

/** Rings the draft owner's bell. The draft is made either way; the bell is a nicety. */
async function ringArrived(userId: string, name: string, pending: ViralArrivalPending, db: CustomShellDb, at: Date) {
  try {
    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      type: "app_activity",
      message: `${name} arrived from Viral`.slice(0, 300),
      detail: pending.viralProjectName ? `From ${pending.viralProjectName}.`.slice(0, 500) : "From Viral.",
      createdAt: at,
    })
    await publishNotificationCreated(userId, db)
  } catch (error) {
    console.error("A Viral arrival's notice could not be written", error)
  }
}

/**
 * Takes a send from Viral: checks the project and the draft being replaced
 * are the key's admin's own, then makes the draft (or, when replacing, keeps
 * the words until the file is in) and answers. The same send id twice
 * answers the first one.
 */
export async function acceptDraft(
  link: VideoViralLinkRow,
  note: DraftNote,
  db: CustomShellDb = defaultDb,
  at: Date = currentTime()
): Promise<DraftAnswer & { arrivalId: string }> {
  const answerFor = (row: VideoViralArrivalRow): DraftAnswer & { arrivalId: string } => {
    const status = statusOf(row)
    if (status.status === "gone") throw new ViralLinkRefusal(409, "This send failed already. Send it again from Viral.")
    return { ...status, arrivalId: row.id }
  }
  const [already] = await db
    .select()
    .from(videoViralArrivals)
    .where(and(eq(videoViralArrivals.userId, link.userId), eq(videoViralArrivals.sendId, note.sendId)))
    .limit(1)
  if (already) return answerFor(already)

  const [project] = await db
    .select({ id: videoProjects.id })
    .from(videoProjects)
    .where(and(eq(videoProjects.id, note.projectId), eq(videoProjects.userId, link.userId), isNull(videoProjects.archivedAt)))
    .limit(1)
  if (!project) throw new ViralLinkRefusal(404, "That Video project isn't there any more. Pick another one.")

  if (note.file && !note.file.contentType.startsWith("video/")) {
    throw new ViralLinkRefusal(400, "Video only takes a video file from Viral.")
  }
  if (note.replaceVideoId) {
    const [target] = await db
      .select({ id: videoProjectVideos.id })
      .from(videoProjectVideos)
      .where(
        and(
          eq(videoProjectVideos.id, note.replaceVideoId),
          eq(videoProjectVideos.projectId, project.id),
          eq(videoProjectVideos.userId, link.userId)
        )
      )
      .limit(1)
    if (!target) throw new ViralLinkRefusal(404, "The draft to replace isn't in that Video project any more. Send it as new.")
  }

  const pending: ViralArrivalPending = {
    title: note.title,
    script: note.script,
    notes: note.notes,
    vaultItemUrl: onViral(link.viralUrl, note.vaultItemUrl),
    viralProjectName: note.viralProjectName,
    file: note.file,
  }
  const name = viralDraftName(note.title, note.script)
  const status = note.file ? "copying" : "ready"
  const replacing = Boolean(note.replaceVideoId)

  let row: VideoViralArrivalRow
  try {
    row = await db.transaction(async (tx) => {
      let videoId = note.replaceVideoId ?? null
      if (!videoId) {
        // A new draft carries its words from the start, so it is never seen
        // without its script.
        const made = await insertVideo(link.userId, project.id, { name, status: "draft" }, tx)
        await tx.update(videoProjectVideos).set(wordsFor(pending)).where(eq(videoProjectVideos.id, made.id))
        videoId = made.id
      } else if (!note.file) {
        // Replacing with no file: the words change now, there is nothing to wait for.
        await tx.update(videoProjectVideos).set({ ...wordsFor(pending), updatedAt: at }).where(eq(videoProjectVideos.id, videoId))
      }
      const [inserted] = await tx
        .insert(videoViralArrivals)
        .values({
          id: uuid(),
          userId: link.userId,
          sendId: note.sendId,
          projectId: project.id,
          videoId,
          replacing,
          status,
          pending,
          createdAt: at,
          updatedAt: at,
        })
        .returning()
      return inserted
    })
  } catch (error) {
    // Two copies of the same send at once: the one that lost answers the winner.
    const [winner] = await db
      .select()
      .from(videoViralArrivals)
      .where(and(eq(videoViralArrivals.userId, link.userId), eq(videoViralArrivals.sendId, note.sendId)))
      .limit(1)
    if (winner) return answerFor(winner)
    throw error
  }

  if (status === "ready") await ringArrived(link.userId, name, pending, db, at)
  return answerFor(row)
}

/** Stores one fetched file in the media library and answers its id. Swapped in tests. */
export type SaveFile = (file: { userId: string; bytes: Uint8Array; mimeType: string; name: string }) => Promise<{ id: string }>

const saveToLibrary: SaveFile = async ({ userId, bytes, mimeType, name }) =>
  saveGeneratedAsset({ userId, bytes, mimeType, fileType: "video", name })

export type CopyDeps = {
  db?: CustomShellDb
  fetchImpl?: typeof fetch
  saveFile?: SaveFile
  tell?: (userId: string, body: unknown) => Promise<unknown>
  now?: () => Date
}

/**
 * Fetches the original from Viral's own address with the key, refusing a
 * redirect, a file that isn't a video, and one past the cap. Answers its
 * bytes and type.
 */
export async function fetchViralFile(
  viralUrl: string,
  key: string,
  token: string,
  { fetchImpl, maxBytes, expectedBytes }: { fetchImpl: typeof fetch; maxBytes: number; expectedBytes: number }
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const response = await fetchImpl(`${viralUrl}/api/connect/video/file/${encodeURIComponent(token)}`, {
    headers: { authorization: `Bearer ${key}` },
    redirect: "error",
    signal: AbortSignal.timeout(COPY_MINUTES * 60_000),
  }).catch(() => {
    throw new Error("Viral could not be reached for the video.")
  })
  if (!response.ok || !response.body) throw new Error(`Viral answered ${response.status} for the video.`)
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase()
  if (!mimeType.startsWith("video/")) {
    await response.body.cancel().catch(() => undefined)
    throw new Error("Viral's file isn't a video, so Video didn't keep it.")
  }
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > maxBytes) {
    await response.body.cancel().catch(() => undefined)
    throw new Error("The video is bigger than Video takes from Viral.")
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value?.byteLength) {
        total += value.byteLength
        if (total > maxBytes) throw new Error("The video is bigger than Video takes from Viral.")
        chunks.push(value)
      }
      if (done) break
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }
  if (expectedBytes > 0 && total !== expectedBytes) throw new Error("The video arrived incomplete.")
  const bytes = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return { bytes, mimeType }
}

/**
 * Fetches one copying send's file and finishes it. Claims the send first, so
 * two runs never copy the same one. Never throws: a failure is the send's
 * end, told to Viral.
 */
export async function copyArrival(arrivalId: string, deps: CopyDeps = {}): Promise<"ready" | "failed" | "skipped"> {
  const db = deps.db ?? defaultDb
  const fetchImpl = deps.fetchImpl ?? fetch
  const saveFile = deps.saveFile ?? saveToLibrary
  const now = deps.now ?? currentTime
  const tell = deps.tell ?? ((userId: string, body: unknown) => callViral(userId, "/api/connect/video/events", body, { db }))

  const startedAt = now()
  const [row] = await db
    .update(videoViralArrivals)
    .set({ claimedAt: startedAt, updatedAt: startedAt })
    .where(and(eq(videoViralArrivals.id, arrivalId), eq(videoViralArrivals.status, "copying"), isNull(videoViralArrivals.claimedAt)))
    .returning()
  if (!row) return "skipped"

  const pending = row.pending
  let mediaId: string
  try {
    if (!pending.file) throw new Error("This send names no file.")
    if (!row.videoId) throw new Error("The draft was deleted before the video arrived.")
    const { viralUrl, key } = await readViralSecret(row.userId, db)
    const file = await fetchViralFile(viralUrl, key, pending.file.token, {
      fetchImpl,
      maxBytes: MAX_VIRAL_FILE_BYTES,
      expectedBytes: pending.file.size,
    })
    const saved = await saveFile({
      userId: row.userId,
      bytes: file.bytes,
      mimeType: file.mimeType,
      name: pending.file.name.replace(/\.[a-z0-9]{2,5}$/i, "") || viralDraftName(pending.title, pending.script),
    })
    mediaId = saved.id
    await attachMediaToScope(row.userId, { type: "project", id: row.projectId }, mediaId, db)
  } catch (error) {
    await failArrival(row, error instanceof Error ? error.message : "The copy failed.", { db, tell, now })
    return "failed"
  }

  const at = now()
  const videoId = row.videoId as string
  // A Replace swaps the file: the one the last send put on the shelf comes
  // off it, unless the draft's timeline already uses it. It stays in the
  // media library either way.
  const [previous] = row.replacing
    ? await db
        .select({ mediaId: videoViralArrivals.mediaId })
        .from(videoViralArrivals)
        .where(
          and(
            eq(videoViralArrivals.videoId, videoId),
            eq(videoViralArrivals.status, "ready"),
            ne(videoViralArrivals.id, row.id)
          )
        )
        .orderBy(desc(videoViralArrivals.updatedAt))
        .limit(1)
    : []
  await db.transaction(async (tx) => {
    if (row.replacing) {
      await tx.update(videoProjectVideos).set({ ...wordsFor(pending), updatedAt: at }).where(eq(videoProjectVideos.id, videoId))
      if (previous?.mediaId && previous.mediaId !== mediaId) {
        const [draft] = await tx
          .select({ timeline: videoProjectVideos.timeline })
          .from(videoProjectVideos)
          .where(eq(videoProjectVideos.id, videoId))
          .limit(1)
        if (!JSON.stringify(draft?.timeline ?? {}).includes(previous.mediaId)) {
          await tx
            .delete(videoProjectMedia)
            .where(and(eq(videoProjectMedia.projectId, row.projectId), eq(videoProjectMedia.mediaId, previous.mediaId)))
        }
      }
    }
    await tx.update(videoViralArrivals).set({ status: "ready", mediaId, error: "", updatedAt: at }).where(eq(videoViralArrivals.id, row.id))
  })

  const [draft] = await db.select({ name: videoProjectVideos.name }).from(videoProjectVideos).where(eq(videoProjectVideos.id, videoId)).limit(1)
  await ringArrived(row.userId, draft?.name ?? viralDraftName(pending.title, pending.script), pending, db, at)
  await tell(row.userId, { type: "arrived", sendId: row.sendId, videoId, editUrl: editUrlFor(row.projectId, videoId) }).catch((error) =>
    console.error("Viral was not told a send arrived", row.id, error)
  )
  return "ready"
}

/**
 * Ends a send whose file never arrived. A draft the send made itself is
 * deleted, so sending again starts clean; a draft being replaced keeps its
 * old words and file. Viral is told why.
 */
async function failArrival(
  row: VideoViralArrivalRow,
  reason: string,
  { db, tell, now }: { db: CustomShellDb; tell: (userId: string, body: unknown) => Promise<unknown>; now: () => Date }
) {
  const at = now()
  await db.transaction(async (tx) => {
    await tx
      .update(videoViralArrivals)
      .set({ status: "failed", error: reason.slice(0, 500), videoId: row.replacing ? row.videoId : null, updatedAt: at })
      .where(eq(videoViralArrivals.id, row.id))
    if (!row.replacing && row.videoId) await tx.delete(videoProjectVideos).where(eq(videoProjectVideos.id, row.videoId))
  })
  await tell(row.userId, { type: "failed", sendId: row.sendId, error: reason.slice(0, 500) }).catch((error) =>
    console.error("Viral was not told a send failed", row.id, error)
  )
}

/**
 * The ticker's pass: fails any copy that has run past its hour, and starts
 * any whose start was lost (the server stopped between the answer and the
 * copy). Each copy runs on its own; this never waits for one.
 */
export async function sweepViralArrivals(deps: CopyDeps = {}): Promise<void> {
  const db = deps.db ?? defaultDb
  const now = deps.now ?? currentTime
  const tell = deps.tell ?? ((userId: string, body: unknown) => callViral(userId, "/api/connect/video/events", body, { db }))
  const at = now()
  const dead = await db
    .select()
    .from(videoViralArrivals)
    .where(and(eq(videoViralArrivals.status, "copying"), lt(videoViralArrivals.claimedAt, new Date(at.getTime() - COPY_MINUTES * 60_000))))
    .limit(20)
  for (const row of dead) await failArrival(row, "The copy took too long and was stopped. Send it again.", { db, tell, now })
  const lost = await db
    .select({ id: videoViralArrivals.id })
    .from(videoViralArrivals)
    .where(
      and(
        eq(videoViralArrivals.status, "copying"),
        isNull(videoViralArrivals.claimedAt),
        lt(videoViralArrivals.createdAt, new Date(at.getTime() - 60_000))
      )
    )
    .limit(5)
  for (const { id } of lost) startCopy(id, { ...deps, db })
}

/**
 * Starts a copy without waiting for it. A failure it could not record itself
 * is logged, never left to crash the server; the sweep ends that send after
 * its hour.
 */
export function startCopy(arrivalId: string, deps: CopyDeps = {}): void {
  copyArrival(arrivalId, deps).catch((error) => console.error("A Viral copy stopped without finishing", arrivalId, error))
}

/** A send from Viral: the draft is made at once, and its file is copied after the answer. */
export async function arrive(link: VideoViralLinkRow, note: DraftNote, db: CustomShellDb = defaultDb): Promise<DraftAnswer> {
  const { arrivalId, ...answer } = await acceptDraft(link, note, db)
  if (answer.status === "copying") startCopy(arrivalId, { db })
  return answer
}
