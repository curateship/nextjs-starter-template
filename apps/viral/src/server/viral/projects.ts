import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm"

import {
  cleanKeyword,
  cleanKeywords,
  VIRAL_DAY_CHOICES,
  VIRAL_DESCRIPTION_MAX,
  VIRAL_KEYWORDS_MAX,
  VIRAL_PROJECT_NAME_MAX,
  VIRAL_PROJECT_NOT_FOUND,
  viralSays,
  type ViralDays,
  type ViralProjectItem,
  type ViralVideoLength,
} from "@/lib/viral/viral"
import {
  cleanFolderName,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/viral/project-folders"
import { savedViewScreen } from "@/lib/saved-views"
import { VIRAL_SAVED_VIEW_KIND } from "@/lib/viral/viral-saved-views"
import { ANALYSIS_TOPIC_MAX, type AnalysisPieces } from "@/lib/viral/analysis"
import { storedNotes } from "@/lib/viral/notes"
import { readSocials, socialHasKeywords, SOCIAL_NAMES, type Social } from "@/lib/viral/socials"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  viralCreators,
  viralVaultItems,
  viralAnalyses,
  viralSampleMade,
  viralVideos,
  viralProjectCreators,
  viralProjectFolders,
  viralProjectHiddenChannels,
  viralProjectKeywords,
  viralProjectResults,
  viralProjects,
  type ViralProjectRow,
} from "@/server/viral/schema"
import { deleteSavedViewsFor } from "@/server/saved-views"
import { isUniqueViolation } from "@/server/viral/unique-violation"

/**
 * Viral projects: one niche each, with a description and its keywords.
 *
 * Every read and write names the owner, so a borrowed id finds nothing rather
 * than somebody else's project. Searching lives in `project-search.ts`; this
 * file is the list, the settings and the keywords themselves.
 */

export async function requireOwnedViralProject(
  ownerId: string,
  projectId: string
): Promise<ViralProjectRow> {
  const [row] = await db
    .select()
    .from(viralProjects)
    .where(
      and(
        eq(viralProjects.id, projectId),
        eq(viralProjects.ownerId, ownerId)
      )
    )
    .limit(1)
  if (!row) throw viralSays(VIRAL_PROJECT_NOT_FOUND)
  return row
}

export type ViralProjectListFilter = {
  search?: string
  /** A folder's id, null for the ones in no folder, absent for all. */
  folderId?: string | null
  archived: boolean
}

export async function listViralProjects(
  ownerId: string,
  filter: ViralProjectListFilter
): Promise<ViralProjectItem[]> {
  const conditions = [
    eq(viralProjects.ownerId, ownerId),
    filter.archived
      ? isNotNull(viralProjects.archivedAt)
      : isNull(viralProjects.archivedAt),
  ]
  if (filter.folderId === null) conditions.push(isNull(viralProjects.folderId))
  else if (filter.folderId) {
    conditions.push(eq(viralProjects.folderId, filter.folderId))
  }
  const search = filter.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    conditions.push(
      or(
        ilike(viralProjects.name, pattern),
        ilike(viralProjects.description, pattern)
      )!
    )
  }

  const rows = await db
    .select()
    .from(viralProjects)
    .where(and(...conditions))
    .orderBy(desc(viralProjects.updatedAt))
  return serializeProjects(rows)
}

export async function getViralProjectItem(
  ownerId: string,
  projectId: string
): Promise<ViralProjectItem> {
  const row = await requireOwnedViralProject(ownerId, projectId)
  const [item] = await serializeProjects([row])
  return item
}

/** Each project with its keywords, its video count and whether it is searching. */
async function serializeProjects(
  rows: ViralProjectRow[]
): Promise<ViralProjectItem[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const [keywordRows, counts, vaultCounts] = await Promise.all([
    db
      .select({
        projectId: viralProjectKeywords.projectId,
        keyword: viralProjectKeywords.keyword,
        status: viralProjectKeywords.status,
      })
      .from(viralProjectKeywords)
      .where(inArray(viralProjectKeywords.projectId, ids))
      .orderBy(
        asc(viralProjectKeywords.position),
        asc(viralProjectKeywords.createdAt)
      ),
    db
      .select({
        projectId: viralProjectResults.projectId,
        videos: countDistinct(viralProjectResults.platformVideoId),
      })
      .from(viralProjectResults)
      .where(inArray(viralProjectResults.projectId, ids))
      .groupBy(viralProjectResults.projectId),
    db
      .select({ projectId: viralVaultItems.projectId, items: count() })
      .from(viralVaultItems)
      .where(inArray(viralVaultItems.projectId, ids))
      .groupBy(viralVaultItems.projectId),
  ])
  const videoCounts = new Map(counts.map((row) => [row.projectId, row.videos]))
  const vaultByProject = new Map(vaultCounts.map((row) => [row.projectId, row.items]))

  return rows.map((row) => {
    const keywords = keywordRows.filter((one) => one.projectId === row.id)
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      notes: row.notes,
      topic: row.topic,
      socials: readSocials(row.socials),
      paused_socials: readSocials(row.pausedSocials),
      vault_count: vaultByProject.get(row.id) ?? 0,
      folder_id: row.folderId,
      keywords: keywords.map((one) => one.keyword),
      days: row.days as ViralDays,
      min_views: row.minViews,
      min_score: row.minScore,
      video_length: row.videoLength as ViralVideoLength,
      pinned: row.pinnedAt !== null,
      archived: row.archivedAt !== null,
      sample: row.isSample,
      cover_url: row.coverUrl,
      cover_chosen: row.coverChosen,
      result_count: videoCounts.get(row.id) ?? 0,
      units_spent: row.unitsSpent,
      spend_limit_cents: row.spendLimitCents,
      updated_at: row.updatedAt.toISOString(),
      searching: keywords.some(
        (one) => one.status === "queued" || one.status === "searching"
      ),
    }
  })
}

