import { randomUUID } from "node:crypto"

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db } from "@/server/db"
import { deleteFromR2, uploadToR2 } from "@/server/media/storage"
import { forgetMediaCatalog } from "@/server/pomodoro/catalog"
import { detectUploadType } from "@/server/pomodoro/media-uploads"
import {
  pomodoroAuditLogs,
  pomodoroCatalogItems,
  pomodoroPersonalRooms,
  rooms,
  type PomodoroCatalogItem,
} from "@/server/pomodoro/schema"
import { keyFromLabel } from "@/lib/pomodoro/catalog"
import { MAX_ITEM_TAGS, normalizeTag } from "@/lib/pomodoro/media-pool"
import {
  CATALOG_DESCRIPTORS,
  CATALOG_FILM_LIMIT_BYTES,
  CATALOG_SOURCE_PATTERN,
  labelFromFilename,
  randomSoundGraphic,
  type CatalogKind,
  type CatalogSortColumn,
  type CatalogStatusFilter,
  type CatalogAccessFilter,
} from "@/lib/pomodoro/admin-catalog"
import { uploadLimitBytes } from "@/lib/pomodoro/media-limits"

/**
 * The admin's Themes and Sounds dashboards: every item, Draft or Live, with
 * how many rooms use it, and every change an admin makes to one. See
 * `workspace/docs/catalog-admin.md`.
 *
 * Every write drops the member-facing catalogue (`forgetMediaCatalog`), so the
 * admin's next page shows the change, and writes one `pomodoro_audit_logs` row
 * in the same transaction. A file an admin uploads is stored as it arrived and
 * queued; the worker re-encodes it, measures a sound and only then makes it
 * the item's file (`catalog-worker.ts`).
 */

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

type ListPage = { page: number; pageSize: number; direction: "asc" | "desc" }

export async function logCatalogAct(
  tx: Transaction,
  actorUserId: string,
  action: string,
  recordIds: string[]
) {
  if (!recordIds.length) return
  await tx
    .insert(pomodoroAuditLogs)
    .values({ actorUserId, action, resource: "catalog", recordIds })
}

/** The stored value a choice of this item saves, for counting who picked it. */
function storedValue(kind: CatalogKind) {
  const prefix = kind === "theme" ? "scene:" : "curated:"
  // Named in full: inside a sub-select over another table, Drizzle writes a
  // bare "key", which would mean that table's column if it ever had one.
  return sql<string>`${prefix} || "pomodoro_catalog_items"."key"`
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export async function listAdminCatalog(
  query: ListPage & {
    kind: CatalogKind
    search: string
    status: CatalogStatusFilter
    access: CatalogAccessFilter
    tag: string | null
    sort: CatalogSortColumn
  }
) {
  const filters: SQL[] = [eq(pomodoroCatalogItems.kind, query.kind)]
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(pomodoroCatalogItems.label, pattern),
      ilike(pomodoroCatalogItems.key, pattern),
      ilike(pomodoroCatalogItems.hint, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.status !== "all")
    filters.push(eq(pomodoroCatalogItems.status, query.status))
  if (query.access !== "all")
    filters.push(eq(pomodoroCatalogItems.locked, query.access === "pro"))
  if (query.tag)
    filters.push(sql`${pomodoroCatalogItems.tags} ? ${query.tag}`)
  const where = and(...filters)

  const column =
    query.kind === "theme"
      ? pomodoroPersonalRooms.background
      : pomodoroPersonalRooms.sound
  const roomColumn = query.kind === "theme" ? rooms.background : rooms.sound
  // Counted as sub-selects so the item row is never multiplied.
  const personalCount = sql<number>`(
    select count(*)::int from ${pomodoroPersonalRooms}
    where ${column} = ${storedValue(query.kind)}
  )`
  const roomCount = sql<number>`(
    select count(*)::int from ${rooms}
    where ${roomColumn} = ${storedValue(query.kind)}
      and ${rooms.closedAt} is null
  )`

  const direction = query.direction === "asc" ? asc : desc
  const sortColumn = {
    position: pomodoroCatalogItems.position,
    name: pomodoroCatalogItems.label,
    status: pomodoroCatalogItems.status,
    chosen: sql`(${personalCount} + ${roomCount})`,
    added: pomodoroCatalogItems.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: pomodoroCatalogItems.id,
        kind: pomodoroCatalogItems.kind,
        key: pomodoroCatalogItems.key,
        label: pomodoroCatalogItems.label,
        hint: pomodoroCatalogItems.hint,
        descriptor: pomodoroCatalogItems.descriptor,
        locked: pomodoroCatalogItems.locked,
        status: pomodoroCatalogItems.status,
        position: pomodoroCatalogItems.position,
        fileUrl: pomodoroCatalogItems.fileUrl,
        pictureUrl: pomodoroCatalogItems.pictureUrl,
        fileStatus: pomodoroCatalogItems.fileStatus,
        fileError: pomodoroCatalogItems.fileError,
        durationSeconds: pomodoroCatalogItems.durationSeconds,
        licence: pomodoroCatalogItems.licence,
        sourceUrl: pomodoroCatalogItems.sourceUrl,
        importUrl: pomodoroCatalogItems.importUrl,
        tags: pomodoroCatalogItems.tags,
        createdAt: pomodoroCatalogItems.createdAt,
        personalCount,
        roomCount,
      })
      .from(pomodoroCatalogItems)
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroCatalogItems.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(pomodoroCatalogItems).where(where),
  ])

  return { rows, total: totalRow?.total ?? 0 }
}

