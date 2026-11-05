import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"

import { ANALYSIS_NOTES_MAX, type AnalysisPieces } from "@/lib/viral/analysis"
import { isCreatorPlatform } from "@/lib/viral/creators"
import { viralSays } from "@/lib/viral/viral"
import {
  cleanTag,
  VAULT_TAGS_PER_ITEM_MAX,
  type VaultItem,
  type VaultStats,
  type VaultStatus,
} from "@/lib/viral/vault"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { deleteFromR2, getPublicMediaUrl } from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { discardOwnedMedia } from "@/server/viral/delete-saved-videos"
import { mediaStillInUse } from "@/server/viral/media-in-use"
import { loadViralProjectScreen } from "@/server/viral/project-view"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { saveVideo } from "@/server/viral/saved-videos"
import {
  viralAnalyses,
  viralProjects,
  viralSends,
  viralTags,
  viralVaultItems,
  viralVaultItemTags,
  viralVideos,
  type ViralVaultItemRow,
} from "@/server/viral/schema"

/**
 * The vault (`workspace/docs/vault.md`, task parts 17 to 20). Tyler, 4 Nov
 * 2026: "Every project has a vault that I can save viral ideas to", "Per
 * project + all-vault page", "Keep a downloaded copy", "Status and tags".
 *
 * An item copies what it needs when it is saved: the numbers, the analysis
 * picked and the notes. The video file is the saved video's own download,
 * and `media-in-use.ts` keeps that file in storage while any vault item
 * points at it, so deleting the search result or the saved video never
 * stops the item playing. Deleting the item deletes the file once nothing
 * else uses it.
 */

export type SaveToVaultInput = {
  projectId: string
  /** The video's link, as the middle panel has it. */
  url: string
  /** The analysis to keep with it, or none. */
  analysisId: string | null
  notes: string
}

/**
 * Save to vault on the right panel. The video is downloaded if it isn't
 * already (Download only, no AI), and the item takes its copy when the
 * download lands. Saving a video already in this project's vault updates
 * that item's analysis and notes instead of adding a second.
 */
export async function saveToVault(ownerId: string, input: SaveToVaultInput): Promise<VaultItem> {
  const project = await requireOwnedViralProject(ownerId, input.projectId)
  const screen = await loadViralProjectScreen(ownerId, project.id)
  const saved = await saveVideo(ownerId, input.url, project.id, false)
  const [savedRow] = await db.select().from(viralVideos).where(eq(viralVideos.id, saved.id))
  const video = screen.videos.find(
    (one) => one.platform === savedRow.platform && one.platformVideoId === savedRow.platformVideoId
  )

  let analysis: { topic: string; pieces: AnalysisPieces } | null = null
  if (input.analysisId) {
    const [row] = await db
      .select({ topic: viralAnalyses.topic, pieces: viralAnalyses.pieces })
      .from(viralAnalyses)
      .where(
        and(
          eq(viralAnalyses.id, input.analysisId),
          eq(viralAnalyses.ownerId, ownerId),
          eq(viralAnalyses.savedVideoId, savedRow.id)
        )
      )
    if (!row) throw viralSays("That analysis is gone. Pick another, or save without one.")
    analysis = row
  }

  const stats: VaultStats = {
    views: video?.views ?? savedRow.views,
    likes: video?.likes ?? savedRow.likes,
    comments: video?.comments ?? savedRow.comments,
    subscribers: video?.subscribers ?? savedRow.subscribers,
    durationSeconds: video?.durationSeconds ?? savedRow.durationSeconds,
    postedAt: video?.postedAt ?? savedRow.postedAt?.toISOString() ?? null,
    score: video?.score.score ?? null,
    outlier: video?.outlier.times ?? null,
  }
  const at = now()
  const notes = input.notes.slice(0, ANALYSIS_NOTES_MAX)
  const values = {
    savedVideoId: savedRow.id,
    sourceUrl: savedRow.sourceUrl,
    title: video?.title ?? savedRow.title ?? savedRow.sourceUrl,
    channelName: video?.channelName ?? savedRow.channelName ?? "",
    mediaId: savedRow.mediaId,
    thumbnailUrl: video?.thumbnailUrl ?? null,
    thumbnailStoragePath: savedRow.thumbnailStoragePath,
    stats,
    analysisTopic: analysis?.topic ?? null,
    analysis: analysis?.pieces ?? null,
    notes,
  }
  const [row] = await db
    .insert(viralVaultItems)
    .values({
      id: uuid(),
      ownerId,
      projectId: project.id,
      platform: savedRow.platform,
      platformVideoId: savedRow.platformVideoId,
      ...values,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: [viralVaultItems.projectId, viralVaultItems.platform, viralVaultItems.platformVideoId],
      // An item that already keeps a file and a cover keeps them. Its saved
      // video may have been deleted since, and then nothing else points at
      // that file: overwriting it would leave it in storage for good.
      set: {
        ...values,
        mediaId: sql`coalesce(${viralVaultItems.mediaId}, excluded.media_id)`,
        thumbnailStoragePath: sql`coalesce(${viralVaultItems.thumbnailStoragePath}, excluded.thumbnail_storage_path)`,
        updatedAt: at,
      },
    })
    .returning()
  const [item] = await serialize([row])
  return item
}

