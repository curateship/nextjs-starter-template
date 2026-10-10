import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { blockedUserIdsFor, isBlockedBetween } from "@/server/pomodoro/blocks"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  pomodoroMediaAdds,
  pomodoroMediaUploads,
  pomodoroPersonalRooms,
  pomodoroProfiles,
  pomodoroSavedMedia,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellMedia, customShellUsers } from "@/server/schema"
import { isHandleAvailableShape } from "@/lib/pomodoro/public-profile"
import {
  SHARED_PAGE_SIZE,
  USED_BY_FLOOR,
  type MediaCredit,
  type SharedMediaItem,
  type SharedMediaPage,
  type SharedScope,
  type SharedSort,
  type ShareState,
} from "@/lib/pomodoro/shared-media"
import type {
  PomodoroUploadKind,
  PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import type { RoomFile, RoomFiles } from "@/lib/pomodoro/media-pair"

/**
 * Shared sounds and backgrounds: which files other members may see, the lists
 * that show them, saving one for later, and the credit that follows a file
 * into somebody else's room. See `workspace/docs/shared-media.md`.
 *
 * **One rule decides whether anybody else sees a file**, `sharedWithOthers`
 * below, and every list, page, pick and room reads it. A file that drops out
 * of it (unticked, moved to the bin, taken off by an admin) disappears from
 * all of them on the next load, and anybody using it falls back to the
 * default scene or to silence, the way a deleted catalogue item does.
 *
 * Blocks hold here as everywhere: a file is never shown, picked or played
 * across a block, in either direction.
 */

const uploads = pomodoroMediaUploads

/**
 * Other members may see, pick and play this file: the Share tick is on and
 * confirmed, it is out of the bin, it is not waiting for an admin's first
 * check, an admin has not taken it off, and a finished file exists.
 */
export const sharedWithOthers = and(
  eq(uploads.shared, true),
  isNotNull(uploads.shareConfirmedAt),
  isNull(uploads.shareWaitingSince),
  isNull(uploads.adminUnsharedAt),
  isNull(uploads.deletedAt),
  or(eq(uploads.status, "ready"), isNotNull(uploads.sourceMediaId))
)!

/** Where an owner's file stands, for their own card. */
export function shareStateOf(row: {
  shared: boolean
  shareWaitingSince: Date | null
  adminUnsharedAt: Date | null
}): ShareState {
  if (row.adminUnsharedAt) return "taken_down"
  if (!row.shared) return "off"
  return row.shareWaitingSince ? "waiting" : "on"
}

const mediaReference = sql`'media:' || ${uploads.mediaId}`

/** Rooms still running, the same phases the public profile counts as open. */
const OPEN_ROOM_PHASES = sql`('waiting', 'focus', 'short', 'long')`

/**
 * How many rooms have this file as their sound or background: other people's
 * personal rooms and open hosted rooms. The owner's own room is not counted,
 * because "used by" is about other people.
 */
export const usedByCount = sql<number>`((
  select count(*) from ${pomodoroPersonalRooms}
  where ${pomodoroPersonalRooms.userId} <> ${uploads.userId}
    and ${mediaReference} in (${pomodoroPersonalRooms.sound}, ${pomodoroPersonalRooms.background})
) + (
  select count(*) from ${rooms}
  where ${rooms.closedAt} is null and ${rooms.phase} in ${OPEN_ROOM_PHASES}
    and ${mediaReference} in (${rooms.sound}, ${rooms.background})
))::int`

/**
 * The owner's handle while their public page answers, else null. Read with
 * `pomodoro_profiles` joined on the upload's owner.
 */
export const creditHandle = sql<string | null>`case
  when ${pomodoroProfiles.profilePublic} and ${pomodoroProfiles.hiddenAt} is null
  then ${pomodoroProfiles.handle} end`

const listColumns = {
  mediaId: uploads.mediaId,
  userId: uploads.userId,
  purpose: uploads.purpose,
  kind: uploads.kind,
  name: sql<string>`coalesce(${uploads.name}, ${customShellMedia.originalName})`,
  tags: uploads.tags,
  storagePath: customShellMedia.storagePath,
  stillPath: uploads.stillPath,
  sharedAt: uploads.sharedAt,
  handle: creditHandle,
  usedBy: usedByCount,
}

type ListRow = {
  mediaId: string
  userId: string
  purpose: string
  kind: string
  name: string
  tags: string[]
  storagePath: string
  stillPath: string | null
  sharedAt: Date | null
  handle: string | null
  usedBy: number
}

async function toItem(
  row: ListRow,
  viewerUserId: string | null,
  saved: Set<string>
): Promise<SharedMediaItem> {
  return {
    mediaId: row.mediaId,
    purpose: row.purpose as PomodoroUploadPurpose,
    kind: row.kind as PomodoroUploadKind,
    name: row.name,
    tags: row.tags,
    url: await getPublicMediaUrl(row.storagePath),
    stillUrl: row.stillPath ? await getPublicMediaUrl(row.stillPath) : "",
    credit: { handle: row.handle },
    usedBy: row.usedBy >= USED_BY_FLOOR ? row.usedBy : null,
    saved: saved.has(row.mediaId),
    own: row.userId === viewerUserId,
    sharedAt: (row.sharedAt ?? new Date(0)).toISOString(),
  }
}

/** The viewer's saved ids among these files, in one query. */
async function savedAmong(viewerUserId: string | null, mediaIds: string[]) {
  if (!viewerUserId || !mediaIds.length) return new Set<string>()
  const rows = await db
    .select({ mediaId: pomodoroSavedMedia.mediaId })
    .from(pomodoroSavedMedia)
    .where(
      and(
        eq(pomodoroSavedMedia.userId, viewerUserId),
        inArray(pomodoroSavedMedia.mediaId, mediaIds)
      )
    )
  return new Set(rows.map((row) => row.mediaId))
}

/** `%` and `_` typed by a member mean themselves, not wildcards. */
function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
}