function cleanName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ")
  if (!cleaned) throw viralSays("A project needs a name.")
  return cleaned.slice(0, VIRAL_PROJECT_NAME_MAX)
}

function cleanDescription(value: string) {
  return value.trim().slice(0, VIRAL_DESCRIPTION_MAX)
}

function cleanTopic(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, ANALYSIS_TOPIC_MAX)
}

/** Runs a keyword check and turns its sentence into one the screen shows. */
function sayKeywords<T>(check: () => T): T {
  try {
    return check()
  } catch (error) {
    throw viralSays(error instanceof Error ? error.message : "Check the keywords.")
  }
}

export type NewViralProject = {
  name: string
  description: string
  /** "What do you make, and for whom?" Empty when left out. */
  topic?: string
  /** The socials ticked in the New project window, in that order. Both when left out. */
  socials?: Social[]
  /** Optional. Keywords need YouTube among the socials. */
  keywords: string[]
  folderId: string | null
}

/**
 * A new project with its socials and any keywords. Nothing is searched yet:
 * the screen it opens on has the Search button, so creating a project never
 * spends.
 */
export async function createViralProject(
  ownerId: string,
  input: NewViralProject
): Promise<ViralProjectItem> {
  const name = cleanName(input.name)
  const keywords = sayKeywords(() => cleanKeywords(input.keywords))
  const socials = readSocials(input.socials ?? ["youtube", "tiktok"])
  if (!socials.length) throw viralSays("Tick at least one social.")
  if (keywords.length && !socials.some(socialHasKeywords)) {
    throw viralSays("Keywords are searched on YouTube, so tick YouTube to add them.")
  }
  if (input.folderId) await requireOwnedViralFolder(ownerId, input.folderId)

  const at = now()
  const id = uuid()
  await db.transaction(async (tx) => {
    await tx.insert(viralProjects).values({
      id,
      ownerId,
      folderId: input.folderId,
      name,
      description: cleanDescription(input.description),
      topic: cleanTopic(input.topic ?? ""),
      socials,
      createdAt: at,
      updatedAt: at,
    })
    if (keywords.length) {
      await tx.insert(viralProjectKeywords).values(
        keywords.map((keyword, position) => ({
          id: uuid(),
          projectId: id,
          keyword,
          position,
          createdAt: at,
        }))
      )
    }
  })
  return getViralProjectItem(ownerId, id)
}

export type ViralProjectSettings = {
  name: string
  description: string
  /** Left out, the topic stays as it is. */
  topic?: string
  days: ViralDays
  minViews: number
  minScore: number
  videoLength: ViralVideoLength
  spendLimitCents: number | null
}

/**
 * The project's own settings. Keywords are changed one at a time, because
 * adding one searches it (see `addViralKeyword`).
 */
export async function saveViralProjectSettings(
  ownerId: string,
  projectId: string,
  settings: ViralProjectSettings
): Promise<ViralProjectItem> {
  const before = await requireOwnedViralProject(ownerId, projectId)
  if (!(VIRAL_DAY_CHOICES as readonly number[]).includes(settings.days)) {
    throw viralSays("Pick 7, 30 or 90 days.")
  }
  await db
    .update(viralProjects)
    .set({
      name: cleanName(settings.name),
      description: cleanDescription(settings.description),
      ...(settings.topic === undefined ? {} : { topic: cleanTopic(settings.topic) }),
      days: settings.days,
      minViews: Math.max(0, Math.round(settings.minViews)),
      minScore: Math.min(100, Math.max(0, Math.round(settings.minScore))),
      videoLength: settings.videoLength,
      spendLimitCents: settings.spendLimitCents,
      updatedAt: now(),
    })
    .where(eq(viralProjects.id, projectId))
  // How well a title fits was judged against the old description, so a new
  // one clears those numbers; the next search asks again.
  if (cleanDescription(settings.description) !== before.description) {
    await db
      .update(viralProjectResults)
      .set({ topicMatch: null })
      .where(eq(viralProjectResults.projectId, projectId))
  }
  return getViralProjectItem(ownerId, projectId)
}

