import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getViralErrorMessage } from "./viral"
import { adminGet, adminPost } from "@/server/guards"
import {
  addViralKeyword,
  archiveViralProjects,
  createSampleViralProject,
  createViralFolder,
  createViralProject,
  deleteViralFolder,
  deleteViralProjects,
  duplicateViralProject,
  hideViralChannels,
  listViralFolders,
  listViralProjects,
  moveViralProjectsToFolder,
  pinViralProject,
  removeViralKeyword,
  renameViralFolder,
  requireOwnedKeyword,
  requireOwnedViralProject,
  saveViralProjectSettings,
  unhideViralChannel,
  viralDeleteSummary,
  type ViralDeleteSummary,
  type ViralFolderSummary,
} from "@/server/video/viral/projects"
import { queueViralSearch } from "@/server/video/viral/project-search"
import { loadViralProjectScreen } from "@/server/video/viral/project-view"
import {
  followByLink,
  followChannel,
  loadChannelUploads,
  unfollowInProject,
} from "@/server/video/viral/project-creators"
import { suggestKeywords } from "@/server/video/viral/keyword-ideas"
import {
  VIRAL_DAY_CHOICES,
  VIRAL_DESCRIPTION_MAX,
  VIRAL_KEYWORD_MAX,
  VIRAL_KEYWORDS_MAX,
  VIRAL_PROJECT_NAME_MAX,
  VIRAL_VIDEO_LENGTHS,
  type ViralProjectItem,
  type ViralProjectScreen,
  type ViralVideo,
} from "@/lib/video/viral"
import { PROJECT_FOLDER_NAME_MAX } from "@/lib/video/project-folders"

/**
 * Viral projects' endpoints. Admin only, like every Viral door: searches
 * spend from the app's one YouTube allowance. The owner always comes from the
 * session, never from the request.
 */

export type { ViralDeleteSummary, ViralFolderSummary }

const id = z.string().min(1).max(36)
const ids = z.array(id).min(1).max(100)
const days = z.union([z.literal(7), z.literal(30), z.literal(90)])

// ------------------------------------------------------------ The list ---

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(200).optional(),
      folderId: id.nullable().optional(),
      archived: z.boolean(),
    })
  )
  .handler(async ({ data, context }) => {
    const [projects, folders] = await Promise.all([
      listViralProjects(context.user.id, data),
      listViralFolders(context.user.id),
    ])
    return { projects, folders }
  })

export function loadViralProjects(input: {
  search?: string
  folderId?: string | null
  archived: boolean
}) {
  return listFn({ data: input })
}

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      name: z.string().max(VIRAL_PROJECT_NAME_MAX),
      description: z.string().max(VIRAL_DESCRIPTION_MAX),
      keywords: z.array(z.string().max(VIRAL_KEYWORD_MAX)).max(VIRAL_KEYWORDS_MAX),
      folderId: id.nullable(),
    })
  )
  .handler(
    async ({ data, context }): Promise<ViralProjectItem> =>
      createViralProject(context.user.id, data)
  )

export function createViralProjectFn(input: {
  name: string
  description: string
  keywords: string[]
  folderId: string | null
}) {
  return createFn({ data: input })
}

const sampleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }) => createSampleViralProject(context.user.id))

export function addSampleViralProject() {
  return sampleFn()
}

const pinFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, pinned: z.boolean() }))
  .handler(async ({ data, context }) => {
    await pinViralProject(context.user.id, data.projectId, data.pinned)
  })

export function pinViralProjectFn(projectId: string, pinned: boolean) {
  return pinFn({ data: { projectId, pinned } })
}

const archiveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectIds: ids, archived: z.boolean() }))
  .handler(async ({ data, context }) => ({
    done_ids: await archiveViralProjects(
      context.user.id,
      data.projectIds,
      data.archived
    ),
  }))

export function archiveViralProjectsFn(projectIds: string[], archived: boolean) {
  return archiveFn({ data: { projectIds, archived } })
}

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }) =>
    duplicateViralProject(context.user.id, data.projectId)
  )

export function duplicateViralProjectFn(projectId: string) {
  return duplicateFn({ data: { projectId } })
}

const deleteSummaryFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectIds: ids }))
  .handler(async ({ data, context }) =>
    viralDeleteSummary(context.user.id, data.projectIds)
  )

export function loadViralDeleteSummary(projectIds: string[]) {
  return deleteSummaryFn({ data: { projectIds } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectIds: ids }))
  .handler(async ({ data, context }) => ({
    deleted_ids: await deleteViralProjects(context.user.id, data.projectIds),
  }))

export function deleteViralProjectsFn(projectIds: string[]) {
  return deleteFn({ data: { projectIds } })
}

// ------------------------------------------------------------ Folders ----

const folderName = z.string().min(1).max(PROJECT_FOLDER_NAME_MAX)

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: folderName }))
  .handler(async ({ data, context }) => createViralFolder(context.user.id, data.name))

const renameFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ folderId: id, name: folderName }))
  .handler(async ({ data, context }) =>
    renameViralFolder(context.user.id, data.folderId, data.name)
  )

const deleteFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(async ({ data, context }) =>
    deleteViralFolder(context.user.id, data.folderId)
  )

const moveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectIds: ids, folderId: id.nullable() }))
  .handler(async ({ data, context }) =>
    moveViralProjectsToFolder(context.user.id, data.projectIds, data.folderId)
  )

/** The four folder doors, in the shape the shared folder menu takes. */
export const viralFolderApi = {
  create: (name: string) => createFolderFn({ data: { name } }),
  rename: (folderId: string, name: string) =>
    renameFolderFn({ data: { folderId, name } }),
  remove: (folderId: string) => deleteFolderFn({ data: { folderId } }),
  move: (projectIds: string[], folderId: string | null) =>
    moveFn({ data: { projectIds, folderId } }),
}

// --------------------------------------------------------- The screen ----

const screenFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(
    async ({ data, context }): Promise<ViralProjectScreen> =>
      loadViralProjectScreen(context.user.id, data.projectId)
  )

/** Everything the project screen draws. Never calls YouTube. */
export function loadViralProject(projectId: string) {
  return screenFn({ data: { projectId } })
}

const settingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      name: z.string().max(VIRAL_PROJECT_NAME_MAX),
      description: z.string().max(VIRAL_DESCRIPTION_MAX),
      days,
      minViews: z.number().int().min(0).max(1_000_000_000),
      minScore: z.number().int().min(0).max(100),
      videoLength: z.enum(VIRAL_VIDEO_LENGTHS),
      spendLimitCents: z.number().int().min(1).max(10_000_000).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    const { projectId, ...settings } = data
    return saveViralProjectSettings(context.user.id, projectId, settings)
  })

export function saveViralProjectSettingsFn(input: {
  projectId: string
  name: string
  description: string
  days: (typeof VIRAL_DAY_CHOICES)[number]
  minViews: number
  minScore: number
  videoLength: (typeof VIRAL_VIDEO_LENGTHS)[number]
  spendLimitCents: number | null
}) {
  return settingsFn({ data: input })
}

const searchFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, keywordIds: z.array(id).max(20).optional() })
  )
  .handler(async ({ data, context }) =>
    queueViralSearch(context.user.id, data.projectId, data.keywordIds)
  )

/**
 * Queues every keyword, or the ones named, for the background search. Refused
 * whole when today's allowance would not cover it.
 */
export function searchViralProject(projectId: string, keywordIds?: string[]) {
  return searchFn({ data: { projectId, keywordIds } })
}

const addKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, keyword: z.string().min(1).max(VIRAL_KEYWORD_MAX) })
  )
  .handler(async ({ data, context }) => {
    const keywordId = await addViralKeyword(
      context.user.id,
      data.projectId,
      data.keyword
    )
    const project = await requireOwnedViralProject(context.user.id, data.projectId)
    // Adding a keyword searches only that keyword. A sample project, or one
    // the allowance cannot cover today, keeps the keyword and says why.
    if (project.isSample) return { keywordId, searchError: null }
    try {
      await queueViralSearch(context.user.id, data.projectId, [keywordId])
      return { keywordId, searchError: null }
    } catch (error) {
      // Worded here, so the browser gets a sentence and never raw text.
      return { keywordId, searchError: getViralErrorMessage(error) }
    }
  })