export type AdminCatalogRow = Awaited<
  ReturnType<typeof listAdminCatalog>
>["rows"][number]

export async function loadAdminCatalogItem(id: string) {
  const [row] = await db
    .select()
    .from(pomodoroCatalogItems)
    .where(eq(pomodoroCatalogItems.id, id))
    .limit(1)
  if (!row) throw new Error("CATALOG_ITEM_NOT_FOUND")
  return toEditable(row)
}

function toEditable(row: PomodoroCatalogItem) {
  return {
    id: row.id,
    kind: row.kind,
    key: row.key,
    label: row.label,
    hint: row.hint,
    tags: row.tags,
    descriptor: row.descriptor,
    locked: row.locked,
    status: row.status,
    fileUrl: row.fileUrl,
    pictureUrl: row.pictureUrl,
    fileStatus: row.fileStatus,
    fileError: row.fileError,
    importUrl: row.importUrl,
    durationSeconds: row.durationSeconds,
    volume: row.volume,
    artist: row.artist,
    sourceUrl: row.sourceUrl,
    licence: row.licence,
    licenceNote: row.licenceNote,
    publishedAt: row.publishedAt,
  }
}

export type AdminCatalogItem = ReturnType<typeof toEditable>

// ---------------------------------------------------------------------------
// Saving one item
// ---------------------------------------------------------------------------

/** Lower case, no repeats, at most eight, the way members' chips show them. */
export function cleanTags(tags: string[]) {
  const clean = tags
    .map((tag) => normalizeTag(tag))
    .filter((tag): tag is string => tag !== null)
  return [...new Set(clean)].slice(0, MAX_ITEM_TAGS)
}

/** Every tag in use on one kind, for the window's suggestions and the filter. */
export async function listCatalogTags(kind: CatalogKind) {
  const rows = await db
    .select({ tag: sql<string>`jsonb_array_elements_text(${pomodoroCatalogItems.tags})` })
    .from(pomodoroCatalogItems)
    .where(eq(pomodoroCatalogItems.kind, kind))
  return [...new Set(rows.map((row) => row.tag))].sort()
}

export type CatalogItemInput = {
  label: string
  hint: string
  descriptor: string
  locked: boolean
  status: "draft" | "live"
  pictureUrl: string | null
  tags: string[]
  volume: number
  artist: string | null
  sourceUrl: string | null
  licence: string | null
  licenceNote: string | null
  /** A new file waiting in the bucket, from `storeCatalogSource`. */
  source: { path: string; kind: "audio" | "video" | "image" } | null
}

/**
 * A key nobody of this kind has, made from the name: "Rain on a tin roof"
 * becomes `rain-on-a-tin-roof`, then `-2`, `-3` if that is taken. A key is
 * never changed once made, because every saved choice points at it.
 */