/** A keyword added to an existing project, at the end of its list. */
export async function addViralKeyword(
  ownerId: string,
  projectId: string,
  value: string
): Promise<string> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (!readSocials(project.socials).some(socialHasKeywords)) {
    throw viralSays("Keywords are searched on YouTube. Add YouTube to this project first.")
  }
  const keyword = sayKeywords(() => cleanKeyword(value))
  const existing = await db
    .select({ position: viralProjectKeywords.position })
    .from(viralProjectKeywords)
    .where(eq(viralProjectKeywords.projectId, projectId))
  if (existing.length >= VIRAL_KEYWORDS_MAX) {
    throw viralSays(`A project can have at most ${VIRAL_KEYWORDS_MAX} keywords.`)
  }

  const id = uuid()
  try {
    await db.insert(viralProjectKeywords).values({
      id,
      projectId,
      keyword,
      position: Math.max(-1, ...existing.map((row) => row.position)) + 1,
      createdAt: now(),
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw viralSays(`"${keyword}" is already one of this project's keywords.`)
    }
    throw error
  }
  await touchProject(projectId)
  return id
}

/**
 * Takes a keyword off its project. Its results go with it through the
 * foreign key, so a video only it found leaves the grid and a video another
 * keyword also found stays.
 */
export async function removeViralKeyword(
  ownerId: string,
  keywordId: string
): Promise<void> {
  const keyword = await requireOwnedKeyword(ownerId, keywordId)
  await db
    .delete(viralProjectKeywords)
    .where(eq(viralProjectKeywords.id, keyword.id))
  await touchProject(keyword.projectId)
}

export async function requireOwnedKeyword(ownerId: string, keywordId: string) {
  const [row] = await db
    .select({
      id: viralProjectKeywords.id,
      projectId: viralProjectKeywords.projectId,
      keyword: viralProjectKeywords.keyword,
    })
    .from(viralProjectKeywords)
    .innerJoin(
      viralProjects,
      eq(viralProjects.id, viralProjectKeywords.projectId)
    )
    .where(
      and(
        eq(viralProjectKeywords.id, keywordId),
        eq(viralProjects.ownerId, ownerId)
      )
    )
  if (!row) throw viralSays("That keyword is no longer on the project.")
  return row
}

export async function touchProject(projectId: string) {
  await db
    .update(viralProjects)
    .set({ updatedAt: now() })
    .where(eq(viralProjects.id, projectId))
}

export async function pinViralProject(
  ownerId: string,
  projectId: string,
  pinned: boolean
) {
  await requireOwnedViralProject(ownerId, projectId)
  await db
    .update(viralProjects)
    .set({ pinnedAt: pinned ? now() : null })
    .where(eq(viralProjects.id, projectId))
}

/** Archiving takes a project off the list and drops its pin; nothing is lost. */
export async function archiveViralProjects(
  ownerId: string,
  projectIds: string[],
  archived: boolean
): Promise<string[]> {
  if (!projectIds.length) return []
  const done = await db
    .update(viralProjects)
    .set(
      archived
        ? { archivedAt: now(), pinnedAt: null }
        : { archivedAt: null }
    )
    .where(
      and(
        eq(viralProjects.ownerId, ownerId),
        inArray(viralProjects.id, projectIds),
        archived
          ? isNull(viralProjects.archivedAt)
          : isNotNull(viralProjects.archivedAt)
      )
    )
    .returning({ id: viralProjects.id })
  return done.map((row) => row.id)
}

/**
 * A copy to start a nearby niche: the name with " copy", the description,
 * the keywords, the filters, the spend limit and the hidden channels. Not
 * the results, so the copy has searched nothing until Search is pressed.
 */
export async function duplicateViralProject(
  ownerId: string,
  projectId: string
): Promise<ViralProjectItem> {
  const source = await requireOwnedViralProject(ownerId, projectId)
  const [keywords, hidden] = await Promise.all([
    db
      .select()
      .from(viralProjectKeywords)
      .where(eq(viralProjectKeywords.projectId, projectId)),
    db
      .select()
      .from(viralProjectHiddenChannels)
      .where(eq(viralProjectHiddenChannels.projectId, projectId)),
  ])
  const at = now()
  const id = uuid()
  await db.transaction(async (tx) => {
    await tx.insert(viralProjects).values({
      id,
      ownerId,
      folderId: source.folderId,
      name: `${source.name} copy`.slice(0, VIRAL_PROJECT_NAME_MAX),
      description: source.description,
      topic: source.topic,
      socials: source.socials,
      pausedSocials: source.pausedSocials,
      days: source.days,
      minViews: source.minViews,
      minScore: source.minScore,
      videoLength: source.videoLength,
      spendLimitCents: source.spendLimitCents,
      isSample: source.isSample,
      createdAt: at,
      updatedAt: at,
    })
    if (keywords.length) {
      await tx.insert(viralProjectKeywords).values(
        keywords.map((keyword) => ({
          id: uuid(),
          projectId: id,
          keyword: keyword.keyword,
          position: keyword.position,
          createdAt: at,
        }))
      )
    }
    if (hidden.length) {
      await tx.insert(viralProjectHiddenChannels).values(
        hidden.map((channel) => ({ ...channel, projectId: id, createdAt: at }))
      )
    }
  })
  return getViralProjectItem(ownerId, id)
}

