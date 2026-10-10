import { and, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { getFromR2, getPublicMediaUrl } from "@/server/media/storage"
import {
  freshKey,
  logCatalogAct,
  storeCatalogBytes,
} from "@/server/pomodoro/admin-catalog"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import {
  foldNotice,
  reportQueueAdminIds,
  writeNotices,
} from "@/server/pomodoro/notices"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroMediaUploads,
  pomodoroNoticeLinks,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { creditHandle, sharedWithOthers } from "@/server/pomodoro/shared-media"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import {
  MEDIA_PAGE,
  SHARE_WAITING_PAGE,
  shareRemovedMessage,
  shareWaitingMessage,
} from "@/lib/pomodoro/notices"
import { sharedFilePath, type SharedMediaItem } from "@/lib/pomodoro/shared-media"
import {
  unshareReasonText,
  type UnshareReasonId,
} from "@/lib/pomodoro/shared-media-reports"

/**
 * What an admin can do with shared files (task 05, parts 4, 5, 7 and 8):
 * take one off sharing with a reason, approve a member's first share,
 * feature one on the front page, and copy one into the catalogue. Every
 * press writes one row to `pomodoro_audit_logs`. Only the take-down tells
 * the member anything. See `workspace/docs/shared-media.md`.
 */

const uploads = pomodoroMediaUploads
const fileName = sql<string>`coalesce(${uploads.name}, ${customShellMedia.originalName})`

export type BulkShareResult = { done: string[]; skipped: string[] }

/**
 * Takes files off sharing without deleting them. The owner keeps the file
 * but cannot share it again, and their bell names the file and the reason.
 * Anybody using it falls back on their next load, as with any unshare.
 * A file that was not shared or waiting is skipped.
 */
export async function unshareSharedFiles({
  mediaIds,
  reason,
  note,
  actorUserId,
}: {
  mediaIds: string[]
  reason: UnshareReasonId
  note: string
  actorUserId: string
}): Promise<BulkShareResult> {
  const text = unshareReasonText(reason, note)
  return db.transaction(async (tx) => {
    const changed = await tx
      .update(uploads)
      .set({
        shared: false,
        shareWaitingSince: null,
        featuredAt: null,
        adminUnsharedAt: new Date(),
        adminUnshareReason: text,
        updatedAt: new Date(),
      })
      .where(and(inArray(uploads.mediaId, mediaIds), eq(uploads.shared, true)))
      .returning({
        mediaId: uploads.mediaId,
        userId: uploads.userId,
        purpose: uploads.purpose,
      })
    if (!changed.length) return { done: [], skipped: mediaIds }
    forgetFeaturedSharedFile()

    const names = await tx
      .select({ mediaId: uploads.mediaId, name: fileName })
      .from(uploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
      .where(inArray(uploads.mediaId, changed.map((row) => row.mediaId)))
    const nameOf = new Map(names.map((row) => [row.mediaId, row.name]))
    await writeNotices(
      tx,
      changed.map((row) => ({
        recipientUserId: row.userId,
        kind: "share_removed" as const,
        message: shareRemovedMessage(nameOf.get(row.mediaId) ?? "your file"),
        detail: text,
        href: row.purpose === "sound" ? MEDIA_PAGE.sound : MEDIA_PAGE.background,
      }))
    )
    const done = changed.map((row) => row.mediaId)
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "unshare",
      resource: "member_uploads",
      recordIds: done,
    })
    const gone = new Set(done)
    return { done, skipped: mediaIds.filter((id) => !gone.has(id)) }
  })
}

/**
 * Approves files waiting for an admin's first check: they go out at once,
 * and their owners' later shares never wait. The owner is not told; the file
 * simply stops saying "Waiting for a check".
 */
