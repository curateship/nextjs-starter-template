import { createHash, randomBytes } from "node:crypto"

import { and, desc, eq, gt, inArray } from "drizzle-orm"
import { z } from "zod"

import { scriptText } from "@/lib/viral/analysis"
import { viralSays } from "@/lib/viral/viral"
import { segmentRoleLabels } from "@/lib/viral/viral-breakdown"
import type { VaultItem } from "@/lib/viral/vault"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralProjects, viralSends, viralVaultItems, type ViralSendRow } from "@/server/viral/schema"
import { getVideoUrl } from "@/server/viral/settings"
import { loadVaultItem } from "@/server/viral/vault"
import { callVideo, readVideoConnection, VideoRefusal, viralAddress } from "@/server/viral/video-link"

/**
 * Send to Video (`workspace/docs/send-to-video.md`, task part 22). Tyler,
 * 4 Nov 2026: "Send to Video button", "Draft + script + original". One press
 * makes a draft video in the Video project picked, with the script as its
 * notes and a link back to the vault item, and Video then fetches the
 * vault's own copy of the original into that project's Media.
 *
 * Each send is a row here, and its id is the send id Video knows it by. A
 * send that failed is never sent again under the same id, because Video
 * answers a repeated failed id with "failed already": Try again makes a new
 * send.
 */

/** How long the file link in a send works. */
const FILE_LINK_MS = 2 * 60 * 60 * 1000

/** Video refuses files over this size, so Viral says so first. */
export const VIDEO_FILE_MAX_BYTES = 200 * 1024 * 1024

/** A send still "sending" after this long lost its answer, and Try again opens up. */
const SENDING_STALE_MS = 2 * 60 * 1000

const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex")

export type SendMode = "new" | "replace"

const draftAnswerShape = z.object({
  videoId: z.string().min(1).max(36),
  editUrl: z.string().max(600).default(""),
  status: z.enum(["copying", "ready"]),
})

/**
 * An Open in Video address, kept only when it is on the saved Video address,
 * so an answer can never put another site's link or a script on the button.
 */
export function onVideo(videoUrl: string, editUrl: string): string {
  try {
    return new URL(editUrl).origin === new URL(videoUrl).origin ? editUrl.slice(0, 600) : ""
  } catch {
    return ""
  }
}

/**
 * Sends one vault item. An item sent before needs `mode`: "replace" swaps the
 * words and the file on the draft already made, "new" makes another draft.
 */
