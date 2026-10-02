import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminPost } from "@/server/guards"
import {
  createFolder,
  deleteFolder,
  renameFolder,
  saveFolderOrder,
  setCreatorInFolder,
} from "@/server/video/creators/folders"
import {
  CREATOR_FOLDER_NAME_MAX,
  MAX_CREATOR_FOLDERS,
  type CreatorFolder,
} from "@/lib/video/creators"

/**
 * Folders of creators. Every change hands back the whole fresh list, so the
 * panel — which applies a tick on the spot and saves behind it — always has the
 * real answer to put back if a save is refused.
 */

export const getCreatorFolderErrorMessage = createErrorMessage(
  {
    FOLDER_NOT_FOUND: "That folder is gone.",
    FOLDER_NAME_TAKEN: "You already have a folder with that name.",
    FOLDER_NAME_EMPTY: "Give the folder a name.",
    FOLDER_LIMIT_REACHED: `That is the most folders one person can have (${MAX_CREATOR_FOLDERS}).`,
    CREATOR_NOT_FOUND: "That creator is no longer on your list.",
  },
  "That did not work. Try again in a moment."
)

const folderId = z.string().min(1).max(36)
const folderName = z.string().min(1).max(CREATOR_FOLDER_NAME_MAX)

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      name: folderName,
      /** Set when the folder is made from inside a creator's folder menu. */
      firstCreatorId: folderId.optional(),
    })
  )
  .handler(
    async ({ data, context }): Promise<CreatorFolder[]> =>
      createFolder(context.user.id, data.name, data.firstCreatorId)
  )

export function createCreatorFolder(name: string, firstCreatorId?: string) {
  return createFolderFn({ data: { name, firstCreatorId } })
}

const renameFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ folderId, name: folderName }))
  .handler(
    async ({ data, context }): Promise<CreatorFolder[]> =>
      renameFolder(context.user.id, data.folderId, data.name)
  )

export function renameCreatorFolder(id: string, name: string) {
  return renameFolderFn({ data: { folderId: id, name } })
}

const deleteFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ folderId }))
  .handler(
    async ({ data, context }): Promise<CreatorFolder[]> =>
      deleteFolder(context.user.id, data.folderId)
  )

/** Deleting a folder keeps its creators; only the grouping goes. */
export function deleteCreatorFolder(id: string) {
  return deleteFolderFn({ data: { folderId: id } })
}

const setCreatorInFolderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ folderId, creatorId: folderId, saved: z.boolean() })
  )
  .handler(async ({ data, context }) => {
    await setCreatorInFolder(
      context.user.id,
      data.folderId,
      data.creatorId,
      data.saved
    )
  })

/** Ticks a creator in or out of one folder. */
export function setFolderCreator(input: {
  folderId: string
  creatorId: string
  saved: boolean
}) {
  return setCreatorInFolderFn({ data: input })
}

const saveOrderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      order: z
        .array(
          z.object({
            id: folderId,
            position: z.number().int().min(0).max(1000),
            hidden: z.boolean(),
          })
        )
        .max(MAX_CREATOR_FOLDERS),
    })
  )
  .handler(
    async ({ data, context }): Promise<CreatorFolder[]> =>
      saveFolderOrder(context.user.id, data.order)
  )

/** A whole drag saved in one request, so a half-applied order cannot stick. */
export function saveCreatorFolderOrder(
  order: { id: string; position: number; hidden: boolean }[]
) {
  return saveOrderFn({ data: { order } })
}