export type ViralDeleteSummary = {
  videos: number
  hidden_channels: number
  creators: number
  /** Ideas in the project's vault. They go with the project. */
  vault_items: number
}

/**
 * What the delete window says: what goes (the results, the hidden channels,
 * the creator links, the vault) and what stays (followed creators). Counted
 * from the database when it opens.
 */
export async function viralDeleteSummary(
  ownerId: string,
  projectIds: string[]
): Promise<ViralDeleteSummary> {
  const owned = await ownedIds(ownerId, projectIds)
  if (!owned.length) {
    return { videos: 0, hidden_channels: 0, creators: 0, vault_items: 0 }
  }
  const [videos, hidden, creators, vault] = await Promise.all([
    db
      .select({ total: countDistinct(viralProjectResults.platformVideoId) })
      .from(viralProjectResults)
      .where(inArray(viralProjectResults.projectId, owned)),
    db
      .select({ total: count() })
      .from(viralProjectHiddenChannels)
      .where(inArray(viralProjectHiddenChannels.projectId, owned)),
    db
      .select({ total: countDistinct(viralProjectCreators.creatorId) })
      .from(viralProjectCreators)
      .where(inArray(viralProjectCreators.projectId, owned)),
    db
      .select({ total: count() })
      .from(viralVaultItems)
      .where(inArray(viralVaultItems.projectId, owned)),
  ])
  return {
    videos: videos[0]?.total ?? 0,
    hidden_channels: hidden[0]?.total ?? 0,
    creators: creators[0]?.total ?? 0,
    vault_items: vault[0]?.total ?? 0,
  }
}

/**
 * Deletes projects. Their keywords, results, hidden channels, creator links
 * and vault items go through the foreign keys, and their saved views are
 * deleted here. A vault item's file and cover are then deleted once nothing
 * else uses them, the same as deleting the item. A creator left in no project
 * at all is unfollowed too, so the watch timer stops checking somebody nobody
 * is looking at.
 */
export async function deleteViralProjects(
  ownerId: string,
  projectIds: string[]
): Promise<string[]> {
  const owned = await ownedIds(ownerId, projectIds)
  if (!owned.length) return []
  const [linked, vaultFiles] = await Promise.all([
    db
      .select({ creatorId: viralProjectCreators.creatorId })
      .from(viralProjectCreators)
      .where(inArray(viralProjectCreators.projectId, owned)),
    db
      .select({ mediaId: viralVaultItems.mediaId, thumbnailStoragePath: viralVaultItems.thumbnailStoragePath })
      .from(viralVaultItems)
      .where(inArray(viralVaultItems.projectId, owned)),
  ])
  await db
    .delete(viralProjects)
    .where(inArray(viralProjects.id, owned))
  // Imported here: the vault reads projects, so a top-level import would loop.
  const { discardVaultFiles } = await import("@/server/viral/vault")
  await discardVaultFiles(ownerId, vaultFiles)
  // The shell's saved views can't cascade from a project, so they go here.
  await deleteSavedViewsFor({
    screens: owned.map((id) => savedViewScreen(VIRAL_SAVED_VIEW_KIND, id)),
  })
  await dropUnlinkedCreators(
    ownerId,
    linked.map((row) => row.creatorId)
  )
  return owned
}

/**
 * Unfollows the creators in the list that no project links to any more. The
 * caller deletes their avatars from storage; see `deleteCreator`.
 */
export async function dropUnlinkedCreators(ownerId: string, creatorIds: string[]) {
  if (!creatorIds.length) return
  const { deleteCreator } = await import("@/server/viral/creators/creators")
  const stillLinked = await db
    .select({ creatorId: viralProjectCreators.creatorId })
    .from(viralProjectCreators)
    .where(inArray(viralProjectCreators.creatorId, creatorIds))
  const keep = new Set(stillLinked.map((row) => row.creatorId))
  const owned = await db
    .select({ id: viralCreators.id })
    .from(viralCreators)
    .where(
      and(
        eq(viralCreators.ownerId, ownerId),
        inArray(viralCreators.id, creatorIds)
      )
    )
  for (const creator of owned) {
    if (!keep.has(creator.id)) await deleteCreator(ownerId, creator.id)
  }
}

