import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  FOLDER_NAME_REQUIRED_MESSAGE,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
  PROJECT_FOLDER_NAME_MAX,
} from "@/lib/video/project-folders"
import { userGet, userPost } from "@/server/guards"
import {
  createOwnedFolder,
  deleteOwnedFolder,
  listOwnedFolders,
  moveOwnedProjectsToFolder,
  renameOwnedFolder,
  type ProjectFolderSummary,
} from "@/server/video/project-folders"

/**
 * Project folder endpoints. Per-person like projects themselves: the owner's
 * id always comes from the session, never from the request.
 */

export type { ProjectFolderSummary }

const KNOWN_MESSAGES = new Set([
  FOLDER_NAME_REQUIRED_MESSAGE,
  FOLDER_NAME_TAKEN_MESSAGE,
  FOLDER_NOT_FOUND_MESSAGE,
])

export function getProjectFolderErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Folder request failed."
}

const folderIdSchema = z.object({ folderId: z.string().min(1).max(36) })
const nameSchema = z.object({
  name: z.string().min(1).max(PROJECT_FOLDER_NAME_MAX),
})

const listFoldersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    return listOwnedFolders(context.user.id)
  })

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(nameSchema)
  .handler(async ({ data, context }) => {
    return createOwnedFolder(context.user.id, data.name)
  })

const renameFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(folderIdSchema.extend(nameSchema.shape))
  .handler(async ({ data, context }) => {
    return renameOwnedFolder(context.user.id, data.folderId, data.name)
  })

const deleteFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(folderIdSchema)
  .handler(async ({ data, context }) => {
    return deleteOwnedFolder(context.user.id, data.folderId)
  })

const moveProjectsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      projectIds: z.array(z.string().min(1).max(36)).min(1).max(100),
      // null takes the projects out of whatever folder they are in.
      folderId: z.string().min(1).max(36).nullable(),
    })
  )
  .handler(async ({ data, context }) => {
    return moveOwnedProjectsToFolder(
      context.user.id,
      data.projectIds,
      data.folderId
    )
  })

export function listProjectFolders() {
  return listFoldersFn()
}

export function createProjectFolder(name: string) {
  return createFolderFn({ data: { name } })
}

export function renameProjectFolder(folderId: string, name: string) {
  return renameFolderFn({ data: { folderId, name } })
}

export function deleteProjectFolder(folderId: string) {
  return deleteFolderFn({ data: { folderId } })
}

export function moveProjectsToFolder(
  projectIds: string[],
  folderId: string | null
) {
  return moveProjectsFn({ data: { projectIds, folderId } })
}
