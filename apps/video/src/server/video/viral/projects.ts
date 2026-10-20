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
} from "@/lib/video/viral"
import {
  cleanFolderName,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
} from "@/lib/video/project-folders"
import { savedViewScreen } from "@/lib/saved-views"
import { VIRAL_SAVED_VIEW_KIND } from "@/lib/video/viral-saved-views"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  videoCreators,
  videoProjects,
  videoViralCollectionItems,
  videoViralProjectCreators,
  videoViralProjectFolders,
  videoViralProjectHiddenChannels,
  videoViralProjectKeywords,
  videoViralProjectResults,
  videoViralProjects,
  type VideoViralProjectRow,
} from "@/server/video/schema"
import { deleteSavedViewsFor } from "@/server/saved-views"
import { isUniqueViolation } from "@/server/video/unique-violation"

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
): Promise<VideoViralProjectRow> {
  const [row] = await db
    .select()
    .from(videoViralProjects)
    .where(
      and(
        eq(videoViralProjects.id, projectId),
        eq(videoViralProjects.ownerId, ownerId)
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
    eq(videoViralProjects.ownerId, ownerId),
    filter.archived
      ? isNotNull(videoViralProjects.archivedAt)
      : isNull(videoViralProjects.archivedAt),
  ]
  if (filter.folderId === null) conditions.push(isNull(videoViralProjects.folderId))
  else if (filter.folderId) {
    conditions.push(eq(videoViralProjects.folderId, filter.folderId))
  }
  const search = filter.search?.trim()
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (match) => `\\${match}`)}%`
    conditions.push(
      or(
        ilike(videoViralProjects.name, pattern),
        ilike(videoViralProjects.description, pattern)
      )!
    )
  }

  const rows = await db
    .select()
    .from(videoViralProjects)
    .where(and(...conditions))
    .orderBy(desc(videoViralProjects.updatedAt))
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
  rows: VideoViralProjectRow[]
): Promise<ViralProjectItem[]> {
  if (!rows.length) return []
  const ids = rows.map((row) => row.id)
  const [keywordRows, counts] = await Promise.all([
    db
      .select({
        projectId: videoViralProjectKeywords.projectId,
        keyword: videoViralProjectKeywords.keyword,
        status: videoViralProjectKeywords.status,
      })
      .from(videoViralProjectKeywords)
      .where(inArray(videoViralProjectKeywords.projectId, ids))
      .orderBy(
        asc(videoViralProjectKeywords.position),
        asc(videoViralProjectKeywords.createdAt)
      ),
    db
      .select({
        projectId: videoViralProjectResults.projectId,
        videos: countDistinct(videoViralProjectResults.platformVideoId),
      })
      .from(videoViralProjectResults)
      .where(inArray(videoViralProjectResults.projectId, ids))
      .groupBy(videoViralProjectResults.projectId),
  ])
  const videoCounts = new Map(counts.map((row) => [row.projectId, row.videos]))

  return rows.map((row) => {
    const keywords = keywordRows.filter((one) => one.projectId === row.id)
    return {
      id: row.id,
      name: row.name,
      description: row.description,
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
  keywords: string[]
  folderId: string | null
}

/**
 * A new project with its keywords. Nothing is searched yet: the screen it
 * opens on has the Search button, so creating a project never spends.
 */
export async function createViralProject(
  ownerId: string,
  input: NewViralProject
): Promise<ViralProjectItem> {
  const name = cleanName(input.name)
  const keywords = sayKeywords(() => cleanKeywords(input.keywords))
  if (!keywords.length) throw viralSays("Add at least one keyword.")
  if (input.folderId) await requireOwnedViralFolder(ownerId, input.folderId)

  const at = now()
  const id = uuid()
  await db.transaction(async (tx) => {
    await tx.insert(videoViralProjects).values({
      id,
      ownerId,
      folderId: input.folderId,
      name,
      description: cleanDescription(input.description),
      createdAt: at,
      updatedAt: at,
    })
    await tx.insert(videoViralProjectKeywords).values(
      keywords.map((keyword, position) => ({
        id: uuid(),
        projectId: id,
        keyword,
        position,
        createdAt: at,
      }))
    )
  })
  return getViralProjectItem(ownerId, id)
}

export type ViralProjectSettings = {
  name: string
  description: string
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
    .update(videoViralProjects)
    .set({
      name: cleanName(settings.name),
      description: cleanDescription(settings.description),
      days: settings.days,
      minViews: Math.max(0, Math.round(settings.minViews)),
      minScore: Math.min(100, Math.max(0, Math.round(settings.minScore))),
      videoLength: settings.videoLength,
      spendLimitCents: settings.spendLimitCents,
      updatedAt: now(),
    })
    .where(eq(videoViralProjects.id, projectId))
  // How well a title fits was judged against the old description, so a new
  // one clears those numbers; the next search asks again.
  if (cleanDescription(settings.description) !== before.description) {
    await db
      .update(videoViralProjectResults)
      .set({ topicMatch: null })
      .where(eq(videoViralProjectResults.projectId, projectId))
  }
  return getViralProjectItem(ownerId, projectId)
}

/** A keyword added to an existing project, at the end of its list. */
export async function addViralKeyword(
  ownerId: string,
  projectId: string,
  value: string
): Promise<string> {
  await requireOwnedViralProject(ownerId, projectId)
  const keyword = sayKeywords(() => cleanKeyword(value))
  const existing = await db
    .select({ position: videoViralProjectKeywords.position })
    .from(videoViralProjectKeywords)
    .where(eq(videoViralProjectKeywords.projectId, projectId))
  if (existing.length >= VIRAL_KEYWORDS_MAX) {
    throw viralSays(`A project can have at most ${VIRAL_KEYWORDS_MAX} keywords.`)
  }

  const id = uuid()
  try {
    await db.insert(videoViralProjectKeywords).values({
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
    .delete(videoViralProjectKeywords)
    .where(eq(videoViralProjectKeywords.id, keyword.id))
  await touchProject(keyword.projectId)
}

export async function requireOwnedKeyword(ownerId: string, keywordId: string) {
  const [row] = await db
    .select({
      id: videoViralProjectKeywords.id,
      projectId: videoViralProjectKeywords.projectId,
      keyword: videoViralProjectKeywords.keyword,
    })
    .from(videoViralProjectKeywords)
    .innerJoin(
      videoViralProjects,
      eq(videoViralProjects.id, videoViralProjectKeywords.projectId)
    )
    .where(
      and(
        eq(videoViralProjectKeywords.id, keywordId),
        eq(videoViralProjects.ownerId, ownerId)
      )
    )
  if (!row) throw viralSays("That keyword is no longer on the project.")
  return row
}

export async function touchProject(projectId: string) {
  await db
    .update(videoViralProjects)
    .set({ updatedAt: now() })
    .where(eq(videoViralProjects.id, projectId))
}

export async function pinViralProject(
  ownerId: string,
  projectId: string,
  pinned: boolean
) {
  await requireOwnedViralProject(ownerId, projectId)
  await db
    .update(videoViralProjects)
    .set({ pinnedAt: pinned ? now() : null })
    .where(eq(videoViralProjects.id, projectId))
}

/** Archiving takes a project off the list and drops its pin; nothing is lost. */
export async function archiveViralProjects(
  ownerId: string,
  projectIds: string[],
  archived: boolean
): Promise<string[]> {
  if (!projectIds.length) return []
  const done = await db
    .update(videoViralProjects)
    .set(
      archived
        ? { archivedAt: now(), pinnedAt: null }
        : { archivedAt: null }
    )
    .where(
      and(
        eq(videoViralProjects.ownerId, ownerId),
        inArray(videoViralProjects.id, projectIds),
        archived
          ? isNull(videoViralProjects.archivedAt)
          : isNotNull(videoViralProjects.archivedAt)
      )
    )
    .returning({ id: videoViralProjects.id })
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
      .from(videoViralProjectKeywords)
      .where(eq(videoViralProjectKeywords.projectId, projectId)),
    db
      .select()
      .from(videoViralProjectHiddenChannels)
      .where(eq(videoViralProjectHiddenChannels.projectId, projectId)),
  ])
  const at = now()
  const id = uuid()
  await db.transaction(async (tx) => {
    await tx.insert(videoViralProjects).values({
      id,
      ownerId,
      folderId: source.folderId,
      name: `${source.name} copy`.slice(0, VIRAL_PROJECT_NAME_MAX),
      description: source.description,
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
      await tx.insert(videoViralProjectKeywords).values(
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
      await tx.insert(videoViralProjectHiddenChannels).values(
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
  starred: number
  made_projects: number
}

/**
 * What the delete window says: what goes (the results, the hidden channels,
 * the creator links) and what stays (starred videos, followed creators and
 * editor projects made from it). Counted from the database when it opens.
 */
export async function viralDeleteSummary(
  ownerId: string,
  projectIds: string[]
): Promise<ViralDeleteSummary> {
  const owned = await ownedIds(ownerId, projectIds)
  if (!owned.length) {
    return { videos: 0, hidden_channels: 0, creators: 0, starred: 0, made_projects: 0 }
  }
  const [videos, hidden, creators, starred, made] = await Promise.all([
    db
      .select({ total: countDistinct(videoViralProjectResults.platformVideoId) })
      .from(videoViralProjectResults)
      .where(inArray(videoViralProjectResults.projectId, owned)),
    db
      .select({ total: count() })
      .from(videoViralProjectHiddenChannels)
      .where(inArray(videoViralProjectHiddenChannels.projectId, owned)),
    db
      .select({ total: countDistinct(videoViralProjectCreators.creatorId) })
      .from(videoViralProjectCreators)
      .where(inArray(videoViralProjectCreators.projectId, owned)),
    db
      .select({ total: count() })
      .from(videoViralCollectionItems)
      .where(inArray(videoViralCollectionItems.sourceProjectId, owned)),
    db
      .select({ total: count() })
      .from(videoProjects)
      .where(inArray(videoProjects.sourceViralProjectId, owned)),
  ])
  return {
    videos: videos[0]?.total ?? 0,
    hidden_channels: hidden[0]?.total ?? 0,
    creators: creators[0]?.total ?? 0,
    starred: starred[0]?.total ?? 0,
    made_projects: made[0]?.total ?? 0,
  }
}

/**
 * Deletes projects. Their keywords, results, hidden channels and creator
 * links go through the foreign keys, and their saved views are deleted here. A creator left in no project at all is
 * unfollowed too, so the watch timer stops checking somebody nobody is
 * looking at. Starred videos keep their own copy and stay.
 */
export async function deleteViralProjects(
  ownerId: string,
  projectIds: string[]
): Promise<string[]> {
  const owned = await ownedIds(ownerId, projectIds)
  if (!owned.length) return []
  const linked = await db
    .select({ creatorId: videoViralProjectCreators.creatorId })
    .from(videoViralProjectCreators)
    .where(inArray(videoViralProjectCreators.projectId, owned))
  await db
    .delete(videoViralProjects)
    .where(inArray(videoViralProjects.id, owned))
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
  const { deleteCreator } = await import("@/server/video/creators/creators")
  const stillLinked = await db
    .select({ creatorId: videoViralProjectCreators.creatorId })
    .from(videoViralProjectCreators)
    .where(inArray(videoViralProjectCreators.creatorId, creatorIds))
  const keep = new Set(stillLinked.map((row) => row.creatorId))
  const owned = await db
    .select({ id: videoCreators.id })
    .from(videoCreators)
    .where(
      and(
        eq(videoCreators.ownerId, ownerId),
        inArray(videoCreators.id, creatorIds)
      )
    )
  for (const creator of owned) {
    if (!keep.has(creator.id)) await deleteCreator(ownerId, creator.id)
  }
}

async function ownedIds(ownerId: string, projectIds: string[]) {
  if (!projectIds.length) return []
  const rows = await db
    .select({ id: videoViralProjects.id })
    .from(videoViralProjects)
    .where(
      and(
        eq(videoViralProjects.ownerId, ownerId),
        inArray(videoViralProjects.id, projectIds)
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
    .insert(videoViralProjectHiddenChannels)
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
    .delete(videoViralProjectHiddenChannels)
    .where(
      and(
        eq(videoViralProjectHiddenChannels.projectId, projectId),
        eq(videoViralProjectHiddenChannels.platform, channel.platform),
        eq(videoViralProjectHiddenChannels.channelId, channel.channelId)
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
      id: videoViralProjectFolders.id,
      name: videoViralProjectFolders.name,
      projects: count(videoViralProjects.id),
    })
    .from(videoViralProjectFolders)
    .leftJoin(
      videoViralProjects,
      eq(videoViralProjects.folderId, videoViralProjectFolders.id)
    )
    .where(eq(videoViralProjectFolders.ownerId, ownerId))
    .groupBy(videoViralProjectFolders.id)
    .orderBy(sql`lower(${videoViralProjectFolders.name})`)
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    project_count: row.projects,
  }))
}

export async function requireOwnedViralFolder(ownerId: string, folderId: string) {
  const [row] = await db
    .select({ id: videoViralProjectFolders.id })
    .from(videoViralProjectFolders)
    .where(
      and(
        eq(videoViralProjectFolders.id, folderId),
        eq(videoViralProjectFolders.ownerId, ownerId)
      )
    )
  if (!row) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return row
}

/** Folder names follow the editor's rules, so the two dropdowns agree. */
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
  await namedFolderWrite(() => db.insert(videoViralProjectFolders).values(row))
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
      .update(videoViralProjectFolders)
      .set({ name, updatedAt: now() })
      .where(
        and(
          eq(videoViralProjectFolders.id, folderId),
          eq(videoViralProjectFolders.ownerId, ownerId)
        )
      )
      .returning({ id: videoViralProjectFolders.id })
  )
  if (!renamed.length) throw new Error(FOLDER_NOT_FOUND_MESSAGE)
  return { id: folderId, name }
}

/** Deletes only the folder; its projects stay, in no folder. */
export async function deleteViralFolder(ownerId: string, folderId: string) {
  await requireOwnedViralFolder(ownerId, folderId)
  const [held] = await db
    .select({ total: count() })
    .from(videoViralProjects)
    .where(eq(videoViralProjects.folderId, folderId))
  await db
    .delete(videoViralProjectFolders)
    .where(eq(videoViralProjectFolders.id, folderId))
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
        .select({ id: videoViralProjects.id, folderId: videoViralProjects.folderId })
        .from(videoViralProjects)
        .where(
          and(
            eq(videoViralProjects.ownerId, ownerId),
            inArray(videoViralProjects.id, wanted)
          )
        )
    : []
  const moving = owned.filter((row) => row.folderId !== folderId).map((row) => row.id)
  if (moving.length) {
    await db
      .update(videoViralProjects)
      .set({ folderId })
      .where(inArray(videoViralProjects.id, moving))
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

  await db.transaction(async (tx) => {
    await tx.insert(videoViralProjects).values({
      id: projectId,
      ownerId,
      name: "Sample: desk workouts",
      description:
        "A made-up niche to try the screen with: short workouts and stretches for people who sit at a desk all day.",
      isSample: true,
      createdAt: at,
      updatedAt: at,
    })
    await tx.insert(videoViralProjectKeywords).values(
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
    await tx.insert(videoViralProjectResults).values(results)
  })
  return getViralProjectItem(ownerId, projectId)
}