async function ownedIds(ownerId: string, projectIds: string[]) {
  if (!projectIds.length) return []
  const rows = await db
    .select({ id: viralProjects.id })
    .from(viralProjects)
    .where(
      and(
        eq(viralProjects.ownerId, ownerId),
        inArray(viralProjects.id, projectIds)
      )
    )
  return rows.map((row) => row.id)
}

// ------------------------------------------------------------ Hidden -----

export async function hideViralChannels(
  ownerId: string,
  projectId: string,
  channels: { platform: string; channelId: string; channelName: string }[]
) {
  await requireOwnedViralProject(ownerId, projectId)
  if (!channels.length) return
  const at = now()
  await db
    .insert(viralProjectHiddenChannels)
    .values(channels.map((channel) => ({ ...channel, projectId, createdAt: at })))
    .onConflictDoNothing()
}

export async function unhideViralChannel(
  ownerId: string,
  projectId: string,
  channel: { platform: string; channelId: string }
) {
  await requireOwnedViralProject(ownerId, projectId)
  await db
    .delete(viralProjectHiddenChannels)
    .where(
      and(
        eq(viralProjectHiddenChannels.projectId, projectId),
        eq(viralProjectHiddenChannels.platform, channel.platform),
        eq(viralProjectHiddenChannels.channelId, channel.channelId)
      )
    )
}

// ------------------------------------------------------------ Folders ----

export type ViralFolderSummary = {
  id: string
  name: string
  project_count: number
}

export async function listViralFolders(
  ownerId: string
): Promise<ViralFolderSummary[]> {
  const rows = await db
    .select({
      id: viralProjectFolders.id,
      name: viralProjectFolders.name,
      projects: count(viralProjects.id),
    })
    .from(viralProjectFolders)
    .leftJoin(
      viralProjects,
      eq(viralProjects.folderId, viralProjectFolders.id)
    )
    .where(eq(viralProjectFolders.ownerId, ownerId))
    .groupBy(viralProjectFolders.id)
    .orderBy(sql`lower(${viralProjectFolders.name})`)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    project_count: row.projects,
  }))
}

export async function requireOwnedViralFolder(ownerId: string, folderId: string) {
  const [row] = await db
    .select({ id: viralProjectFolders.id })
    .from(viralProjectFolders)
    .where(
      and(
        eq(viralProjectFolders.id, folderId),
        eq(viralProjectFolders.ownerId, ownerId)
      )
    )
  if (!row) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return row
}

/** Folder names follow the same rules as Video's, copied with the rest. */
async function namedFolderWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(FOLDER_NAME_TAKEN_MESSAGE)
    throw error
  }
}

export async function createViralFolder(ownerId: string, value: string) {
  const name = cleanFolderName(value)
  const at = now()
  const row = { id: uuid(), ownerId, name, createdAt: at, updatedAt: at }
  await namedFolderWrite(() => db.insert(viralProjectFolders).values(row))
  return { id: row.id, name, project_count: 0 }
}

export async function renameViralFolder(
  ownerId: string,
  folderId: string,
  value: string
) {
  const name = cleanFolderName(value)
  const renamed = await namedFolderWrite(() =>
    db
      .update(viralProjectFolders)
      .set({ name, updatedAt: now() })
      .where(
        and(
          eq(viralProjectFolders.id, folderId),
          eq(viralProjectFolders.ownerId, ownerId)
        )
      )
      .returning({ id: viralProjectFolders.id })
  )
  if (!renamed.length) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return { id: folderId, name }
}

/** Deletes only the folder; its projects stay, in no folder. */
export async function deleteViralFolder(ownerId: string, folderId: string) {
  await requireOwnedViralFolder(ownerId, folderId)
  const [held] = await db
    .select({ total: count() })
    .from(viralProjects)
    .where(eq(viralProjects.folderId, folderId))
  await db
    .delete(viralProjectFolders)
    .where(eq(viralProjectFolders.id, folderId))
  return { loose_count: held?.total ?? 0 }
}

/**
 * Puts projects into one folder, or into none when `folderId` is null. Says
 * which moved, which were there already and which are not this person's.
 */
export async function moveViralProjectsToFolder(
  ownerId: string,
  projectIds: string[],
  folderId: string | null
) {
  const wanted = [...new Set(projectIds)]
  if (folderId) await requireOwnedViralFolder(ownerId, folderId)
  const owned = wanted.length
    ? await db
        .select({ id: viralProjects.id, folderId: viralProjects.folderId })
        .from(viralProjects)
        .where(
          and(
            eq(viralProjects.ownerId, ownerId),
            inArray(viralProjects.id, wanted)
          )
        )
    : []
  const moving = owned.filter((row) => row.folderId !== folderId).map((row) => row.id)
  if (moving.length) {
    await db
      .update(viralProjects)
      .set({ folderId })
      .where(inArray(viralProjects.id, moving))
  }
  const ownedIdSet = new Set(owned.map((row) => row.id))
  return {
    moved_ids: moving,
    unchanged_ids: owned.filter((row) => row.folderId === folderId).map((row) => row.id),
    skipped_ids: wanted.filter((id) => !ownedIdSet.has(id)),
  }
}