export async function freshKey(tx: Transaction, kind: CatalogKind, label: string) {
  const base = keyFromLabel(label)
  const taken = new Set(
    (
      await tx
        .select({ key: pomodoroCatalogItems.key })
        .from(pomodoroCatalogItems)
        .where(
          and(
            eq(pomodoroCatalogItems.kind, kind),
            ilike(pomodoroCatalogItems.key, `${base}%`)
          )
        )
    ).map((row) => row.key)
  )
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

function assertSource(source: CatalogItemInput["source"], kind: CatalogKind) {
  if (!source) return
  // The path came back from the browser, so it is checked to be one this app
  // wrote, never any other object in the bucket.
  if (!CATALOG_SOURCE_PATTERN.test(source.path)) throw new Error("CATALOG_BAD_FILE")
  if (kind === "sound" && source.kind !== "audio")
    throw new Error("CATALOG_WRONG_FILE_KIND")
  if (kind === "theme" && source.kind === "audio")
    throw new Error("CATALOG_WRONG_FILE_KIND")
}

/**
 * What a Live item has to have before members may see it: a picture, and for a
 * sound a file, or one on its way.
 */
function assertPublishable(
  kind: CatalogKind,
  item: { pictureUrl: string | null; fileUrl: string | null },
  source: CatalogItemInput["source"]
) {
  const willHaveFile = Boolean(item.fileUrl) || source?.kind === "audio"
  if (kind === "sound" && !willHaveFile) throw new Error("CATALOG_NEEDS_FILE")
  // A theme film's middle frame becomes its still once it is prepared.
  const willHavePicture =
    Boolean(item.pictureUrl) || (kind === "theme" && source?.kind === "video")
  if (!willHavePicture) throw new Error("CATALOG_NEEDS_PICTURE")
}

function assertDescriptor(kind: CatalogKind, descriptor: string) {
  if (!(CATALOG_DESCRIPTORS[kind] as readonly string[]).includes(descriptor))
    throw new Error("CATALOG_BAD_DESCRIPTOR")
}

/**
 * Creates an item (no `id`) or saves one. A new file goes in as `queued` with
 * the old file left in place until the worker has finished the new one, so a
 * Live sound being replaced keeps playing its old file meanwhile.
 */
export async function saveAdminCatalogItem({
  id,
  kind,
  input,
  actorUserId,
}: {
  id: string | null
  kind: CatalogKind
  input: CatalogItemInput
  actorUserId: string
}) {
  assertDescriptor(kind, input.descriptor)
  assertSource(input.source, kind)
  const now = new Date()

  const saved = await db.transaction(async (tx) => {
    const existing = id
      ? (
          await tx
            .select()
            .from(pomodoroCatalogItems)
            .where(
              and(
                eq(pomodoroCatalogItems.id, id),
                eq(pomodoroCatalogItems.kind, kind)
              )
            )
            .for("update")
            .limit(1)
        )[0]
      : null
    if (id && !existing) throw new Error("CATALOG_ITEM_NOT_FOUND")

    const fileUrl = existing?.fileUrl ?? null
    // A sound left without a picture gets one of the built-in graphics. A
    // theme's still is never chosen here: the worker takes it from the middle
    // of the film (Tyler, 9 Oct 2026), so a save keeps whatever it has, and a
    // window left open while the worker swapped it cannot put the old one back.
    const pictureUrl =
      kind === "theme"
        ? (existing?.pictureUrl ?? null)
        : (input.pictureUrl ?? randomSoundGraphic())
    if (input.status === "live")
      assertPublishable(kind, { pictureUrl, fileUrl }, input.source)

    // A picture this app stored is dropped when the admin picks another one.
    const pictureChanged =
      existing?.picturePath && existing.pictureUrl !== pictureUrl
    const values = {
      ...(pictureChanged ? { picturePath: null } : {}),
      label: input.label,
      hint: input.hint,
      tags: cleanTags(input.tags),
      descriptor: input.descriptor,
      locked: input.locked,
      status: input.status,
      pictureUrl,
      volume: kind === "sound" ? input.volume : 100,
      artist: input.artist,
      sourceUrl: input.sourceUrl,
      licence: input.licence,
      licenceNote: input.licenceNote,
      // NEW is counted from the first time it went Live, never from a later
      // edit, and a Draft has no date at all.
      publishedAt:
        input.status === "live" ? (existing?.publishedAt ?? now) : null,
      updatedAt: now,
      ...(input.source
        ? {
            sourcePath: input.source.path,
            sourceKind: input.source.kind,
            importUrl: null,
            fileStatus: "queued" as const,
            fileError: null,
            attempts: 0,
            claimedAt: null,
          }
        : {}),
    }

    let row: PomodoroCatalogItem
    if (existing) {
      ;[row] = await tx
        .update(pomodoroCatalogItems)
        .set(values)
        .where(eq(pomodoroCatalogItems.id, existing.id))
        .returning()
    } else {
      const [last] = await tx
        .select({
          position: sql<number>`coalesce(max(${pomodoroCatalogItems.position}), -1)::int`,
        })
        .from(pomodoroCatalogItems)
        .where(eq(pomodoroCatalogItems.kind, kind))
      ;[row] = await tx
        .insert(pomodoroCatalogItems)
        .values({
          ...values,
          kind,
          key: await freshKey(tx, kind, input.label),
          position: (last?.position ?? -1) + 1,
          createdAt: now,
        })
        .returning()
    }
    await logCatalogAct(
      tx,
      actorUserId,
      existing ? "catalog_update" : "catalog_create",
      [row.id]
    )
    // An upload still waiting goes too when it is replaced.
    const sourceGone = input.source && existing?.sourcePath !== row.sourcePath
    const dropped = [
      pictureChanged ? existing?.picturePath : null,
      sourceGone ? existing?.sourcePath : null,
    ].filter((path): path is string => !!path)
    return { row, dropped }
  })

  forgetMediaCatalog()
  await removeFiles(saved.dropped)
  return toEditable(saved.row)
}

// ---------------------------------------------------------------------------
// Changes over a ticked selection
// ---------------------------------------------------------------------------

export type CatalogBulkResult = {
  changed: string[]
  same: string[]
  skipped: string[]
}

/**
 * Draft or Live over ticked rows. An item that cannot go Live yet (no picture,
 * or a sound with no file) is skipped rather than half-published, and one
 * already at that standing is counted as the same rather than written again.
 */
export async function setAdminCatalogStatus({
  ids,
  status,
  actorUserId,
}: {
  ids: string[]
  status: "draft" | "live"
  actorUserId: string
}): Promise<CatalogBulkResult> {
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(pomodoroCatalogItems)
      .where(inArray(pomodoroCatalogItems.id, ids))
      .for("update")
    const same = rows.filter((row) => row.status === status).map((row) => row.id)
    const ready = rows.filter((row) => {
      if (row.status === status) return false
      if (status === "draft") return true
      const hasFile = row.kind === "theme" || Boolean(row.fileUrl)
      return hasFile && Boolean(row.pictureUrl)
    })
    const now = new Date()
    for (const row of ready) {
      await tx
        .update(pomodoroCatalogItems)
        .set({
          status,
          publishedAt: status === "live" ? (row.publishedAt ?? now) : null,
          updatedAt: now,
        })
        .where(eq(pomodoroCatalogItems.id, row.id))
    }
    const changed = ready.map((row) => row.id)
    await logCatalogAct(tx, actorUserId, `catalog_${status}`, changed)
    const settled = new Set([...changed, ...same])
    return { changed, same, skipped: ids.filter((id) => !settled.has(id)) }
  })
  forgetMediaCatalog()
  return result
}