/**
 * The saved-video worker calls this once a download lands: every vault item
 * waiting on that video takes the file and the cover.
 */
export async function fillVaultCopies(savedVideoId: string, mediaId: string, thumbnailStoragePath: string | null) {
  await db
    .update(viralVaultItems)
    .set({ mediaId, ...(thumbnailStoragePath ? { thumbnailStoragePath } : {}), updatedAt: now() })
    .where(and(eq(viralVaultItems.savedVideoId, savedVideoId), isNull(viralVaultItems.mediaId)))
}

export type VaultFilter = {
  /** One project's vault, or every project's when left out. */
  projectId?: string
}

/** The vault items, newest first, with their tags and their last send. */
export async function listVault(ownerId: string, filter: VaultFilter = {}): Promise<VaultItem[]> {
  if (filter.projectId) await requireOwnedViralProject(ownerId, filter.projectId)
  const rows = await db
    .select()
    .from(viralVaultItems)
    .where(
      and(
        eq(viralVaultItems.ownerId, ownerId),
        filter.projectId ? eq(viralVaultItems.projectId, filter.projectId) : undefined
      )
    )
    .orderBy(desc(viralVaultItems.createdAt))
  return serialize(rows)
}

export async function loadVaultItem(ownerId: string, itemId: string): Promise<VaultItem> {
  const row = await requireOwnedItem(ownerId, itemId)
  const [item] = await serialize([row])
  return item
}

async function requireOwnedItem(ownerId: string, itemId: string): Promise<ViralVaultItemRow> {
  const [row] = await db
    .select()
    .from(viralVaultItems)
    .where(and(eq(viralVaultItems.id, itemId), eq(viralVaultItems.ownerId, ownerId)))
  if (!row) throw viralSays("That idea is no longer in the vault.")
  return row
}

async function serialize(rows: ViralVaultItemRow[]): Promise<VaultItem[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const mediaIds = rows.flatMap((row) => (row.mediaId ? [row.mediaId] : []))
  const [tagRows, projectRows, mediaRows, sendRows] = await Promise.all([
    db
      .select({ itemId: viralVaultItemTags.itemId, name: viralTags.name })
      .from(viralVaultItemTags)
      .innerJoin(viralTags, eq(viralTags.id, viralVaultItemTags.tagId))
      .where(inArray(viralVaultItemTags.itemId, ids))
      .orderBy(asc(viralTags.name)),
    db
      .select({ id: viralProjects.id, name: viralProjects.name })
      .from(viralProjects)
      .where(inArray(viralProjects.id, [...new Set(rows.map((row) => row.projectId))])),
    mediaIds.length
      ? db
          .select({ id: customShellMedia.id, storagePath: customShellMedia.storagePath })
          .from(customShellMedia)
          .where(inArray(customShellMedia.id, mediaIds))
      : Promise.resolve([]),
    db
      .select({ itemId: viralSends.itemId, id: viralSends.id, status: viralSends.status, error: viralSends.error })
      .from(viralSends)
      .where(inArray(viralSends.itemId, ids))
      .orderBy(desc(viralSends.createdAt)),
  ])
  const names = new Map(projectRows.map((row) => [row.id, row.name]))
  const paths = new Map(mediaRows.map((row) => [row.id, row.storagePath]))
  const lastSend = new Map<string, (typeof sendRows)[number]>()
  for (const send of sendRows) if (!lastSend.has(send.itemId)) lastSend.set(send.itemId, send)

  return Promise.all(
    rows.map(async (row): Promise<VaultItem> => {
      const path = row.mediaId ? paths.get(row.mediaId) : undefined
      const send = lastSend.get(row.id)
      return {
        id: row.id,
        projectId: row.projectId,
        projectName: names.get(row.projectId) ?? "",
        platform: isCreatorPlatform(row.platform) ? row.platform : "youtube",
        platformVideoId: row.platformVideoId,
        sourceUrl: row.sourceUrl,
        title: row.title,
        channelName: row.channelName,
        thumbnailUrl: row.thumbnailStoragePath ? await getPublicMediaUrl(row.thumbnailStoragePath) : row.thumbnailUrl,
        playbackUrl: path ? await getPublicMediaUrl(path) : null,
        stats: row.stats,
        analysisTopic: row.analysisTopic,
        analysis: row.analysis,
        notes: row.notes,
        status: row.status,
        tags: tagRows.filter((tag) => tag.itemId === row.id).map((tag) => tag.name),
        sentEditUrl: row.sentEditUrl,
        sentAt: row.sentAt?.toISOString() ?? null,
        send: send ? { id: send.id, status: send.status as NonNullable<VaultItem["send"]>["status"], error: send.error } : null,
        createdAt: row.createdAt.toISOString(),
      }
    })
  )
}