export async function approveSharedFiles({
  mediaIds,
  actorUserId,
}: {
  mediaIds: string[]
  actorUserId: string
}): Promise<BulkShareResult> {
  return db.transaction(async (tx) => {
    const approved = await tx
      .update(uploads)
      .set({ shareWaitingSince: null, updatedAt: new Date() })
      .where(
        and(
          inArray(uploads.mediaId, mediaIds),
          eq(uploads.shared, true),
          isNotNull(uploads.shareWaitingSince)
        )
      )
      .returning({ mediaId: uploads.mediaId, userId: uploads.userId })
    if (!approved.length) return { done: [], skipped: mediaIds }
    const owners = [...new Set(approved.map((row) => row.userId))]
    // A member with no profile row yet gets one, or their later shares
    // would keep waiting.
    await tx
      .insert(pomodoroProfiles)
      .values(owners.map((userId) => ({ userId, sharingApprovedAt: new Date() })))
      .onConflictDoNothing()
    await tx
      .update(pomodoroProfiles)
      .set({ sharingApprovedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          inArray(pomodoroProfiles.userId, owners),
          isNull(pomodoroProfiles.sharingApprovedAt)
        )
      )
    const done = approved.map((row) => row.mediaId)
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: "approve_share",
      resource: "member_uploads",
      recordIds: done,
    })
    const gone = new Set(done)
    return { done, skipped: mediaIds.filter((id) => !gone.has(id)) }
  })
}

/** How many shares wait for an admin, for the admin dashboard. */
export async function countWaitingShares() {
  const [row] = await db
    .select({ value: count() })
    .from(uploads)
    .where(
      and(
        eq(uploads.shared, true),
        isNotNull(uploads.shareWaitingSince),
        isNull(uploads.deletedAt)
      )
    )
  return row?.value ?? 0
}

/**
 * Features one shared file on the front page, replacing any other, or
 * features none. Only a file shared with others can be featured, and it
 * leaves the front page by itself the moment it stops being shared.
 */
export async function setFeaturedSharedFile({
  mediaId,
  actorUserId,
}: {
  mediaId: string | null
  actorUserId: string
}) {
  return db.transaction(async (tx) => {
    await tx
      .update(uploads)
      .set({ featuredAt: null })
      .where(isNotNull(uploads.featuredAt))
    if (mediaId) {
      const [featured] = await tx
        .update(uploads)
        .set({ featuredAt: new Date() })
        .where(and(eq(uploads.mediaId, mediaId), sharedWithOthers))
        .returning({ mediaId: uploads.mediaId })
      if (!featured) throw new Error("SHARED_MEDIA_NOT_FOUND")
    }
    forgetFeaturedSharedFile()
    await tx.insert(pomodoroAuditLogs).values({
      actorUserId,
      action: mediaId ? "feature_share" : "unfeature_share",
      resource: "member_uploads",
      recordIds: mediaId ? [mediaId] : [],
    })
    return { mediaId }
  })
}

/**
 * The featured file for a front page visit, held for a minute so a busy
 * front page costs one read, the rule the live figures follow.
 */
const FEATURED_HOLD_MS = 60_000
let heldFeatured: { value: SharedMediaItem | null; expiresAt: number } | null = null

export async function readFeaturedSharedFile(now = Date.now()) {
  if (heldFeatured && heldFeatured.expiresAt > now) return heldFeatured.value
  const value = await loadFeaturedSharedFile()
  heldFeatured = { value, expiresAt: now + FEATURED_HOLD_MS }
  return value
}

/** Drops the held pick, so Feature and Stop featuring show on the next visit. */
export function forgetFeaturedSharedFile() {
  heldFeatured = null
}

/**
 * The featured file for the front page, or null when none is featured or
 * it is no longer shared. The page is public, so blocks do not apply: a
 * signed-out visitor has none, and a featured file is the admin's pick.
 */
