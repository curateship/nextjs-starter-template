import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { idSchema } from "./library"
import { userGet, userPost } from "@/server/guards"
import {
  analyseNote,
  analyseNotes,
  importLink,
  mergePlans,
  removeImport,
  retryImport,
  retryPostVideo,
  saveFromX,
  saveHighlights,
  savePlan,
  type ImportResult,
} from "@/server/note/library/imports"
import { saveKeyFor } from "@/server/note/library/save-key"
import { isHighlightPart, type Highlight } from "@/lib/note/library/highlights"
import {
  MANY_AT_ONCE_MAX,
  PLAN_STEP_MAX,
  PLAN_STEPS_MAX,
  type NoteCard,
  type NoteDetail,
  type PlanStep,
} from "@/lib/note/library/notes"

/**
 * Imports and the AI, for the member who owns the note. Each function passes
 * on only the id the session resolved to. Refusals are said with
 * `getLibraryErrorMessage`.
 */

const url = z.string().min(1).max(2048)

const importFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ libraryId: idSchema, url }))
  .handler(async ({ data, context }): Promise<ImportResult> => importLink(context.user.id, data))

/** The Import dropdown: the link becomes a note at once, and the worker fills it in. */
export function importNoteLink(libraryId: string, link: string) {
  return importFn({ data: { libraryId, url: link } })
}

const saveKey = z.string().regex(/^[0-9a-f]{32}$/)

const fromXFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ url, key: saveKey }))
  .handler(async ({ data, context }): Promise<ImportResult> => saveFromX(context.user.id, data.url, data.key))

/** The Save from x.com button's link, saved into the library opened last. */
export function saveXPostLink(link: string, key: string) {
  return fromXFn({ data: { url: link, key } })
}

const saveKeyFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<string> => saveKeyFor(context.user.id))

/** The key built into this person's Save from x.com button. */
export function loadSaveKey() {
  return saveKeyFn()
}

const oneNote = z.object({ id: idSchema })

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(oneNote)
  .handler(async ({ data, context }): Promise<NoteDetail> => retryImport(context.user.id, data.id))

export function retryNoteImport(id: string) {
  return retryFn({ data: { id } })
}

const retryVideoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(oneNote)
  .handler(async ({ data, context }): Promise<NoteDetail> => retryPostVideo(context.user.id, data.id))

export function retryNotePostVideo(id: string) {
  return retryVideoFn({ data: { id } })
}

const removeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(oneNote)
  .handler(async ({ data, context }): Promise<NoteDetail> => removeImport(context.user.id, data.id))

/** The bin on the Video card. The note and its own text stay. */
export function removeNoteImport(id: string) {
  return removeFn({ data: { id } })
}

const analyseFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(oneNote)
  .handler(async ({ data, context }): Promise<NoteDetail> => analyseNote(context.user.id, data.id))

export function analyseNoteNow(id: string) {
  return analyseFn({ data: { id } })
}

const many = z.object({ ids: z.array(idSchema).min(1).max(MANY_AT_ONCE_MAX) })

const analyseManyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(many)
  .handler(async ({ data, context }) => analyseNotes(context.user.id, data.ids))

export function analyseManyNotes(ids: string[]) {
  return analyseManyFn({ data: { ids } })
}

const mergeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(many)
  .handler(async ({ data, context }): Promise<NoteCard> => mergePlans(context.user.id, data.ids))

export function mergeNotePlans(ids: string[]) {
  return mergeFn({ data: { ids } })
}

const step = z.object({
  text: z.string().max(PLAN_STEP_MAX * 2),
  done: z.boolean(),
  from: z.string().max(400).nullable().optional(),
})

const planFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, steps: z.array(step).max(PLAN_STEPS_MAX) }))
  .handler(async ({ data, context }): Promise<NoteCard> => savePlan(context.user.id, data.id, data.steps))

export function saveNotePlan(id: string, steps: PlanStep[]) {
  return planFn({ data: { id, steps } })
}

const highlight = z.object({
  part: z.string().max(20).refine(isHighlightPart),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
})

const highlightsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: idSchema, highlights: z.array(highlight).max(200) }))
  .handler(
    async ({ data, context }): Promise<NoteCard> =>
      saveHighlights(context.user.id, data.id, data.highlights as Highlight[])
  )

export function saveNoteHighlights(id: string, highlights: Highlight[]) {
  return highlightsFn({ data: { id, highlights } })
}
