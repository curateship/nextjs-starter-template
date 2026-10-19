import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  createField,
  deleteField,
  fieldUseCount,
  reorderFields,
  updateField,
} from "@/server/note/notes/fields"
import {
  createFolder,
  listTree,
  moveFolder,
  restoreFolder,
  trashFolder,
  updateFolder,
} from "@/server/note/notes/folders"
import {
  createTemplate,
  createView,
  deleteTemplate,
  deleteView,
  loadTemplate,
  reorderTemplates,
  reorderViews,
  updateTemplate,
  updateView,
} from "@/server/note/notes/templates-views"
import { OPTION_COLOURS } from "@/lib/note/notes/colours"
import {
  FIELD_NAME_MAX,
  MAX_FIELDS_PER_FOLDER,
  MAX_OPTIONS_PER_FIELD,
  NOTE_FIELD_TYPES,
  OPTION_LABEL_MAX,
  type NoteField,
} from "@/lib/note/notes/fields"
import {
  NOTES_FOLDER_NAME_MAX,
  NOTE_TITLE_MAX,
  TEMPLATE_NAME_MAX,
  VIEW_NAME_MAX,
  type NoteFolderTree,
  type NoteTemplate,
} from "@/lib/note/notes/notes"
import {
  FILTER_OPS,
  MAX_FILTERS,
  VIEW_KINDS,
  type NoteView,
  type ViewKind,
  type ViewSettings,
} from "@/lib/note/notes/views"

/**
 * A person's note folders and everything that belongs to a folder: its
 * fields, templates and saved views. Open to every signed-in member, and
 * every read and write is the caller's own.
 */

const id = z.string().min(1).max(36)
const ids = z.array(id).max(500)

// ---------------------------------------------------------------------------
// Folders

const treeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<NoteFolderTree> => listTree(context.user.id))

export function loadNoteFolders() {
  return treeFn()
}

const createFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: z.string().max(NOTES_FOLDER_NAME_MAX * 2), parentId: id.nullable() }))
  .handler(async ({ data, context }) => createFolder(context.user.id, data))

export function createNotesFolder(name: string, parentId: string | null) {
  return createFolderFn({ data: { name, parentId } })
}

const updateFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      folderId: id,
      name: z.string().max(NOTES_FOLDER_NAME_MAX * 2).optional(),
      icon: z.string().max(40).nullable().optional(),
    })
  )
  .handler(
    async ({ data, context }): Promise<NoteFolderTree> =>
      updateFolder(context.user.id, data.folderId, { name: data.name, icon: data.icon })
  )

export function updateNotesFolder(folderId: string, changes: { name?: string; icon?: string | null }) {
  return updateFolderFn({ data: { folderId, ...changes } })
}

const moveFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, parentId: id.nullable(), orderedIds: ids }))
  .handler(
    async ({ data, context }): Promise<NoteFolderTree> =>
      moveFolder(context.user.id, data.folderId, { parentId: data.parentId, orderedIds: data.orderedIds })
  )

/** Puts a folder inside another (or at the top) at a place in that list. */
export function moveNotesFolder(folderId: string, parentId: string | null, orderedIds: string[]) {
  return moveFolderFn({ data: { folderId, parentId, orderedIds } })
}

const trashFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(async ({ data, context }) => trashFolder(context.user.id, data.folderId))

/** Sends a folder to Trash with every folder and note inside it. */
export function trashNotesFolder(folderId: string) {
  return trashFolderFn({ data: { folderId } })
}

const restoreFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id }))
  .handler(async ({ data, context }): Promise<NoteFolderTree> => restoreFolder(context.user.id, data.folderId))

export function restoreNotesFolder(folderId: string) {
  return restoreFolderFn({ data: { folderId } })
}

// ---------------------------------------------------------------------------
// Fields

const fieldInput = z.object({
  name: z.string().max(FIELD_NAME_MAX * 2),
  type: z.enum(NOTE_FIELD_TYPES),
  options: z
    .array(
      z.object({
        id,
        label: z.string().max(OPTION_LABEL_MAX * 2),
        colour: z.enum(OPTION_COLOURS),
      })
    )
    .max(MAX_OPTIONS_PER_FIELD),
  remind: z.boolean(),
})

type FieldInput = z.infer<typeof fieldInput>

const createFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(fieldInput.extend({ folderId: id }))
  .handler(async ({ data, context }): Promise<NoteField> => {
    const { folderId, ...input } = data
    return createField(context.user.id, folderId, input)
  })

export function createNoteField(folderId: string, input: FieldInput) {
  return createFieldFn({ data: { folderId, ...input } })
}

const updateFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(fieldInput.extend({ fieldId: id, timeZone: z.string().max(64).optional() }))
  .handler(async ({ data, context }): Promise<NoteField> => {
    const { fieldId, timeZone, ...input } = data
    return updateField(context.user.id, fieldId, input, timeZone)
  })

/** Changes a field. Switching Remind me on uses this browser's time zone for the 9:00. */
export function updateNoteField(fieldId: string, input: FieldInput) {
  let timeZone: string | undefined
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    timeZone = undefined
  }
  return updateFieldFn({ data: { fieldId, ...input, timeZone } })
}

const fieldUseFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ fieldId: id }))
  .handler(async ({ data, context }): Promise<number> => fieldUseCount(context.user.id, data.fieldId))

/** How many notes hold a value in a field, for the delete warning. */
export function countFieldUse(fieldId: string) {
  return fieldUseFn({ data: { fieldId } })
}

const deleteFieldFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ fieldId: id }))
  .handler(async ({ data, context }) => deleteField(context.user.id, data.fieldId))

export function deleteNoteField(fieldId: string) {
  return deleteFieldFn({ data: { fieldId } })
}

const reorderFieldsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, fieldIds: ids }))
  .handler(async ({ data, context }) => reorderFields(context.user.id, data.folderId, data.fieldIds))

export function reorderNoteFields(folderId: string, fieldIds: string[]) {
  return reorderFieldsFn({ data: { folderId, fieldIds } })
}

// ---------------------------------------------------------------------------
// Templates

const loadTemplateFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ templateId: id }))
  .handler(async ({ data, context }): Promise<NoteTemplate> => loadTemplate(context.user.id, data.templateId))

export function loadNoteTemplate(templateId: string) {
  return loadTemplateFn({ data: { templateId } })
}

const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ folderId: id, name: z.string().max(TEMPLATE_NAME_MAX * 2), fromNoteId: id.nullable().optional() })
  )
  .handler(async ({ data, context }): Promise<NoteTemplate> => createTemplate(context.user.id, data))

export function createNoteTemplate(folderId: string, name: string, fromNoteId?: string | null) {
  return createTemplateFn({ data: { folderId, name, fromNoteId } })
}

const updateTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      templateId: id,
      name: z.string().max(TEMPLATE_NAME_MAX * 2).optional(),
      title: z.string().max(NOTE_TITLE_MAX * 2).optional(),
      body: z.record(z.string(), z.unknown()).optional(),
      values: z
        .record(z.string().max(60), z.unknown())
        .refine((values) => Object.keys(values).length <= MAX_FIELDS_PER_FOLDER)
        .optional(),
    })
  )
  .handler(async ({ data, context }): Promise<NoteTemplate> => {
    const { templateId, ...changes } = data
    return updateTemplate(context.user.id, templateId, changes)
  })

export function updateNoteTemplate(
  templateId: string,
  changes: { name?: string; title?: string; body?: Record<string, unknown>; values?: Record<string, unknown> }
) {
  return updateTemplateFn({ data: { templateId, ...changes } })
}

const deleteTemplateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ templateId: id }))
  .handler(async ({ data, context }) => deleteTemplate(context.user.id, data.templateId))

export function deleteNoteTemplate(templateId: string) {
  return deleteTemplateFn({ data: { templateId } })
}

const reorderTemplatesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, ids }))
  .handler(async ({ data, context }) => reorderTemplates(context.user.id, data.folderId, data.ids))

export function reorderNoteTemplates(folderId: string, templateIds: string[]) {
  return reorderTemplatesFn({ data: { folderId, ids: templateIds } })
}

// ---------------------------------------------------------------------------
// Saved views

const settings = z.object({
  filters: z
    .array(
      z.object({
        fieldKey: z.string().max(60),
        op: z.enum(FILTER_OPS),
        value: z.union([z.string().max(200), z.number()]).optional(),
      })
    )
    .max(MAX_FILTERS),
  sort: z.object({ key: z.string().max(60), dir: z.enum(["asc", "desc"]) }).nullable(),
  groupBy: z.string().max(60).nullable(),
  totals: z
    .record(z.string().max(60), z.enum(["sum", "average"]))
    .refine((totals) => Object.keys(totals).length <= MAX_FIELDS_PER_FOLDER),
})

const createViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ folderId: id, name: z.string().max(VIEW_NAME_MAX * 2), kind: z.enum(VIEW_KINDS), settings })
  )
  .handler(async ({ data, context }): Promise<NoteView> => createView(context.user.id, data))

export function createNoteView(data: {
  folderId: string
  name: string
  kind: ViewKind
  settings: ViewSettings
}) {
  return createViewFn({ data })
}

const updateViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      viewId: id,
      name: z.string().max(VIEW_NAME_MAX * 2).optional(),
      kind: z.enum(VIEW_KINDS).optional(),
      settings: settings.optional(),
    })
  )
  .handler(async ({ data, context }): Promise<NoteView> => {
    const { viewId, ...changes } = data
    return updateView(context.user.id, viewId, changes)
  })

export function updateNoteView(
  viewId: string,
  changes: { name?: string; kind?: ViewKind; settings?: ViewSettings }
) {
  return updateViewFn({ data: { viewId, ...changes } })
}

const deleteViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ viewId: id }))
  .handler(async ({ data, context }) => deleteView(context.user.id, data.viewId))

export function deleteNoteView(viewId: string) {
  return deleteViewFn({ data: { viewId } })
}

const reorderViewsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: id, ids }))
  .handler(async ({ data, context }) => reorderViews(context.user.id, data.folderId, data.ids))

export function reorderNoteViews(folderId: string, viewIds: string[]) {
  return reorderViewsFn({ data: { folderId, ids: viewIds } })
}