/** Notes, status and tags on one item, each saved as it changes. */
export async function updateVaultItem(
  ownerId: string,
  itemId: string,
  change: { notes?: string; status?: VaultStatus; tags?: string[] }
): Promise<VaultItem> {
  await requireOwnedItem(ownerId, itemId)
  if (change.notes !== undefined || change.status !== undefined) {
    await db
      .update(viralVaultItems)
      .set({
        ...(change.notes !== undefined ? { notes: change.notes.slice(0, ANALYSIS_NOTES_MAX) } : {}),
        ...(change.status !== undefined ? { status: change.status } : {}),
        updatedAt: now(),
      })
      .where(eq(viralVaultItems.id, itemId))
  }
  if (change.tags !== undefined) await setItemTags(ownerId, itemId, change.tags)
  return loadVaultItem(ownerId, itemId)
}

/** Finds each tag by name, ignoring case, or makes it. Answers their ids. The Library's hook tags use the same list. */
export async function tagIds(ownerId: string, names: string[]): Promise<string[]> {
  // The first spelling typed wins: "Hooks" then "hooks" is one tag, "Hooks".
  const byKey = new Map<string, string>()
  for (const name of names.map(cleanTag)) if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name)
  const cleaned = [...byKey.values()]
  if (!cleaned.length) return []
  if (cleaned.length > VAULT_TAGS_PER_ITEM_MAX) throw viralSays(`An idea can have at most ${VAULT_TAGS_PER_ITEM_MAX} tags.`)
  await db
    .insert(viralTags)
    .values(cleaned.map((name) => ({ id: uuid(), ownerId, name, createdAt: now() })))
    .onConflictDoNothing()
  const mine = await db.select({ id: viralTags.id, name: viralTags.name }).from(viralTags).where(eq(viralTags.ownerId, ownerId))
  const wanted = new Set(cleaned.map((name) => name.toLowerCase()))
  return mine.filter((tag) => wanted.has(tag.name.toLowerCase())).map((tag) => tag.id)
}

async function setItemTags(ownerId: string, itemId: string, names: string[]) {
  const ids = await tagIds(ownerId, names)
  await db.transaction(async (tx) => {
    await tx.delete(viralVaultItemTags).where(eq(viralVaultItemTags.itemId, itemId))
    if (ids.length) await tx.insert(viralVaultItemTags).values(ids.map((tagId) => ({ itemId, tagId })))
  })
}

/** Every tag this person has used, for the box that offers them as they type. */
export async function listVaultTags(ownerId: string): Promise<string[]> {
  const rows = await db.select({ name: viralTags.name }).from(viralTags).where(eq(viralTags.ownerId, ownerId)).orderBy(asc(viralTags.name))
  return rows.map((row) => row.name)
}

export type VaultBulkChange = { kind: "status"; status: VaultStatus } | { kind: "tag"; name: string } | { kind: "delete" }

export type VaultBulkResult = {
  completed: string[]
  /** Already that way, so nothing was written. */
  same: string[]
  skipped: { id: string; reason: string }[]
}

/**
 * Mass select's one request: set a status, add a tag, or delete. Ids that
 * are not this person's are skipped with a reason, never changed.
 */
export async function changeVaultItems(ownerId: string, ids: string[], change: VaultBulkChange): Promise<VaultBulkResult> {
  const unique = [...new Set(ids)]
  const rows = unique.length
    ? await db
        .select()
        .from(viralVaultItems)
        .where(and(eq(viralVaultItems.ownerId, ownerId), inArray(viralVaultItems.id, unique)))
    : []
  const found = new Set(rows.map((row) => row.id))
  const skipped = unique.filter((id) => !found.has(id)).map((id) => ({ id, reason: "no longer in the vault" }))

  if (change.kind === "delete") {
    const completed = await deleteVaultRows(ownerId, rows)
    return { completed, same: [], skipped }
  }
  if (change.kind === "status") {
    const toChange = rows.filter((row) => row.status !== change.status).map((row) => row.id)
    if (toChange.length) {
      await db.update(viralVaultItems).set({ status: change.status, updatedAt: now() }).where(inArray(viralVaultItems.id, toChange))
    }
    return { completed: toChange, same: rows.filter((row) => row.status === change.status).map((row) => row.id), skipped }
  }
  const [tagId] = await tagIds(ownerId, [change.name])
  if (!tagId) throw viralSays("Type a tag first.")
  const added = rows.length
    ? await db
        .insert(viralVaultItemTags)
        .values(rows.map((row) => ({ itemId: row.id, tagId })))
        .onConflictDoNothing()
        .returning({ itemId: viralVaultItemTags.itemId })
    : []
  const addedIds = new Set(added.map((row) => row.itemId))
  return {
    completed: rows.filter((row) => addedIds.has(row.id)).map((row) => row.id),
    same: rows.filter((row) => !addedIds.has(row.id)).map((row) => row.id),
    skipped,
  }
}

