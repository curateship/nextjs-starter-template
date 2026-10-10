import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { deleteMediaAsAdmin } from "@/server/media/library"
import { getPublicMediaUrl } from "@/server/media/storage"
import { uploadIsShowable } from "@/server/pomodoro/media-uploads"
import {
  pomodoroAuditLogs,
  pomodoroGenerations,
  pomodoroMediaUploads,
  pomodoroPersonalRooms,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { customShellMedia, customShellUsers as users } from "@/server/schema"
import type { UploadSortColumn, UPLOAD_PURPOSE_FILTERS } from "@/lib/pomodoro/admin-lists"
import type { PomodoroUploadKind, PomodoroUploadPurpose } from "@/lib/pomodoro/media-limits"

/**
 * Member uploads in the admin (admin task 06, part 3): every background and
 * sound a member uploaded or had made by AI, and deleting them. See
 * `workspace/docs/own-media-uploads.md`.
 *
 * A file is "in use" when the owner's personal room plays or shows it, or
 * their public profile has it as the banner. Those are the only three places a
 * member's own file can be chosen; a hosted room never holds one.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export type AdminUploadRow = {
  mediaId: string
  userId: string
  ownerName: string
  ownerEmail: string
  name: string
  purpose: PomodoroUploadPurpose
  kind: PomodoroUploadKind
  status: string
  failureReason: string | null
  fileSize: number
  /** Made by AI rather than uploaded. */
  generated: boolean
  /** Where the file is chosen right now: "room background", "room sound", "profile banner". */
  usedAs: string[]
  /** Only a finished file has an address, the rule the member's picker follows. */
  url: string
  createdAt: Date
}

/** The `media:<id>` a choice stores, compared in SQL against this row's file. */
const mediaReference = sql<string>`'media:' || ${pomodoroMediaUploads.mediaId}`

export async function listAdminUploads(query: {
  search: string
  purpose: (typeof UPLOAD_PURPOSE_FILTERS)[number]
  user?: string
  sort: UploadSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}): Promise<{ rows: AdminUploadRow[]; total: number }> {
  const filters: SQL[] = []
  if (query.purpose !== "all") filters.push(eq(pomodoroMediaUploads.purpose, query.purpose))
  if (query.user) filters.push(eq(pomodoroMediaUploads.userId, query.user))
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      ilike(customShellMedia.originalName, pattern),
      ilike(pomodoroMediaUploads.name, pattern)
    )
    if (match) filters.push(match)
  }
  const where = filters.length ? and(...filters) : undefined
  const order = query.direction === "asc" ? asc : desc
  const sortColumn = {
    owner: users.name,
    size: customShellMedia.fileSize,
    created: pomodoroMediaUploads.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        mediaId: pomodoroMediaUploads.mediaId,
        userId: pomodoroMediaUploads.userId,
        ownerName: users.name,
        ownerEmail: users.email,
        // The name the member typed; an older row has only the file name.
        name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
        purpose: pomodoroMediaUploads.purpose,
        kind: pomodoroMediaUploads.kind,
        status: pomodoroMediaUploads.status,
        sourceMediaId: pomodoroMediaUploads.sourceMediaId,
        failureReason: pomodoroMediaUploads.failureReason,
        fileSize: customShellMedia.fileSize,
        storagePath: customShellMedia.storagePath,
        createdAt: pomodoroMediaUploads.createdAt,
        generated: sql<boolean>`exists (
          select 1 from ${pomodoroGenerations}
          where ${pomodoroGenerations.mediaId} = ${pomodoroMediaUploads.mediaId})`,
        roomBackground: sql<boolean>`exists (
          select 1 from ${pomodoroPersonalRooms}
          where ${pomodoroPersonalRooms.userId} = ${pomodoroMediaUploads.userId}
            and ${pomodoroPersonalRooms.background} = ${mediaReference})`,
        roomSound: sql<boolean>`exists (
          select 1 from ${pomodoroPersonalRooms}
          where ${pomodoroPersonalRooms.userId} = ${pomodoroMediaUploads.userId}
            and ${pomodoroPersonalRooms.sound} = ${mediaReference})`,
        profileBanner: sql<boolean>`exists (
          select 1 from ${pomodoroProfiles}
          where ${pomodoroProfiles.userId} = ${pomodoroMediaUploads.userId}
            and ${pomodoroProfiles.bannerRef} = ${mediaReference})`,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .innerJoin(users, eq(users.id, pomodoroMediaUploads.userId))
      .where(where)
      // The file's id breaks ties, so equal sizes keep one order between pages.
      .orderBy(order(sortColumn), asc(pomodoroMediaUploads.mediaId))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroMediaUploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .innerJoin(users, eq(users.id, pomodoroMediaUploads.userId))
      .where(where),
  ])

  return {
    rows: await Promise.all(
      rows.map(async ({ storagePath, sourceMediaId, roomBackground, roomSound, profileBanner, ...row }) => ({
        ...row,
        purpose: row.purpose as PomodoroUploadPurpose,
        kind: row.kind as PomodoroUploadKind,
        usedAs: [
          roomBackground ? "room background" : null,
          roomSound ? "room sound" : null,
          profileBanner ? "profile banner" : null,
        ].filter((use): use is string => use !== null),
        url: uploadIsShowable({ status: row.status, sourceMediaId })
          ? await getPublicMediaUrl(storagePath)
          : "",
      }))
    ),
    total: totalRow?.total ?? 0,
  }
}