/**
 * A page of shared files of one kind: everybody's ("Shared by members"), the
 * viewer's saved ones, or one owner's (their public page). Paged on the
 * server, searched by name and tag, and never including anybody on the far
 * side of a block from the viewer.
 */
export async function listSharedMedia({
  viewerUserId,
  purpose,
  scope = "everyone",
  ownerUserId,
  search = "",
  tag = null,
  sort = "newest",
  page = 0,
  pageSize = SHARED_PAGE_SIZE,
}: {
  viewerUserId: string | null
  purpose: PomodoroUploadPurpose
  scope?: SharedScope
  ownerUserId?: string
  search?: string
  tag?: string | null
  sort?: SharedSort
  page?: number
  pageSize?: number
}): Promise<SharedMediaPage> {
  if (scope === "saved" && !viewerUserId) return { items: [], total: 0, tags: [] }
  const blocked = [...(await blockedUserIdsFor(viewerUserId))]
  const visible = and(
    sharedWithOthers,
    eq(uploads.purpose, purpose),
    blocked.length ? notInArray(uploads.userId, blocked) : undefined,
    ownerUserId ? eq(uploads.userId, ownerUserId) : undefined
  )
  const filters: (SQL | undefined)[] = [visible]
  const words = search.trim().slice(0, 80)
  if (words) {
    const pattern = likePattern(words)
    filters.push(
      or(
        sql`coalesce(${uploads.name}, ${customShellMedia.originalName}) ilike ${pattern}`,
        sql`exists (select 1 from jsonb_array_elements_text(${uploads.tags}) as tag where tag ilike ${pattern})`
      )
    )
  }
  if (tag) filters.push(sql`${uploads.tags} @> ${JSON.stringify([tag])}::jsonb`)
  if (scope === "saved")
    filters.push(
      sql`exists (select 1 from ${pomodoroSavedMedia}
        where ${pomodoroSavedMedia.mediaId} = ${uploads.mediaId}
          and ${pomodoroSavedMedia.userId} = ${viewerUserId})`
    )
  const where = and(...filters)

  const base = () =>
    db
      .select(listColumns)
      .from(uploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
  const [rows, [totalRow], tagRows] = await Promise.all([
    base()
      .where(where)
      .orderBy(
        ...(sort === "most_used" ? [desc(usedByCount)] : []),
        desc(uploads.sharedAt),
        desc(uploads.mediaId)
      )
      .limit(pageSize)
      .offset(Math.max(0, page) * pageSize),
    db
      .select({ value: count() })
      .from(uploads)
      .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
      .where(where),
    ownerUserId
      ? Promise.resolve([])
      : db
          .select({ tag: sql<string>`tag`, uses: count() })
          .from(
            sql`${uploads}, jsonb_array_elements_text(${uploads.tags}) as tag`
          )
          .where(visible)
          .groupBy(sql`tag`)
          .orderBy(desc(count()), sql`tag`)
          .limit(30),
  ])
  const saved = await savedAmong(
    viewerUserId,
    rows.map((row) => row.mediaId)
  )
  return {
    items: await Promise.all(rows.map((row) => toItem(row, viewerUserId, saved))),
    total: totalRow?.value ?? 0,
    tags: tagRows.map((row) => row.tag),
  }
}

/**
 * One shared file on its own page, `/u/<handle>/files/<id>`, or null. Null
 * covers an unknown handle, a switched-off or hidden profile, a file that is
 * not this person's, not shared, in the bin or taken off, and a block either
 * way, so the page answers one 404 for all of them and nobody can tell which.
 */
export async function loadSharedFilePage(
  handle: string,
  mediaId: string,
  viewerUserId: string | null
) {
  if (!isHandleAvailableShape(handle) || !isUuid(mediaId)) return null
  const [row] = await db
    .select({
      ...listColumns,
      ownerName: pomodoroProfiles.publicDisplayName,
      avatarUrl: customShellUsers.avatarUrl,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .innerJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, uploads.userId))
    .where(
      and(
        sharedWithOthers,
        eq(uploads.mediaId, mediaId),
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(1)
  if (!row) return null
  if (await isBlockedBetween(viewerUserId, row.userId)) return null
  const saved = await savedAmong(viewerUserId, [row.mediaId])
  return {
    file: await toItem(row, viewerUserId, saved),
    owner: {
      handle,
      name: row.ownerName?.trim() || handle,
      avatarUrl: row.avatarUrl,
    },
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: string) {
  return UUID_PATTERN.test(value)
}

type Database =
  | CustomShellDb
  | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]

/**
 * Someone else's shared file this member may use, or null: shared with
 * others, the right kind, nobody blocked either way, and shared files part of
 * the member's plan (`canUseSharedMedia`, on for every plan unless a plan
 * switches it off).
 */
export async function findPickableSharedMedia(
  userId: string,
  mediaId: string,
  purpose?: PomodoroUploadPurpose
) {
  const [row] = await db
    .select({
      ownerUserId: uploads.userId,
      kind: uploads.kind,
      purpose: uploads.purpose,
    })
    .from(uploads)
    .where(
      and(
        sharedWithOthers,
        eq(uploads.mediaId, mediaId),
        ne(uploads.userId, userId),
        purpose ? eq(uploads.purpose, purpose) : undefined
      )
    )
    .limit(1)
  if (!row) return null
  if (await isBlockedBetween(userId, row.ownerUserId)) return null
  const entitlements = await loadPomodoroEntitlements(userId)
  if (!entitlements.canUseSharedMedia) throw new Error("SHARED_MEDIA_LOCKED")
  return {
    ownerUserId: row.ownerUserId,
    kind: row.kind as PomodoroUploadKind,
    purpose: row.purpose as PomodoroUploadPurpose,
  }
}

/**
 * The address and credit of someone else's shared file, for whatever is
 * drawing it now: a personal room, a hosted room, the player. Null when it
 * may not be played (unshared, gone, blocked), which the caller draws as the
 * default scene or as silence.
 */
export async function resolveSharedMedia(
  viewerUserId: string | null,
  mediaId: string
): Promise<{
  url: string
  kind: PomodoroUploadKind
  name: string
  ownerUserId: string
  credit: MediaCredit
} | null> {
  const [row] = await db
    .select({
      ownerUserId: uploads.userId,
      kind: uploads.kind,
      name: listColumns.name,
      storagePath: customShellMedia.storagePath,
      handle: creditHandle,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .where(and(sharedWithOthers, eq(uploads.mediaId, mediaId)))
    .limit(1)
  if (!row) return null
  if (await isBlockedBetween(viewerUserId, row.ownerUserId)) return null
  return {
    url: await getPublicMediaUrl(row.storagePath),
    kind: row.kind as PomodoroUploadKind,
    name: row.name,
    ownerUserId: row.ownerUserId,
    credit: { handle: row.handle },
  }
}

/**
 * Notes the first time a member added someone else's shared file to a room
 * or saved it, for the owner's weekly note. Adding it again counts once.
 */
export async function recordMediaAdd(
  database: Database,
  userId: string,
  mediaId: string
) {
  await database
    .insert(pomodoroMediaAdds)
    .values({ mediaId, userId })
    .onConflictDoNothing()
}

/**
 * The heart: keeps someone's shared file in the member's Saved list without
 * changing what is playing, or takes it back out. Saving your own file, or
 * one that is no longer shared, is refused with the same "no longer shared".
 */
export async function setSharedMediaSaved(
  userId: string,
  mediaId: string,
  saved: boolean
) {
  if (!saved) {
    await db
      .delete(pomodoroSavedMedia)
      .where(
        and(
          eq(pomodoroSavedMedia.userId, userId),
          eq(pomodoroSavedMedia.mediaId, mediaId)
        )
      )
    return { saved: false }
  }
  const file = await findPickableSharedMedia(userId, mediaId)
  if (!file) throw new Error("SHARED_MEDIA_NOT_FOUND")
  await db.transaction(async (tx) => {
    await tx
      .insert(pomodoroSavedMedia)
      .values({ userId, mediaId })
      .onConflictDoNothing()
    await recordMediaAdd(tx, userId, mediaId)
  })
  return { saved: true }
}

/**
 * Whether this member saved this file and it is still shared, for a room
 * host picking a saved file (rooms task 04, part 3).
 */
export async function hasSavedSharedMedia(userId: string, mediaId: string) {
  const [row] = await db
    .select({ mediaId: pomodoroSavedMedia.mediaId })
    .from(pomodoroSavedMedia)
    .where(
      and(
        eq(pomodoroSavedMedia.userId, userId),
        eq(pomodoroSavedMedia.mediaId, mediaId)
      )
    )
    .limit(1)
  return Boolean(row)
}

/**
 * The columns a change of the Share tick writes, after checking the rules:
 * an admin's take-down holds, the member confirmed the right to share, the
 * daily limit, and an admin's first check (Settings → App settings → Safety).
 * Unsharing is never limited and never counts. An unchanged tick writes
 * nothing.
 */
export async function shareChangeFor(
  database: Database,
  {
    userId,
    mediaId,
    current,
    wanted,
    confirmRights,
  }: {
    userId: string
    /** Null for a file not stored yet. */
    mediaId: string | null
    current: {
      shared: boolean
      adminUnsharedAt: Date | null
      /** Set once the file was shared before: a re-share keeps both. */
      sharedAt?: Date | null
      shareAnnouncedAt?: Date | null
    }
    wanted: boolean
    confirmRights: boolean
  }
) {
  if (wanted === current.shared) return {}
  if (!wanted)
    return { shared: false, shareWaitingSince: null, featuredAt: null }
  if (current.adminUnsharedAt) throw new Error("SHARE_TAKEN_DOWN")
  if (!confirmRights) throw new Error("SHARE_NOT_CONFIRMED")

  const [settings, [profile], [admin], [recent]] = await Promise.all([
    loadAppSettings(),
    database
      .select({ approvedAt: pomodoroProfiles.sharingApprovedAt })
      .from(pomodoroProfiles)
      .where(eq(pomodoroProfiles.userId, userId))
      .limit(1),
    database
      .select({ role: customShellUsers.role })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId))
      .limit(1),
    database
      .select({ value: count() })
      .from(uploads)
      .where(
        and(
          eq(uploads.userId, userId),
          gte(uploads.sharedAt, new Date(Date.now() - 24 * 60 * 60_000)),
          mediaId ? ne(uploads.mediaId, mediaId) : undefined
        )
      ),
  ])
  const rules = settings["sharing.rules"]
  if ((recent?.value ?? 0) >= rules.dailyLimit)
    throw new Error(`SHARE_DAILY_LIMIT:${rules.dailyLimit}`)
  const now = new Date()
  // An admin is the one who checks, so their own shares never wait.
  const waits =
    rules.approveFirst && !profile?.approvedAt && admin?.role !== "admin"
  // A file shared before keeps its first share time and its announcement,
  // so switching Share off and on neither lifts it back to the top of
  // "Shared by members" nor tells followers again (audit, 10 Oct 2026).
  return {
    shared: true,
    sharedAt: current.sharedAt ?? now,
    shareConfirmedAt: now,
    shareWaitingSince: waits ? now : null,
    shareAnnouncedAt: current.shareAnnouncedAt ?? null,
  }
}

/**
 * The owner behind a profile's "Show all", or null: the page answers, the
 * shared-files switch is on, and nobody is blocked either way.
 */
export async function sharedOwnerForHandle(
  handle: string,
  viewerUserId: string | null
) {
  if (!isHandleAvailableShape(handle)) return null
  const [row] = await db
    .select({ userId: pomodoroProfiles.userId })
    .from(pomodoroProfiles)
    .where(
      and(
        eq(pomodoroProfiles.handle, handle),
        eq(pomodoroProfiles.profilePublic, true),
        eq(pomodoroProfiles.showSharedMedia, true),
        isNull(pomodoroProfiles.hiddenAt)
      )
    )
    .limit(1)
  if (!row) return null
  if (await isBlockedBetween(viewerUserId, row.userId)) return null
  return row.userId
}

const ROOM_FILE_REFUSED =
  "ROOM_PAIR_REJECTED: That file cannot play in a room. Pick one of your shared files, or a shared file you saved."

/**
 * Whether a host may put this file in their room (rooms task 04): it is
 * shared with others and the right kind, and it is the host's own or one
 * the host saved, with nobody blocked between owner and host. A file nobody
 * shared on purpose never reaches whoever joins.
 */
export async function assertRoomFileUsable(
  hostUserId: string,
  mediaId: string,
  purpose: PomodoroUploadPurpose
) {
  const [row] = await db
    .select({ ownerUserId: uploads.userId })
    .from(uploads)
    .where(and(sharedWithOthers, eq(uploads.mediaId, mediaId), eq(uploads.purpose, purpose)))
    .limit(1)
  if (!row) throw new Error(ROOM_FILE_REFUSED)
  if (row.ownerUserId === hostUserId) return
  if (
    !(await hasSavedSharedMedia(hostUserId, mediaId)) ||
    (await isBlockedBetween(hostUserId, row.ownerUserId))
  )
    throw new Error(ROOM_FILE_REFUSED)
}

/**
 * The shared files a hosted room plays, for one viewer: the address, name
 * and credit, or null for a half that is not a file or may no longer play.
 * A file stops playing for everyone once it is unshared, binned or taken
 * off, or its owner and the host block each other; and for one viewer when
 * that viewer and the owner do.
 */
export async function resolveRoomFiles(
  viewerUserId: string,
  hostUserId: string,
  pair: { sound: string | null; background: string | null }
): Promise<RoomFiles> {
  const fileId = (stored: string | null) =>
    stored?.startsWith("media:") && isUuid(stored.slice(6)) ? stored.slice(6).toLowerCase() : null
  const [sound, background] = await Promise.all(
    [fileId(pair.sound), fileId(pair.background)].map((mediaId) =>
      mediaId ? resolveRoomFile(viewerUserId, hostUserId, mediaId) : null
    )
  )
  return { sound, background }
}

async function resolveRoomFile(
  viewerUserId: string,
  hostUserId: string,
  mediaId: string
): Promise<RoomFile | null> {
  const [row] = await db
    .select({
      ownerUserId: uploads.userId,
      kind: uploads.kind,
      name: listColumns.name,
      storagePath: customShellMedia.storagePath,
      handle: creditHandle,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .where(and(sharedWithOthers, eq(uploads.mediaId, mediaId)))
    .limit(1)
  if (!row) return null
  const [hostBlocked, viewerBlocked] = await Promise.all([
    isBlockedBetween(hostUserId, row.ownerUserId),
    isBlockedBetween(viewerUserId, row.ownerUserId),
  ])
  if (hostBlocked || viewerBlocked) return null
  return {
    url: await getPublicMediaUrl(row.storagePath),
    kind: row.kind as RoomFile["kind"],
    name: row.name,
    credit: row.ownerUserId === viewerUserId ? null : { handle: row.handle },
  }
}

/**
 * What Host a room offers under the catalogue: the host's own shared files,
 * then shared files they saved, each as the value a room stores and the
 * name, with the owner's handle for a saved one.
 */
export async function listRoomFileChoices(userId: string) {
  const blocked = [...(await blockedUserIdsFor(userId))]
  const rows = await db
    .select({
      mediaId: uploads.mediaId,
      purpose: uploads.purpose,
      ownerUserId: uploads.userId,
      name: listColumns.name,
      handle: creditHandle,
    })
    .from(uploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, uploads.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, uploads.userId))
    .where(
      and(
        sharedWithOthers,
        blocked.length ? notInArray(uploads.userId, blocked) : undefined,
        or(
          eq(uploads.userId, userId),
          sql`exists (select 1 from ${pomodoroSavedMedia}
            where ${pomodoroSavedMedia.mediaId} = ${uploads.mediaId}
              and ${pomodoroSavedMedia.userId} = ${userId})`
        )
      )
    )
    .orderBy(desc(uploads.sharedAt))
    .limit(200)
  const choice = (row: (typeof rows)[number]) => ({
    value: `media:${row.mediaId}`,
    label: row.name,
    own: row.ownerUserId === userId,
    credit: row.ownerUserId === userId ? null : { handle: row.handle },
  })
  return {
    sounds: rows.filter((row) => row.purpose === "sound").map(choice),
    backgrounds: rows.filter((row) => row.purpose === "background").map(choice),
  }
}

export type RoomFileChoices = Awaited<ReturnType<typeof listRoomFileChoices>>