/** Free or Pro over ticked rows. */
export async function setAdminCatalogLocked({
  ids,
  locked,
  actorUserId,
}: {
  ids: string[]
  locked: boolean
  actorUserId: string
}): Promise<CatalogBulkResult> {
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: pomodoroCatalogItems.id, locked: pomodoroCatalogItems.locked })
      .from(pomodoroCatalogItems)
      .where(inArray(pomodoroCatalogItems.id, ids))
    const same = rows.filter((row) => row.locked === locked).map((row) => row.id)
    const updated = await tx
      .update(pomodoroCatalogItems)
      .set({ locked, updatedAt: new Date() })
      .where(
        and(
          inArray(pomodoroCatalogItems.id, ids),
          ne(pomodoroCatalogItems.locked, locked)
        )
      )
      .returning({ id: pomodoroCatalogItems.id })
    const changed = updated.map((row) => row.id)
    await logCatalogAct(
      tx,
      actorUserId,
      locked ? "catalog_pro" : "catalog_free",
      changed
    )
    const settled = new Set([...changed, ...same])
    return { changed, same, skipped: ids.filter((id) => !settled.has(id)) }
  })
  forgetMediaCatalog()
  return result
}

/**
 * Puts one kind in the order given, which is the whole list as the admin
 * dragged it. Ids of the other kind, or that no longer exist, are ignored.
 */