export async function loadFeaturedSharedFile(): Promise<SharedMediaItem | null> {
  const [row] = await db
    .select({
      mediaId: uploads.mediaId,
      userId: uploads.userId,
      purpose: uploads.purpose,
      kind: uploads.kind,
      name: fileName,
      tags: uploads.tags,
      storagePath: customShellMedia.storagePath,
      stillPath: uploads.stillPath,
      sharedAt: uploads.sharedAt,
      handle: creditHandle,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .where(and(sharedWithOthers, isNotNull(uploads.featuredAt)))
    .limit(1)
  if (!row) return null
  return {
    mediaId: row.mediaId,
    purpose: row.purpose as SharedMediaItem["purpose"],
    kind: row.kind as SharedMediaItem["kind"],
    name: row.name,
    tags: row.tags,
    url: await getPublicMediaUrl(row.storagePath),
    stillUrl: row.stillPath ? await getPublicMediaUrl(row.stillPath) : "",
    credit: { handle: row.handle },
    usedBy: null,
    saved: false,
    own: false,
    sharedAt: (row.sharedAt ?? new Date(0)).toISOString(),
  }
}

/**
 * Copies a member's shared file into the catalogue as a Draft, credited to
 * them ("@sarah", with the file's own page as its source). The copy goes
 * through the catalogue's worker like any admin upload, so a sound outside
 * 2 to 5 minutes is refused there with the usual sentence. Returns the new
 * item, for the admin to open its window.
 */
export async function copySharedFileToCatalogue({
  mediaId,
  actorUserId,
}: {
  mediaId: string
  actorUserId: string
}) {
  const [row] = await db
    .select({
      purpose: uploads.purpose,
      kind: uploads.kind,
      name: fileName,
      tags: uploads.tags,
      storagePath: customShellMedia.storagePath,
      // Only while their page is public, so a private member is never named.
      handle: creditHandle,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .where(and(eq(uploads.mediaId, mediaId), sharedWithOthers))
    .limit(1)
  if (!row) throw new Error("SHARED_MEDIA_NOT_FOUND")

  const object = await getFromR2(row.storagePath)
  const body = object.Body
  if (!body || typeof body.transformToByteArray !== "function")
    throw new Error("UPLOAD_NOT_READY")
  const stored = await storeCatalogBytes(await body.transformToByteArray())
  const kind = row.purpose === "sound" ? ("sound" as const) : ("theme" as const)
  const still = kind === "theme" && stored.kind === "image"
  const credit = row.handle ? `@${row.handle}` : "A Pomoder member"

  const id = await db.transaction(async (tx) => {
    const [last] = await tx
      .select({
        position: sql<number>`coalesce(max(${pomodoroCatalogItems.position}), -1)::int`,
      })
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.kind, kind))
    const label = row.name.slice(0, 60)
    const [item] = await tx
      .insert(pomodoroCatalogItems)
      .values({
        kind,
        key: await freshKey(tx, kind, label),
        label,
        descriptor: kind === "sound" ? "ambient" : still ? "static" : "video",
        status: "draft",
        position: (last?.position ?? -1) + 1,
        pictureUrl: still ? await getPublicMediaUrl(stored.path) : null,
        picturePath: still ? stored.path : null,
        fileStatus: still ? "ready" : "queued",
        sourcePath: still ? null : stored.path,
        sourceKind: still ? null : stored.kind,
        tags: row.tags,
        artist: credit,
        sourceUrl: row.handle ? sharedFilePath(row.handle, mediaId) : null,
        licence: "other",
        licenceNote: `Shared on Pomoder by ${credit}, who confirmed they made it or have the right to share it.`,
      })
      .returning({ id: pomodoroCatalogItems.id })
    await logCatalogAct(tx, actorUserId, "catalog_from_share", [item.id])
    return item.id
  })
  forgetMediaCatalog()
  return { id, kind }
}

/**
 * Tells every admin a member's first share is waiting, folding into each
 * one's unread notice so five waiting files are one line. Called after the
 * share is saved, and never throws: a notice that cannot be written must not
 * undo the share behind it.
 */
export async function noteShareWaiting() {
  try {
    const adminIds = await reportQueueAdminIds()
    const waiting = await countWaitingShares()
    for (const adminId of adminIds) {
      await foldNotice(db, {
        recipientUserId: adminId,
        actorUserId: null,
        kind: "share_waiting",
        subject: {},
        href: SHARE_WAITING_PAGE,
        compose: () => ({
          message: shareWaitingMessage(waiting),
          detail: null,
          foldCount: waiting,
        }),
      })
    }
  } catch (error) {
    console.error("share waiting notice could not be written", error)
  }
}

/** Once nothing waits, every admin's unread "waiting" notice turns read. */
export async function clearShareWaitingNotices() {
  if ((await countWaitingShares()) > 0) return
  const now = new Date()
  await db
    .update(customShellNotifications)
    .set({ readAt: now, seenAt: sql`coalesce(${customShellNotifications.seenAt}, ${now})` })
    .where(
      and(
        isNull(customShellNotifications.readAt),
        inArray(
          customShellNotifications.id,
          db
            .select({ id: pomodoroNoticeLinks.noticeId })
            .from(pomodoroNoticeLinks)
            .where(eq(pomodoroNoticeLinks.kind, "share_waiting"))
        )
      )
    )
}
