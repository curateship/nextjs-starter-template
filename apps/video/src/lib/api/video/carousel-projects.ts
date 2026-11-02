import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { getProjectFolderErrorMessage } from "@/lib/api/video/project-folders"
import { CAROUSEL_FOOTER_MAX, carouselLookSchema } from "@/lib/video/carousel-look"
import { CAROUSEL_PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/carousel-projects"
import { FOLDER_NOT_FOUND_MESSAGE, PROJECT_FOLDER_NAME_MAX } from "@/lib/video/project-folders"
import { PROJECT_NAME_MAX, PROJECT_NAME_REQUIRED_MESSAGE } from "@/lib/video/projects"
import { userGet, userPost } from "@/server/guards"
import {
  createCarouselFolder,
  createOwnedCarouselProject,
  deleteCarouselFolder,
  deleteOwnedCarouselProjects,
  duplicateOwnedCarouselProject,
  listCarouselFolders,
  listOwnedCarouselProjects,
  moveCarouselProjectsToFolder,
  renameCarouselFolder,
  saveCarouselProjectSettings,
  setCarouselProjectPinned,
  setCarouselProjectsArchived,
  summarizeCarouselProjectDelete,
  type CarouselFolderSummary,
  type CarouselProjectItem,
  type CarouselProjectListResponse,
} from "@/server/video/carousel-projects"
import { carouselProjectOf } from "@/server/video/carousels"

/**
 * The carousel projects table's endpoints, and what a carousel project holds
 * for all its carousels (`workspace/docs/carousel-project-carousels.md`). The
 * carousels in one are in `carousels.ts`. Every one carries the owner's id
 * from the session, never from the request.
 */

export type { CarouselFolderSummary, CarouselProjectItem, CarouselProjectListResponse }

const KNOWN_MESSAGES = new Set([
  CAROUSEL_PROJECT_NOT_FOUND_MESSAGE,
  PROJECT_NAME_REQUIRED_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
])

export function getCarouselProjectErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Carousel project request failed."
}

const id = z.string().min(1).max(36)
const projectIdSchema = z.object({ projectId: id })
const projectIdsSchema = z.object({ projectIds: z.array(id).min(1).max(100) })
const name = z.string().min(1).max(PROJECT_NAME_MAX)
// Absent = every project; null = those in no folder; an id = that folder.
const folderIdSchema = id.nullish()

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      page: z.number().int().optional(),
      pageSize: z.number().int().optional(),
      search: z.string().trim().max(120).default(""),
      folderId: folderIdSchema,
      archived: z.boolean().optional(),
    })
  )
  .handler(({ data, context }) => listOwnedCarouselProjects({ userId: context.user.id, ...data }))

// Before carousel projects, a carousel's address was /admin/video-carousels/<carousel>.
const projectOfFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ carouselId: id }))
  .handler(({ data, context }) => carouselProjectOf(context.user.id, data.carouselId))

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name, folderId: folderIdSchema }))
  .handler(({ data, context }) =>
    createOwnedCarouselProject(context.user.id, data.name, data.folderId ?? null)
  )

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema)
  .handler(({ data, context }) => duplicateOwnedCarouselProject(context.user.id, data.projectId))

const settingsSchema = projectIdSchema.extend({
  name,
  look: carouselLookSchema,
  captionFooter: z.string().max(CAROUSEL_FOOTER_MAX),
})

const settingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(settingsSchema)
  .handler(({ data, context }) =>
    saveCarouselProjectSettings(context.user.id, data.projectId, data)
  )

const archiveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdsSchema.extend({ archived: z.boolean() }))
  .handler(({ data, context }) =>
    setCarouselProjectsArchived(context.user.id, data.projectIds, data.archived)
  )

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdSchema.extend({ pinned: z.boolean() }))
  .handler(({ data, context }) =>
    setCarouselProjectPinned(context.user.id, data.projectId, data.pinned)
  )

const deleteSummaryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(projectIdsSchema)
  .handler(({ data, context }) => summarizeCarouselProjectDelete(context.user.id, data.projectIds))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdsSchema)
  .handler(({ data, context }) => deleteOwnedCarouselProjects(context.user.id, data.projectIds))

export function listCarouselProjects(
  options: {
    page?: number
    pageSize?: number
    search?: string
    folderId?: string | null
    archived?: boolean
  } = {}
) {
  return listFn({ data: { search: "", ...options } })
}

/** The carousel project of a carousel from an old address, or null. */
export function findCarouselProjectOf(carouselId: string) {
  return projectOfFn({ data: { carouselId } })
}

/** A new carousel project with its first carousel, named after it. */
export function createCarouselProject(name: string, folderId?: string | null) {
  return createFn({ data: { name, folderId } })
}

export function duplicateCarouselProject(projectId: string) {
  return duplicateFn({ data: { projectId } })
}

/** The name, the look a new carousel starts with and the caption footer. */
export function saveCarouselProjectSettingsFor(settings: z.infer<typeof settingsSchema>) {
  return settingsFn({ data: settings })
}

/** Archives carousel projects, or brings them back with `archived: false`. */
export function archiveCarouselProjects(projectIds: string[], archived: boolean) {
  return archiveFn({ data: { projectIds, archived } })
}

export function pinCarouselProject(projectId: string, pinned: boolean) {
  return pinFn({ data: { projectId, pinned } })
}

/** How many carousels and kept exports go with these carousel projects. */
export function loadCarouselProjectDeleteSummary(projectIds: string[]) {
  return deleteSummaryFn({ data: { projectIds } })
}

export function deleteCarouselProjects(projectIds: string[]) {
  return deleteFn({ data: { projectIds } })
}

// ------------------------------------------------------------ Folders ----

const folderName = z.string().min(1).max(PROJECT_FOLDER_NAME_MAX)

const listFoldersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => listCarouselFolders(context.user.id))

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: folderName }))
  .handler(({ data, context }) => createCarouselFolder(context.user.id, data.name))

const renameFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, name: folderName }))
  .handler(({ data, context }) => renameCarouselFolder(context.user.id, data.folderId, data.name))

const deleteFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(({ data, context }) => deleteCarouselFolder(context.user.id, data.folderId))

const moveFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(projectIdsSchema.extend({ folderId: id.nullable() }))
  .handler(({ data, context }) =>
    moveCarouselProjectsToFolder(context.user.id, data.projectIds, data.folderId)
  )

export function listCarouselProjectFolders() {
  return listFoldersFn()
}

/** The folder doors, in the shape the shared folder menu takes. */
export const carouselFolderApi = {
  create: (folder: string) => createFolderFn({ data: { name: folder } }),
  rename: (folderId: string, folder: string) =>
    renameFolderFn({ data: { folderId, name: folder } }),
  remove: (folderId: string) => deleteFolderFn({ data: { folderId } }),
  move: (projectIds: string[], folderId: string | null) =>
    moveFolderFn({ data: { projectIds, folderId } }),
  errorMessage: getProjectFolderErrorMessage,
}