export async function reorderAdminCatalog({
  kind,
  ids,
  actorUserId,
}: {
  kind: CatalogKind
  ids: string[]
  actorUserId: string
}) {
  await db.transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx
        .update(pomodoroCatalogItems)
        .set({ position, updatedAt: new Date() })
        .where(
          and(eq(pomodoroCatalogItems.id, id), eq(pomodoroCatalogItems.kind, kind))
        )
    }
    await logCatalogAct(tx, actorUserId, "catalog_reorder", ids)
  })
  forgetMediaCatalog()
}

/**
 * Deletes items. A room or personal room that picked one falls back at once,
 * to the default scene or to silence, because the catalogue no longer has it
 * (Tyler, 8 Oct 2026). Their saved choice is left as it was. The item's own
 * uploaded files go from the bucket once the rows are gone; the built-in files
 * under `public/` are never touched.
 */
export async function deleteAdminCatalogItems({
  ids,
  actorUserId,
}: {
  ids: string[]
  actorUserId: string
}) {
  const removed = await db.transaction(async (tx) => {
    const gone = await tx
      .delete(pomodoroCatalogItems)
      .where(inArray(pomodoroCatalogItems.id, ids))
      .returning({
        id: pomodoroCatalogItems.id,
        filePath: pomodoroCatalogItems.filePath,
        sourcePath: pomodoroCatalogItems.sourcePath,
        picturePath: pomodoroCatalogItems.picturePath,
      })
    await logCatalogAct(
      tx,
      actorUserId,
      "catalog_delete",
      gone.map((row) => row.id)
    )
    return gone
  })
  forgetMediaCatalog()
  await removeFiles(
    removed.flatMap((row) =>
      [row.filePath, row.sourcePath, row.picturePath].filter(
        (path): path is string => !!path
      )
    )
  )
  const deleted = removed.map((row) => row.id)
  const gone = new Set(deleted)
  return { deleted, skipped: ids.filter((id) => !gone.has(id)) }
}