// ------------------------------------------------------------ Sample -----

/**
 * Something to look at with no YouTube key: a made-up niche with made-up
 * results, written straight into the tables. Nothing outside the app is
 * asked, and the screen says it is a sample. Searching it is refused.
 */
export async function createSampleViralProject(
  ownerId: string
): Promise<ViralProjectItem> {
  const at = now()
  const projectId = uuid()
  const keywords = ["desk stretches", "office workout", "posture fix"]
  const keywordIds = keywords.map(() => uuid())
  const channels = [
    { id: "sample-channel-1", name: "Desk Fit Daily", subscribers: 48_000 },
    { id: "sample-channel-2", name: "Posture Lab", subscribers: 310_000 },
    { id: "sample-channel-3", name: "Five Minute Moves", subscribers: 9_200 },
    { id: "sample-channel-4", name: "Office Yoga Club", subscribers: 1_250_000 },
  ]
  const titles = [
    "The 30 second stretch that fixed my back",
    "Do this every hour at your desk",
    "Why your neck hurts after work",
    "3 moves for people who sit all day",
    "Stop slouching with this one trick",
    "The office workout nobody notices",
    "My posture before and after 30 days",
    "Tight hips? Try this at your desk",
    "Wrist pain from typing, fixed",
    "A 2 minute reset between meetings",
    "Standing desk mistakes everyone makes",
    "The chair stretch physios love",
  ]
  const DAY = 24 * 60 * 60 * 1000
  const results = titles.map((title, index) => {
    const channel = channels[index % channels.length]
    const views = Math.round(2_400_000 / (index + 1.5))
    return {
      id: uuid(),
      keywordId: keywordIds[index % keywordIds.length],
      projectId,
      platform: "youtube",
      platformVideoId: `sample-${index + 1}`,
      url: `https://www.youtube.com/shorts/sample-${index + 1}`,
      title,
      channelId: channel.id,
      channelName: channel.name,
      subscribers: channel.subscribers,
      views,
      likes: Math.round(views / 18),
      comments: Math.round(views / 400),
      postedAt: new Date(at.getTime() - (index + 1) * 2 * DAY),
      durationSeconds: 15 + ((index * 7) % 45),
      thumbnailUrl: null,
      isNew: index % 5 === 0,
      topicMatch: 95 - index * 6,
      foundAt: at,
    }
  })

  const analysisId = uuid()
  const breakdown = {
    transcript: [
      { startMs: 0, endMs: 2_500, text: "Your back hurts because of this one habit" },
      { startMs: 2_500, endMs: 9_000, text: "Sitting still for hours locks your hips" },
      { startMs: 9_000, endMs: 24_000, text: "Stand, reach up, and twist slowly, ten each side" },
      { startMs: 24_000, endMs: 28_000, text: "Follow for a stretch every day" },
    ],
    segments: [
      { role: "hook" as const, startMs: 0, endMs: 2_500, summary: "Names a pain the viewer has right now." },
      { role: "problem" as const, startMs: 2_500, endMs: 9_000, summary: "Says why it happens, in one line." },
      { role: "solution" as const, startMs: 9_000, endMs: 24_000, summary: "Shows the stretch, start to finish." },
      { role: "cta" as const, startMs: 24_000, endMs: 28_000, summary: "Asks for a follow with a promise." },
    ],
    scenes: [
      { startMs: 0, endMs: 9_000 },
      { startMs: 9_000, endMs: 28_000 },
    ],
  }
  const pieces: AnalysisPieces = {
    whyItWorks: {
      hook: "It names a pain the viewer feels while watching, so they stop to hear the fix.",
      parts: breakdown.segments.map((segment) => ({ role: segment.role, summary: segment.summary })),
      whySpread: "The fix is short enough to try on the spot, and people send it to a coworker.",
    },
    script: [
      { role: "hook", seconds: 3, words: "Your dinner is late because of this one habit." },
      { role: "problem", seconds: 6, words: "Cooking every night from scratch eats an hour you don't have." },
      { role: "solution", seconds: 15, words: "Sunday: cook three proteins, two grains, one sauce. Box them. Done in 40 minutes." },
      { role: "cta", seconds: 4, words: "Follow for a dad-sized meal plan every week." },
    ],
    ideas: [
      { idea: "Three lunches from one tray of chicken.", hook: "One tray, three lunches, zero thinking." },
      { idea: "The fridge layout that stops food going off.", hook: "You're throwing away money on Thursdays." },
      { idea: "Meal prep for the kids in 15 minutes.", hook: "My kids eat this and don't know it's healthy." },
    ],
    title: { title: "The Sunday habit that saves dinner", caption: "40 minutes on Sunday, dinner sorted all week.", hashtags: ["#mealprep", "#dadlife", "#sample"] },
  }
  const stats = (index: number) => ({
    views: results[index].views,
    likes: results[index].likes,
    comments: results[index].comments,
    subscribers: results[index].subscribers,
    durationSeconds: results[index].durationSeconds,
    postedAt: results[index].postedAt.toISOString(),
    score: null,
    outlier: null,
  })

  await db.transaction(async (tx) => {
    await tx.insert(viralProjects).values({
      id: projectId,
      ownerId,
      name: "Sample: desk workouts",
      description:
        "A made-up niche to try the screen with: short workouts and stretches for people who sit at a desk all day.",
      topic: "a meal-prep course for busy dads",
      socials: ["youtube"],
      // Its made-up videos have no thumbnails, so the banner gets a photo of its own.
      coverUrl: SAMPLE_COVER_URL,
      coverChosen: true,
      isSample: true,
      createdAt: at,
      updatedAt: at,
    })
    await tx.insert(viralProjectKeywords).values(
      keywords.map((keyword, position) => ({
        id: keywordIds[position],
        projectId,
        keyword,
        position,
        status: "done",
        ranAt: at,
        createdAt: at,
      }))
    )
    await tx.insert(viralProjectResults).values(results)
    // One broken-down video with its analysis, and two ideas in the vault, so
    // every panel has something in it. Nothing here was asked of an AI. A
    // sample added again, or after deleting one, finds the made-up saved
    // video already there (deleting a project keeps saved videos), so that
    // row is taken over rather than written twice.
    const [saved] = await tx.insert(viralVideos).values({
      id: uuid(),
      ownerId,
      platform: "youtube",
      platformVideoId: results[0].platformVideoId,
      sourceUrl: results[0].url,
      status: "ready",
      wantsAnalysis: true,
      title: results[0].title,
      channelName: results[0].channelName,
      channelId: results[0].channelId,
      subscribers: results[0].subscribers,
      durationSeconds: 28,
      views: results[0].views,
      likes: results[0].likes,
      comments: results[0].comments,
      postedAt: results[0].postedAt,
      breakdown,
      viralProjectId: projectId,
      createdAt: at,
      updatedAt: at,
    }).onConflictDoUpdate({
      target: [viralVideos.ownerId, viralVideos.platform, viralVideos.platformVideoId],
      set: { viralProjectId: projectId, updatedAt: at },
    }).returning({ id: viralVideos.id })
    const savedId = saved.id
    await tx.insert(viralAnalyses).values({
      id: analysisId,
      ownerId,
      savedVideoId: savedId,
      projectId,
      topic: "a meal-prep course for busy dads",
      pieces,
      notes: "A sample analysis. Press Analyse with AI on your own project's videos to write real ones.",
      createdAt: at,
      updatedAt: at,
    })
    await tx.insert(viralVaultItems).values([
      {
        id: uuid(),
        ownerId,
        projectId,
        savedVideoId: savedId,
        platform: "youtube",
        platformVideoId: results[0].platformVideoId,
        sourceUrl: results[0].url,
        title: results[0].title,
        channelName: results[0].channelName,
        stats: stats(0),
        analysisTopic: "a meal-prep course for busy dads",
        analysis: pieces,
        notes: "Film this one first: the hook fits dads perfectly.",
        status: "scripted",
        createdAt: at,
        updatedAt: at,
      },
      {
        id: uuid(),
        ownerId,
        projectId,
        platform: "youtube",
        platformVideoId: results[1].platformVideoId,
        sourceUrl: results[1].url,
        title: results[1].title,
        channelName: results[1].channelName,
        stats: stats(1),
        notes: "Good pacing. Analyse it later.",
        status: "idea",
        createdAt: new Date(at.getTime() - 1_000),
        updatedAt: at,
      },
    ])
  })
  return getViralProjectItem(ownerId, projectId)
}