/**
 * Deletes vault items, then their cover and video file once nothing else in
 * Viral uses them. Answers the ids deleted.
 */
async function deleteVaultRows(ownerId: string, rows: ViralVaultItemRow[]): Promise<string[]> {
  if (!rows.length) return []
  await db.delete(viralVaultItems).where(
    and(
      eq(viralVaultItems.ownerId, ownerId),
      inArray(
        viralVaultItems.id,
        rows.map((row) => row.id)
      )
    )
  )
  await discardVaultFiles(ownerId, rows)
  return rows.map((row) => row.id)
}

/**
 * The files of vault items already deleted: each video file and cover goes
 * once nothing else in Viral uses it. Deleting a project calls this too,
 * because its vault items go through the foreign key.
 */
export async function discardVaultFiles(
  ownerId: string,
  rows: Pick<ViralVaultItemRow, "mediaId" | "thumbnailStoragePath">[]
): Promise<void> {
  const mediaIds = [...new Set(rows.flatMap((row) => (row.mediaId ? [row.mediaId] : [])))]
  const inUse = await mediaStillInUse(ownerId, mediaIds)
  for (const mediaId of mediaIds) {
    if (!inUse.has(mediaId)) await discardOwnedMedia(ownerId, mediaId)
  }
  // A cover is shared with the saved video when it still exists, so only an
  // orphaned one goes.
  const covers = [...new Set(rows.flatMap((row) => (row.thumbnailStoragePath ? [row.thumbnailStoragePath] : [])))]
  for (const path of covers) {
    const [stillSaved] = await db.select({ id: viralVideos.id }).from(viralVideos).where(eq(viralVideos.thumbnailStoragePath, path)).limit(1)
    const [stillKept] = await db
      .select({ id: viralVaultItems.id })
      .from(viralVaultItems)
      .where(eq(viralVaultItems.thumbnailStoragePath, path))
      .limit(1)
    if (!stillSaved && !stillKept) await deleteFromR2(path).catch((error) => console.error("A vault cover stayed in storage", path, error))
  }
}

export type VaultCopyResult = { state: "copied"; item: VaultItem } | { state: "already"; projectName: string }

/**
 * Copy to another project (task part 16, Tyler: "Copy, both keep it"). The
 * copy keeps the analysis, the numbers, the notes, the status, the tags and
 * the Open in Video link, and points at the same downloaded file and cover:
 * `media-in-use.ts` counts both ideas, so deleting one leaves the other
 * playing. A project that already holds the video changes nothing.
 */
export async function copyVaultItem(ownerId: string, itemId: string, targetProjectId: string): Promise<VaultCopyResult> {
  const item = await requireOwnedItem(ownerId, itemId)
  const target = await requireOwnedViralProject(ownerId, targetProjectId)
  if (target.id === item.projectId) throw viralSays("That is the project it is already in. Pick another.")
  // The same refusals as copying a video (`copy-to-project.ts`).
  if (target.isSample) throw viralSays("A sample project's videos are made up, so nothing can be copied into it.")
  if (target.archivedAt) throw viralSays(`"${target.name}" is archived. Bring it back first, then copy into it.`)
  if (item.platformVideoId.startsWith("sample-")) {
    throw viralSays("This is a made-up sample video, so there is nothing real to copy.")
  }
  const at = now()
  const [row] = await db
    .insert(viralVaultItems)
    .values({
      ...item,
      id: uuid(),
      projectId: target.id,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing({
      target: [viralVaultItems.projectId, viralVaultItems.platform, viralVaultItems.platformVideoId],
    })
    .returning()
  if (!row) return { state: "already", projectName: target.name }
  const tags = await db.select({ tagId: viralVaultItemTags.tagId }).from(viralVaultItemTags).where(eq(viralVaultItemTags.itemId, item.id))
  if (tags.length) await db.insert(viralVaultItemTags).values(tags.map((tag) => ({ itemId: row.id, tagId: tag.tagId })))
  const [copied] = await serialize([row])
  return { state: "copied", item: copied }
}
