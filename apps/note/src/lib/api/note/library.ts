import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { userGet, userPost } from "@/server/guards"
import {
  createFolder,
  createLibrary,
  createTemplate,
  createView,
  deleteFolder,
  deleteLibrary,
  deleteTemplate,
  deleteView,
  listLibraries,
  loadLibraryPage,
  markLibraryOpened,
  pinLibrary,
  renameFolder,
  updateLibrary,
} from "@/server/note/library/libraries"
import { BODY_SAYS } from "@/lib/note/notes/body"
import {
  ANALYSED_FILTERS,
  FOLDER_NAME_MAX,
  LIBRARY_COLOURS,
  LIBRARY_DESCRIPTION_MAX,
  LIBRARY_NAME_MAX,
  LIBRARY_SAYS,
  NOTE_PRIORITIES,
  NOTE_SOURCES,
  PROGRESS_FILTERS,
  TAG_MAX,
  TEMPLATE_NAME_MAX,
  VIEW_NAME_MAX,
  AUTHOR_NAME_MAX,
  type LibraryFolder,
  type LibraryPage,
  type LibraryRow,
  type NoteFilters,
} from "@/lib/note/library/notes"

/**
 * Libraries, their folders, saved views and templates, for the member who
 * owns them. Open to every signed-in member (Tyler, 18 Oct 2026, for Notes),
 * and each function passes on only the id the session resolved to, so every
 * query is that person's own.
 */

const describe = createErrorMessage(
  {
    ...Object.fromEntries([...Object.values(LIBRARY_SAYS), ...Object.values(BODY_SAYS)].map((sentence) => [sentence, sentence])),
    AI_LIMIT_REACHED: LIBRARY_SAYS.aiLimitReached,
    RATE_LIMITED: LIBRARY_SAYS.tooManyLinks,
    SECRET_UNREADABLE: LIBRARY_SAYS.geminiKeyUnreadable,
    ENCRYPTION_NOT_CONFIGURED: LIBRARY_SAYS.geminiKeyUnreadable,
  },
  "That did not work. Try again in a moment."
)

/** One sentence for any refusal anywhere in the Library. */
export function getLibraryErrorMessage(error: unknown) {
  return describe(error)
}

export const idSchema = z.string().min(1).max(36)
export const idsSchema = z.array(idSchema).min(1).max(500)

/** The Filter popover's picks, as the address and a saved view hold them. */
export const filtersSchema = z.object({
  source: z.enum(NOTE_SOURCES).optional(),
  priority: z.enum(NOTE_PRIORITIES).optional(),
  tag: z.string().min(1).max(TAG_MAX).optional(),
  author: z.string().min(1).max(AUTHOR_NAME_MAX).optional(),
  analysed: z.enum(ANALYSED_FILTERS).optional(),
  progress: z.enum(PROGRESS_FILTERS).optional(),
})

const pictureUrl = z.string().max(2000).nullable()

// ---------------------------------------------------------------------------
// Libraries

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<LibraryRow[]> => listLibraries(context.user.id))

export function loadLibraries() {
  return listFn()
}

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().max(LIBRARY_NAME_MAX * 2),
      description: z.string().max(LIBRARY_DESCRIPTION_MAX * 2).optional(),
      colour: z.enum(LIBRARY_COLOURS).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<LibraryRow> => createLibrary(context.user.id, data))

export function makeLibrary(data: { name: string; description?: string; colour?: (typeof LIBRARY_COLOURS)[number] }) {
  return createFn({ data })
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      id: idSchema,
      name: z.string().max(LIBRARY_NAME_MAX * 2).optional(),
      description: z.string().max(LIBRARY_DESCRIPTION_MAX * 2).optional(),
      colour: z.enum(LIBRARY_COLOURS).optional(),
      avatarUrl: pictureUrl.optional(),
      bannerUrl: pictureUrl.optional(),
    })
  )
  .handler(async ({ data, context }): Promise<LibraryRow> => {
    const { id, ...changes } = data
    return updateLibrary(context.user.id, id, changes)
  })

export function saveLibrary(
  id: string,
  changes: {
    name?: string
    description?: string
    colour?: (typeof LIBRARY_COLOURS)[number]
    avatarUrl?: string | null
    bannerUrl?: string | null
  }
) {
  return updateFn({ data: { id, ...changes } })
}

const pinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, pinned: z.boolean() }))
  .handler(async ({ data, context }) => pinLibrary(context.user.id, data.id, data.pinned))

export function pinLibraryRow(id: string, pinned: boolean) {
  return pinFn({ data: { id, pinned } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => deleteLibrary(context.user.id, data.id))

export function deleteLibraryRow(id: string) {
  return deleteFn({ data: { id } })
}

const pageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }): Promise<LibraryPage> => loadLibraryPage(context.user.id, data.id))

/** Everything the dashboard's left panel shows. A GET, so the page's own loader may call it. */
export function loadLibrary(id: string) {
  return pageFn({ data: { id } })
}

const openedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => markLibraryOpened(context.user.id, data.id))

/** The dashboard opened: this library is now the one the Save from x.com button saves into. */
export function markLibraryOpen(id: string) {
  return openedFn({ data: { id } })
}

// ---------------------------------------------------------------------------
// Folders

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ libraryId: idSchema, name: z.string().max(FOLDER_NAME_MAX * 2) }))
  .handler(
    async ({ data, context }): Promise<LibraryFolder> => createFolder(context.user.id, data.libraryId, data.name)
  )

export function makeFolder(libraryId: string, name: string) {
  return createFolderFn({ data: { libraryId, name } })
}

const renameFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, name: z.string().max(FOLDER_NAME_MAX * 2) }))
  .handler(async ({ data, context }) => renameFolder(context.user.id, data.id, data.name))

export function renameLibraryFolder(id: string, name: string) {
  return renameFolderFn({ data: { id, name } })
}

const deleteFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => deleteFolder(context.user.id, data.id))

export function deleteLibraryFolder(id: string) {
  return deleteFolderFn({ data: { id } })
}

// ---------------------------------------------------------------------------
// Saved views

const createViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ libraryId: idSchema, name: z.string().max(VIEW_NAME_MAX * 2), filters: filtersSchema }))
  .handler(async ({ data, context }) => createView(context.user.id, data.libraryId, data))

export function saveView(libraryId: string, name: string, filters: NoteFilters) {
  return createViewFn({ data: { libraryId, name, filters } })
}

const deleteViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => deleteView(context.user.id, data.id))

export function deleteSavedView(id: string) {
  return deleteViewFn({ data: { id } })
}

// ---------------------------------------------------------------------------
// Templates

const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ noteId: idSchema, name: z.string().max(TEMPLATE_NAME_MAX * 2) }))
  .handler(async ({ data, context }) => createTemplate(context.user.id, data.noteId, data.name))

export function saveAsTemplate(noteId: string, name: string) {
  return createTemplateFn({ data: { noteId, name } })
}

const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema }))
  .handler(async ({ data, context }) => deleteTemplate(context.user.id, data.id))

export function deleteLibraryTemplate(id: string) {
  return deleteTemplateFn({ data: { id } })
}