/** A file left behind in the bucket costs pennies; a failed delete is logged, never thrown. */
export async function removeFiles(paths: string[]) {
  for (const path of paths) {
    try {
      await deleteFromR2(path)
    } catch (error) {
      console.error("catalogue file could not be removed", path, error)
    }
  }
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

/**
 * Stores an admin's upload as it arrived and says where, for the window to
 * save with the item. The worker re-encodes it later. The bytes have to be
 * what they claim to be, the same check members' uploads get.
 */
export async function storeCatalogSource({
  bytes,
  mimeType,
}: {
  bytes: Uint8Array
  mimeType: string
}) {
  const detected = detectUploadType(bytes.subarray(0, 16))
  if (!detected || detected.mimeType !== mimeType)
    throw new Error("INVALID_FILE_CONTENT")
  return storeCatalogBytes(bytes)
}

/**
 * Stores a file that came from somewhere with no type to claim, such as
 * Pixabay's file server, which answers every file as `binary/octet-stream`.
 * The bytes alone decide what it is.
 *
 * A film may be up to `CATALOG_FILM_LIMIT_BYTES`, for Pixabay's. One from the
 * browser never gets this far past 100 MB: `validateUploadContentLength`
 * refuses it before a byte is read.
 */
export async function storeCatalogBytes(bytes: Uint8Array) {
  const detected = detectUploadType(bytes.subarray(0, 16))
  if (!detected) throw new Error("INVALID_FILE_CONTENT")
  const limit =
    detected.kind === "video" ? CATALOG_FILM_LIMIT_BYTES : uploadLimitBytes(detected.kind)
  if (bytes.byteLength > limit) throw new Error("FILE_TOO_LARGE")
  const path = `pomodoro-catalog/sources/${randomUUID()}.${detected.extension}`
  await uploadToR2(path, bytes, detected.mimeType)
  return { path, kind: detected.kind }
}

/**
 * "Upload several": one Draft per file, named after the file, each queued for
 * the worker. A picture dropped on Themes becomes a still straight away.
 */
export async function createCatalogDrafts({
  kind,
  files,
  actorUserId,
}: {
  kind: CatalogKind
  files: { name: string; path: string; kind: "audio" | "video" | "image"; url: string | null }[]
  actorUserId: string
}) {
  for (const file of files) assertSource({ path: file.path, kind: file.kind }, kind)
  const created = await db.transaction(async (tx) => {
    const [last] = await tx
      .select({
        position: sql<number>`coalesce(max(${pomodoroCatalogItems.position}), -1)::int`,
      })
      .from(pomodoroCatalogItems)
      .where(eq(pomodoroCatalogItems.kind, kind))
    let position = (last?.position ?? -1) + 1
    const ids: string[] = []
    for (const file of files) {
      const label = labelFromFilename(file.name)
      const still = kind === "theme" && file.kind === "image"
      const [row] = await tx
        .insert(pomodoroCatalogItems)
        .values({
          kind,
          key: await freshKey(tx, kind, label),
          label,
          descriptor: kind === "sound" ? "ambient" : still ? "static" : "video",
          status: "draft",
          position: position++,
          // A still needs no work; it is the picture already.
          pictureUrl: still ? file.url : kind === "sound" ? randomSoundGraphic() : null,
          picturePath: still ? file.path : null,
          fileStatus: still ? "ready" : "queued",
          sourcePath: still ? null : file.path,
          sourceKind: still ? null : file.kind,
        })
        .returning({ id: pomodoroCatalogItems.id })
      ids.push(row.id)
    }
    await logCatalogAct(tx, actorUserId, "catalog_create", ids)
    return ids
  })
  forgetMediaCatalog()
  return created
}

// ---------------------------------------------------------------------------
// The worker's side
// ---------------------------------------------------------------------------

/**
 * Longer than one job can run: two FFmpeg calls of up to four minutes each,
 * plus the download and upload around them. A live job is never stolen.
 */
const CLAIM_TIMEOUT_MS = 12 * 60 * 1000
export const CATALOG_MAX_ATTEMPTS = 3

export async function claimNextCatalogFile() {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS)
  // A job whose worker died (out of memory, a restart) never reached its own
  // failure handling. After the last attempt it is failed here, so the
  // dashboard never says "processing" for ever.
  const gaveUp = await db
    .update(pomodoroCatalogItems)
    .set({
      fileStatus: "failed",
      fileError: "The file stopped processing three times. Upload it again, or try a smaller file.",
      claimedAt: null,
    })
    .where(
      and(
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
          where ${pomodoroCatalogItems.sourcePath} is not null and (
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
  return claimed ?? null
}

/** The finished file replaces the old one, and the upload as it arrived goes. */
export async function finishCatalogFile({
  id,
  sourcePath,
  fileUrl,
  filePath,
  poster,
  durationSeconds,
}: {
  id: string
  sourcePath: string
  fileUrl: string
  filePath: string
  /** The frame halfway through a film, already in the bucket. */
  poster: { url: string; path: string } | null
  durationSeconds: number | null
}) {
  const [before] = await db
    .select({
      filePath: pomodoroCatalogItems.filePath,
      picturePath: pomodoroCatalogItems.picturePath,
    })
    .from(pomodoroCatalogItems)
    .where(eq(pomodoroCatalogItems.id, id))
    .limit(1)
  // A film's middle frame is always its still, so the still matches the film
  // it stands in for. Tyler, 9 Oct 2026.
  const usePoster = Boolean(poster)
  const [updated] = await db
    .update(pomodoroCatalogItems)
    .set({
      fileUrl,
      filePath,
      fileStatus: "ready",
      fileError: null,
      sourcePath: null,
      sourceKind: null,
      claimedAt: null,
      durationSeconds,
      ...(usePoster && poster
        ? { pictureUrl: poster.url, picturePath: poster.path }
        : {}),
      updatedAt: new Date(),
    })
    // Only while the same upload is still the one waiting: an admin who
    // replaced the file meanwhile has queued a newer one.
    .where(
      and(
        eq(pomodoroCatalogItems.id, id),
        eq(pomodoroCatalogItems.sourcePath, sourcePath)
      )
    )
    .returning({ id: pomodoroCatalogItems.id })
  forgetMediaCatalog()
  const unusedPoster = poster && (!updated || !usePoster) ? poster.path : null
  if (!updated) {
    await removeFiles([filePath, unusedPoster].filter((path): path is string => !!path))
    return
  }
  // The old still goes once the new one has replaced it, if this app stored
  // it. A built-in still under `public/` has no path and is never removed.
  const oldPicture = usePoster ? before?.picturePath : null
  await removeFiles(
    [sourcePath, before?.filePath, unusedPoster, oldPicture].filter(
      (path): path is string => !!path
    )
  )
}

/**
 * Where a still taken from the middle of a film is stored. The name tells it
 * apart from a still made before 9 Oct 2026, which was the film's first frame,
 * so the worker can catch those up (`findThemeNeedingMiddleStill`).
 */
export const MIDDLE_STILL_PREFIX = "pomodoro-catalog/themes/middle-"

/**
 * A theme whose film is in the bucket but whose still was not taken from the
 * middle of it: a first frame from before 9 Oct 2026, or a still that was
 * chosen by hand. `skip` holds the ones that already failed this run, so one
 * bad film is not tried on every pass. A built-in film under `public/` has no
 * bucket path and is never picked; its still ships with the app.
 */
export async function findThemeNeedingMiddleStill(skip: string[]) {
  const [row] = await db
    .select({
      id: pomodoroCatalogItems.id,
      filePath: pomodoroCatalogItems.filePath,
      picturePath: pomodoroCatalogItems.picturePath,
    })
    .from(pomodoroCatalogItems)
    .where(
      and(
        eq(pomodoroCatalogItems.kind, "theme"),
        eq(pomodoroCatalogItems.fileStatus, "ready"),
        sql`${pomodoroCatalogItems.filePath} is not null`,
        sql`${pomodoroCatalogItems.sourcePath} is null`,
        sql`(${pomodoroCatalogItems.picturePath} is null or ${pomodoroCatalogItems.picturePath} not like ${`${MIDDLE_STILL_PREFIX}%`})`,
        skip.length ? notInArray(pomodoroCatalogItems.id, skip) : undefined
      )
    )
    .orderBy(asc(pomodoroCatalogItems.createdAt))
    .limit(1)
  return row?.filePath ? { ...row, filePath: row.filePath } : null
}

/**
 * Puts a caught-up middle still on a theme, as long as nothing changed under
 * it meanwhile: the same film and the same old still. The old still leaves
 * the bucket; a new one that lost the race is removed instead.
 */
export async function setThemeMiddleStill({
  id,
  filePath,
  picturePath,
  still,
}: {
  id: string
  filePath: string
  picturePath: string | null
  still: { url: string; path: string }
}) {
  const [updated] = await db
    .update(pomodoroCatalogItems)
    .set({ pictureUrl: still.url, picturePath: still.path, updatedAt: new Date() })
    .where(
      and(
        eq(pomodoroCatalogItems.id, id),
        eq(pomodoroCatalogItems.filePath, filePath),
        picturePath === null
          ? sql`${pomodoroCatalogItems.picturePath} is null`
          : eq(pomodoroCatalogItems.picturePath, picturePath)
      )
    )
    .returning({ id: pomodoroCatalogItems.id })
  forgetMediaCatalog()
  await removeFiles(
    [updated ? picturePath : still.path].filter((path): path is string => !!path)
  )
  return Boolean(updated)
}

/**
 * The file could not be used. `retry` puts it back in the queue for another
 * go; otherwise the item keeps whatever file it had and says why.
 */
export async function failCatalogFile({
  id,
  sourcePath,
  reason,
  retry,
}: {
  id: string
  sourcePath: string
  reason: string
  retry: boolean
}) {
  await db
    .update(pomodoroCatalogItems)
    .set(
      retry
        ? { fileStatus: "queued", claimedAt: null }
        : {
            fileStatus: "failed",
            fileError: reason.slice(0, 300),
            sourcePath: null,
            sourceKind: null,
            claimedAt: null,
          }
    )
    .where(
      and(
        eq(pomodoroCatalogItems.id, id),
        eq(pomodoroCatalogItems.sourcePath, sourcePath)
      )
    )
  if (!retry) await removeFiles([sourcePath])
}
