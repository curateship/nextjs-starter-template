import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  createPostFolder,
  deletePostFolder,
  listPostFolders,
  renamePostFolder,
  reorderPostFolders,
} from "@/server/note/posts/folders"
import type { NotePostFolderList } from "@/lib/note/posts/posts"
import { FOLDER_NAME_MAX } from "@/lib/note/videos"

/**
 * One person's Posts folders. Open to every signed-in member, and every read
 * and write is their own: the server functions only ever pass on the id the
 * session resolved to.
 */

const id = z.string().min(1).max(36)
const name = z.string().max(FOLDER_NAME_MAX * 2)

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<NotePostFolderList> => listPostFolders(context.user.id))

export function loadPostFolders() {
  return listFn()
}

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name }))
  .handler(
    async ({ data, context }): Promise<NotePostFolderList> => createPostFolder(context.user.id, data.name)
  )

export function createNotePostFolder(folderName: string) {
  return createFn({ data: { name: folderName } })
}

const renameFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, name }))
  .handler(
    async ({ data, context }): Promise<NotePostFolderList> =>
      renamePostFolder(context.user.id, data.folderId, data.name)
  )

export function renameNotePostFolder(folderId: string, folderName: string) {
  return renameFn({ data: { folderId, name: folderName } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(async ({ data, context }) => deletePostFolder(context.user.id, data.folderId))

/** Deletes the folder and leaves its posts on the list, in no folder. */
export function deleteNotePostFolder(folderId: string) {
  return deleteFn({ data: { folderId } })
}

const reorderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderIds: z.array(id).max(500) }))
  .handler(
    async ({ data, context }): Promise<NotePostFolderList> => reorderPostFolders(context.user.id, data.folderIds)
  )

export function reorderNotePostFolders(folderIds: string[]) {
  return reorderFn({ data: { folderIds } })
}
