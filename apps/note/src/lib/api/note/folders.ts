import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { getNoteErrorMessage } from "./videos"
import { userGet, userPost } from "@/server/guards"
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from "@/server/note/folders"
import { FOLDER_NAME_MAX, type NoteFolderList } from "@/lib/note/videos"

/**
 * One person's video folders. Open to every signed-in member, and every read
 * and write is their own: the server functions only ever pass on the id the
 * session resolved to.
 */

export { getNoteErrorMessage as getFolderErrorMessage }

const id = z.string().min(1).max(36)
const name = z.string().max(FOLDER_NAME_MAX * 2)

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<NoteFolderList> => listFolders(context.user.id))

export function loadFolders() {
  return listFn()
}

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name }))
  .handler(
    async ({ data, context }): Promise<NoteFolderList> => createFolder(context.user.id, data.name)
  )

export function createNoteFolder(folderName: string) {
  return createFn({ data: { name: folderName } })
}

const renameFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, name }))
  .handler(
    async ({ data, context }): Promise<NoteFolderList> =>
      renameFolder(context.user.id, data.folderId, data.name)
  )

export function renameNoteFolder(folderId: string, folderName: string) {
  return renameFn({ data: { folderId, name: folderName } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(async ({ data, context }) => deleteFolder(context.user.id, data.folderId))

/** Deletes the folder and leaves its videos on the list, in no folder. */
export function deleteNoteFolder(folderId: string) {
  return deleteFn({ data: { folderId } })
}

const reorderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderIds: z.array(id).max(500) }))
  .handler(
    async ({ data, context }): Promise<NoteFolderList> =>
      reorderFolders(context.user.id, data.folderIds)
  )

export function reorderNoteFolders(folderIds: string[]) {
  return reorderFn({ data: { folderIds } })
}