/**
 * Gives a new account the sample project once: the first time its Projects
 * list opens. Deleting the sample never brings it back, because the marker
 * stays. Answers whether one was made.
 */
export async function ensureSampleViralProject(ownerId: string): Promise<boolean> {
  const [claimed] = await db
    .insert(viralSampleMade)
    .values({ ownerId, madeAt: now() })
    .onConflictDoNothing()
    .returning({ ownerId: viralSampleMade.ownerId })
  if (!claimed) return false
  // Somebody who already made projects before this existed doesn't need one.
  const [any] = await db.select({ id: viralProjects.id }).from(viralProjects).where(eq(viralProjects.ownerId, ownerId)).limit(1)
  if (any) return false
  await createSampleViralProject(ownerId)
  return true
}

// ---------------------------------------------------------------------------
// Socials as modules (`workspace/docs/projects-and-socials.md`), copied from
// Promo's networks: added from "+ Add social", paused, or taken off.

function plural(count: number, one: string) {
  return `${count} ${one}${count === 1 ? "" : "s"}`
}

/** Adds a social at the end of the project's list. Refuses one already there. */
export async function addViralSocial(ownerId: string, projectId: string, social: Social): Promise<ViralProjectItem> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  const socials = readSocials(project.socials)
  if (socials.includes(social)) throw viralSays(`This project already uses ${SOCIAL_NAMES[social]}.`)
  await db
    .update(viralProjects)
    .set({ socials: [...socials, social], updatedAt: now() })
    .where(eq(viralProjects.id, projectId))
  return getViralProjectItem(ownerId, projectId)
}