export async function sendToVideo(
  ownerId: string,
  input: { itemId: string; videoProjectId: string; mode: SendMode | null },
  fetchImpl: typeof fetch = fetch
): Promise<VaultItem> {
  const connection = await readVideoConnection().catch((error: Error) => {
    throw viralSays(error.message)
  })
  const [item] = await db
    .select()
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.id, input.itemId), eq(viralVaultItems.ownerId, ownerId)))
  if (!item) throw viralSays("That idea is no longer in the vault.")
  if (item.sentVideoId && !input.mode) {
    throw viralSays("This idea was sent to Video already. Pick Replace or Send as new.")
  }
  const replacing = input.mode === "replace" && !!item.sentVideoId
  const project = await requireOwnedViralProject(ownerId, item.projectId)

  let file: { token: string; name: string; contentType: string; size: number } | null = null
  if (item.mediaId) {
    const [media] = await db
      .select({ originalName: customShellMedia.originalName, mimeType: customShellMedia.mimeType, fileSize: customShellMedia.fileSize })
      .from(customShellMedia)
      .where(eq(customShellMedia.id, item.mediaId))
    if (media) {
      if (media.fileSize > VIDEO_FILE_MAX_BYTES) {
        throw viralSays("This video is over 200 MB, which Video won't take. Trim it in the original app first.")
      }
      file = { token: randomBytes(32).toString("base64url"), name: media.originalName, contentType: media.mimeType, size: media.fileSize }
    }
  }

  const at = now()
  const sendId = uuid()
  await db.insert(viralSends).values({
    id: sendId,
    ownerId,
    itemId: item.id,
    videoProjectId: input.videoProjectId,
    replacing,
    status: "sending",
    tokenHash: file ? tokenHash(file.token) : null,
    tokenExpiresAt: file ? new Date(at.getTime() + FILE_LINK_MS) : null,
    createdAt: at,
    updatedAt: at,
  })

  const script = item.analysis ? scriptText(item.analysis.script, segmentRoleLabels) : ""
  let answer: z.infer<typeof draftAnswerShape>
  try {
    const reply = await callVideo<unknown>(
      connection,
      "/api/connect/viral/drafts",
      {
        sendId,
        projectId: input.videoProjectId,
        title: item.analysis?.title.title || item.title,
        script,
        notes: item.notes,
        vaultItemUrl: `${viralAddress()}/admin/vault?open=${encodeURIComponent(item.id)}`,
        viralProjectName: project.name,
        file,
        ...(replacing && item.sentVideoId ? { replaceVideoId: item.sentVideoId } : {}),
      },
      fetchImpl
    )
    const checked = draftAnswerShape.safeParse(reply)
    if (!checked.success) throw new VideoRefusal(0, "Video answered in a way Viral doesn't know. Try again.")
    answer = checked.data
  } catch (error) {
    const message = error instanceof VideoRefusal ? error.message : "Video couldn't be reached. Try again."
    await db.update(viralSends).set({ status: "failed", error: message.slice(0, 500), tokenHash: null, updatedAt: now() }).where(eq(viralSends.id, sendId))
    throw viralSays(message)
  }

  const editUrl = onVideo(connection.url, answer.editUrl)
  await db.transaction(async (tx) => {
    // Video's news can land before this: a small file copies in moments. A
    // send it already finished keeps its status, and one it failed leaves the
    // item as it was.
    const [moved] = await tx
      .update(viralSends)
      .set({ status: answer.status, videoId: answer.videoId, editUrl, updatedAt: now() })
      .where(and(eq(viralSends.id, sendId), eq(viralSends.status, "sending")))
      .returning({ id: viralSends.id })
    if (!moved) {
      const [current] = await tx.select({ status: viralSends.status }).from(viralSends).where(eq(viralSends.id, sendId))
      if (current?.status === "failed") return
    }
    await tx
      .update(viralVaultItems)
      .set({ status: "sent", sentVideoId: answer.videoId, sentEditUrl: editUrl || null, sentAt: now(), updatedAt: now() })
      .where(eq(viralVaultItems.id, item.id))
    await tx.update(viralProjects).set({ lastVideoProjectId: input.videoProjectId }).where(eq(viralProjects.id, project.id))
  })
  return loadVaultItem(ownerId, item.id)
}

/** The send a file link belongs to, while the link still works. */
export async function sendForToken(token: string): Promise<ViralSendRow | null> {
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(token)) return null
  const [row] = await db
    .select()
    .from(viralSends)
    .where(and(eq(viralSends.tokenHash, tokenHash(token)), gt(viralSends.tokenExpiresAt, now())))
  return row ?? null
}

/** Streams the vault item's stored video to Video. */
export async function streamSendFile(send: ViralSendRow): Promise<Response> {
  const [row] = await db
    .select({ storagePath: customShellMedia.storagePath, mimeType: customShellMedia.mimeType })
    .from(viralVaultItems)
    .innerJoin(customShellMedia, eq(customShellMedia.id, viralVaultItems.mediaId))
    .where(eq(viralVaultItems.id, send.itemId))
  if (!row) return Response.json({ error: "No such file." }, { status: 404, headers: { "cache-control": "no-store" } })
  const object = await getFromR2(row.storagePath)
  if (!object.Body) return Response.json({ error: "The stored file is empty." }, { status: 502, headers: { "cache-control": "no-store" } })
  const headers = new Headers({ "content-type": row.mimeType, "cache-control": "no-store", "x-content-type-options": "nosniff" })
  if (object.ContentLength !== undefined) headers.set("content-length", String(object.ContentLength))
  return new Response(object.Body.transformToWebStream(), { headers })
}

export type VideoEvent =
  | { type: "arrived"; sendId: string; videoId: string; editUrl: string }
  | { type: "failed"; sendId: string; error: string }