/**
 * Takes the choices pointing at these files back to the defaults: the
 * personal room's background to the default scene, its sound to silence, the
 * profile banner to none. The same fallback a member's own delete gives, so
 * nobody comes back to a picture or a sound that 404s.
 */
export async function clearUploadChoices(tx: Transaction, mediaIds: string[]) {
  if (!mediaIds.length) return
  const references = mediaIds.map((id) => `media:${id}`)
  const changedAt = new Date()
  await tx
    .update(pomodoroPersonalRooms)
    .set({ background: null, updatedAt: changedAt })
    .where(inArray(pomodoroPersonalRooms.background, references))
  await tx
    .update(pomodoroPersonalRooms)
    .set({ sound: null, updatedAt: changedAt })
    .where(inArray(pomodoroPersonalRooms.sound, references))
  await tx
    .update(pomodoroProfiles)
    .set({ bannerRef: null, updatedAt: changedAt })
    .where(inArray(pomodoroProfiles.bannerRef, references))
}

/**
 * Deletes member uploads, one id or many, through the shell's
 * `deleteMediaAsAdmin`. The upload row goes with the library row by the
 * cascade, and a generation that made the file keeps its record with no file.
 *
 * One transaction: the choices are cleared, the files and rows go, and one log
 * row names every id that went. A file the shell refuses to delete (one used
 * as a logo in a sent email) and an id that is not a member upload are
 * skipped.
 */
export async function deleteAdminUploads({
  mediaIds,
  actorUserId,
  resource = "member_uploads",
}: {
  mediaIds: string[]
  actorUserId: string
  /** What the log row calls them; the AI generations page passes its own. */
  resource?: string
}) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({
        id: customShellMedia.id,
        emailProtectedAt: customShellMedia.emailProtectedAt,
        sourceMediaId: pomodoroMediaUploads.sourceMediaId,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .where(inArray(pomodoroMediaUploads.mediaId, mediaIds))
    const deletable = found.filter((row) => !row.emailProtectedAt).map((row) => row.id)
    if (!deletable.length) return { deleted: [], skipped: mediaIds }

    await clearUploadChoices(tx, deletable)
    // The kept originals a re-trim cuts from go with their uploads.
    const sources = found
      .filter((row) => !row.emailProtectedAt && row.sourceMediaId)
      .map((row) => row.sourceMediaId as string)
    // A transaction is a database handle too; the shell's delete nests inside
    // it, so the cleared choices and the deleted rows commit together.
    await deleteMediaAsAdmin([...deletable, ...sources], tx)
    await tx
      .insert(pomodoroAuditLogs)
      .values({ actorUserId, action: "delete", resource, recordIds: deletable })
    const gone = new Set(deletable)
    return { deleted: deletable, skipped: mediaIds.filter((id) => !gone.has(id)) }
  })
}