/**
 * Takes a social off the project. Refused while it still holds keywords or
 * followed creators, and the refusal says how many of each, so nothing is
 * thrown away by a stray click.
 */
export async function removeViralSocial(ownerId: string, projectId: string, social: Social): Promise<ViralProjectItem> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  const socials = readSocials(project.socials)
  if (!socials.includes(social)) return getViralProjectItem(ownerId, projectId)
  const [keywords, creators] = await Promise.all([
    socialHasKeywords(social)
      ? db.select({ total: count() }).from(viralProjectKeywords).where(eq(viralProjectKeywords.projectId, projectId))
      : Promise.resolve([{ total: 0 }]),
    db
      .select({ total: count() })
      .from(viralProjectCreators)
      .innerJoin(viralCreators, eq(viralCreators.id, viralProjectCreators.creatorId))
      .where(and(eq(viralProjectCreators.projectId, projectId), eq(viralCreators.platform, social))),
  ])
  const held = [
    keywords[0]?.total ? plural(keywords[0].total, "keyword") : null,
    creators[0]?.total ? plural(creators[0].total, "creator") : null,
  ].filter(Boolean)
  if (held.length) {
    throw viralSays(
      `${SOCIAL_NAMES[social]} still has ${held.join(" and ")} in this project. Remove them first, then take ${SOCIAL_NAMES[social]} off.`
    )
  }
  await db
    .update(viralProjects)
    .set({
      socials: socials.filter((one) => one !== social),
      pausedSocials: readSocials(project.pausedSocials).filter((one) => one !== social),
      updatedAt: now(),
    })
    .where(eq(viralProjects.id, projectId))
  return getViralProjectItem(ownerId, projectId)
}

/** Pauses or resumes a social on one project: its daily re-checks skip it while paused. */
export async function setViralSocialPaused(
  ownerId: string,
  projectId: string,
  social: Social,
  paused: boolean
): Promise<ViralProjectItem> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (!readSocials(project.socials).includes(social)) {
    throw viralSays(`This project doesn't use ${SOCIAL_NAMES[social]}.`)
  }
  const current = readSocials(project.pausedSocials).filter((one) => one !== social)
  await db
    .update(viralProjects)
    .set({ pausedSocials: paused ? [...current, social] : current, updatedAt: now() })
    .where(eq(viralProjects.id, projectId))
  return getViralProjectItem(ownerId, projectId)
}

/**
 * The project's notes, saved as they are typed. Kept as the cleaned editor
 * document, holding only what the shell's written-page rules allow, or ""
 * when nothing is written.
 */
export async function saveViralProjectNotes(ownerId: string, projectId: string, notes: string): Promise<void> {
  await requireOwnedViralProject(ownerId, projectId)
  await db.update(viralProjects).set({ notes: storedNotes(notes), updatedAt: now() }).where(eq(viralProjects.id, projectId))
}

/** The sample project's cover: a stretch at sunset, from Unsplash. */
export const SAMPLE_COVER_URL = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1200&q=80"

/**
 * The cover picked in the project's ⋮. A picked cover stays through searches;
 * taking it away hands the banner back to the best result's thumbnail, from
 * the next search on.
 */
export async function saveViralProjectCover(ownerId: string, projectId: string, url: string | null): Promise<ViralProjectItem> {
  await requireOwnedViralProject(ownerId, projectId)
  await db
    .update(viralProjects)
    .set({ coverUrl: url, coverChosen: url !== null, updatedAt: now() })
    .where(eq(viralProjects.id, projectId))
  return getViralProjectItem(ownerId, projectId)
}

/** The topic every analysis writes for, changed on the left panel's project card. */
export async function saveViralProjectTopic(ownerId: string, projectId: string, topic: string): Promise<ViralProjectItem> {
  await requireOwnedViralProject(ownerId, projectId)
  await db.update(viralProjects).set({ topic: cleanTopic(topic), updatedAt: now() }).where(eq(viralProjects.id, projectId))
  return getViralProjectItem(ownerId, projectId)
}