/**
 * Video's news about a send: the original arrived in the draft's Media, or
 * the copy failed. A failed new draft is deleted on Video's side, so the
 * vault item stops saying Sent; a failed Replace keeps the old draft, so it
 * still says Sent. The file link stops working either way. A send that is
 * already ready or failed is finished, and news about it changes nothing,
 * nor does "arrived" naming a different draft than Video answered with.
 */
export async function applyVideoEvent(event: VideoEvent): Promise<{ ok: true }> {
  const [send] = await db
    .select()
    .from(viralSends)
    .where(and(eq(viralSends.id, event.sendId), inArray(viralSends.status, ["sending", "copying"])))
  if (!send) return { ok: true }
  const at = now()
  if (event.type === "arrived") {
    if (send.videoId && send.videoId !== event.videoId) return { ok: true }
    const editUrl = onVideo(await getVideoUrl(), event.editUrl)
    await db
      .update(viralSends)
      .set({ status: "ready", videoId: event.videoId, editUrl: editUrl || send.editUrl, tokenHash: null, updatedAt: at })
      .where(eq(viralSends.id, send.id))
    return { ok: true }
  }
  await db.transaction(async (tx) => {
    await tx
      .update(viralSends)
      .set({ status: "failed", error: (event.error || "Video could not copy the video.").slice(0, 500), tokenHash: null, updatedAt: at })
      .where(eq(viralSends.id, send.id))
    if (send.replacing || !send.videoId) return
    const [item] = await tx.select().from(viralVaultItems).where(eq(viralVaultItems.id, send.itemId))
    if (item?.sentVideoId !== send.videoId) return
    // The newest earlier send that still stands, if any, is what the item points at now.
    const [earlier] = await tx
      .select()
      .from(viralSends)
      .where(and(eq(viralSends.itemId, item.id), eq(viralSends.status, "ready")))
      .orderBy(desc(viralSends.createdAt))
      .limit(1)
    await tx
      .update(viralVaultItems)
      .set(
        earlier?.videoId
          ? { sentVideoId: earlier.videoId, sentEditUrl: earlier.editUrl, updatedAt: at }
          : { status: item.analysis ? "scripted" : "idea", sentVideoId: null, sentEditUrl: null, sentAt: null, updatedAt: at }
      )
      .where(eq(viralVaultItems.id, item.id))
  })
  return { ok: true }
}

/**
 * Asks Video how a send still copying is doing, for the progress line. A
 * send Video calls "gone" failed there; it is marked failed here too. A send
 * stuck at "sending" (the server stopped before Video's answer was kept) is
 * marked failed after two minutes, so Send to Video works again.
 */
export async function refreshSendStatus(ownerId: string, sendId: string, fetchImpl: typeof fetch = fetch): Promise<VaultItem> {
  const [send] = await db.select().from(viralSends).where(and(eq(viralSends.id, sendId), eq(viralSends.ownerId, ownerId)))
  if (!send) throw viralSays("That send is gone.")
  if (send.status === "sending" && now().getTime() - send.createdAt.getTime() > SENDING_STALE_MS) {
    await applyVideoEvent({ type: "failed", sendId: send.id, error: "The send didn't finish. Send it again." })
  }
  if (send.status === "copying") {
    const connection = await readVideoConnection().catch((error: Error) => {
      throw viralSays(error.message)
    })
    const answer = await callVideo<{ status: "copying" | "ready" | "gone"; videoId?: string; editUrl?: string }>(
      connection,
      `/api/connect/viral/sends/${encodeURIComponent(send.id)}`,
      undefined,
      fetchImpl
    ).catch((error) => {
      throw viralSays(error instanceof Error ? error.message : "Video couldn't be reached.")
    })
    if (answer.status === "ready" && answer.videoId && answer.editUrl) {
      await applyVideoEvent({ type: "arrived", sendId: send.id, videoId: answer.videoId, editUrl: answer.editUrl })
    } else if (answer.status === "gone") {
      await applyVideoEvent({ type: "failed", sendId: send.id, error: "Video could not copy the video. Send it again." })
    }
  }
  return loadVaultItem(ownerId, send.itemId)
}

/** The Video project the picker opens on: the one this Viral project sent to last. */
export async function lastVideoProjectFor(ownerId: string, projectId: string): Promise<string | null> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  return project.lastVideoProjectId
}