export function addViralKeywordFn(projectId: string, keyword: string) {
  return addKeywordFn({ data: { projectId, keyword } })
}

const removeKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ keywordId: id }))
  .handler(async ({ data, context }) => {
    await removeViralKeyword(context.user.id, data.keywordId)
  })

export function removeViralKeywordFn(keywordId: string) {
  return removeKeywordFn({ data: { keywordId } })
}

const refreshKeywordFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ keywordId: id }))
  .handler(async ({ data, context }) => {
    const keyword = await requireOwnedKeyword(context.user.id, data.keywordId)
    return queueViralSearch(context.user.id, keyword.projectId, [keyword.id])
  })

/** Searches one keyword again: 102 units, or 204 for both lengths. */
export function refreshViralKeyword(keywordId: string) {
  return refreshKeywordFn({ data: { keywordId } })
}

const ideasFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      description: z.string().max(VIRAL_DESCRIPTION_MAX),
      existing: z.array(z.string().max(VIRAL_KEYWORD_MAX)).max(VIRAL_KEYWORDS_MAX),
      projectId: id.nullable(),
    })
  )
  .handler(async ({ data, context }) => ({
    ideas: await suggestKeywords(context.user.id, data),
  }))

/** About eight keywords the AI reads out of the description. */
export function suggestViralKeywords(input: {
  description: string
  existing: string[]
  projectId: string | null
}) {
  return ideasFn({ data: input })
}

// ------------------------------------------------------- Hidden channels ---

const channel = z.object({
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  channelId: z.string().min(1).max(100),
  channelName: z.string().max(200),
})

const hideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, channels: z.array(channel).min(1).max(100) })
  )
  .handler(async ({ data, context }) => {
    await hideViralChannels(context.user.id, data.projectId, data.channels)
  })

export function hideViralChannelsFn(
  projectId: string,
  channels: { platform: "youtube" | "tiktok" | "instagram"; channelId: string; channelName: string }[]
) {
  return hideFn({ data: { projectId, channels } })
}

const unhideFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, channel: channel.omit({ channelName: true }) })
  )
  .handler(async ({ data, context }) => {
    await unhideViralChannel(context.user.id, data.projectId, data.channel)
  })

export function unhideViralChannelFn(
  projectId: string,
  channel: { platform: "youtube" | "tiktok" | "instagram"; channelId: string }
) {
  return unhideFn({ data: { projectId, channel } })
}

// ----------------------------------------------------------- Creators ----

const uploadsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: id,
      platform: z.enum(["youtube", "tiktok", "instagram"]),
      channelId: z.string().min(1).max(100),
      followedId: id.nullable(),
      subscribers: z.number().int().min(0).nullable(),
    })
  )
  .handler(
    async ({ data, context }): Promise<ViralVideo[]> =>
      loadChannelUploads(context.user.id, data.projectId, data)
  )

/**
 * One channel's newest uploads. Free for a followed creator; 2 YouTube units
 * for anyone else, which is why this is a POST: it spends.
 */
export function loadChannelUploadsFn(input: {
  projectId: string
  platform: "youtube" | "tiktok" | "instagram"
  channelId: string
  followedId: string | null
  subscribers: number | null
}) {
  return uploadsFn({ data: input })
}

const followFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, channelId: z.string().min(1).max(100) }))
  .handler(async ({ data, context }) => {
    await followChannel(context.user.id, data.projectId, data.channelId)
  })

export function followViralChannel(projectId: string, channelId: string) {
  return followFn({ data: { projectId, channelId } })
}

const followLinkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, link: z.string().min(1).max(2048) }))
  .handler(async ({ data, context }) =>
    followByLink(context.user.id, data.projectId, data.link)
  )

export function followCreatorByLink(projectId: string, link: string) {
  return followLinkFn({ data: { projectId, link } })
}

const unfollowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, creatorId: id }))
  .handler(async ({ data, context }) => {
    await unfollowInProject(context.user.id, data.projectId, data.creatorId)
  })

export function unfollowViralCreator(projectId: string, creatorId: string) {
  return unfollowFn({ data: { projectId, creatorId } })
}
