import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { HISTORY_FILTER_MAX, HISTORY_GROUPS, HISTORY_STATUSES } from "@/lib/fitness/history-filters"
import { userGet, userPost } from "@/server/guards"
import { deleteView, listSavedViews, saveView } from "@/server/fitness/saved-views"

export type { SavedView } from "@/server/fitness/saved-views"

const id = z.string().min(1).max(36)
const text = z.string().trim().min(1).max(HISTORY_FILTER_MAX)

const filters = z
  .object({
    q: text,
    name: text,
    status: z.enum(HISTORY_STATUSES),
    exercise: text,
    group: z.enum(HISTORY_GROUPS),
  })
  .partial()
  .strict()

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ programId: id }))
  .handler(async ({ data, context }) => listSavedViews(context.user.id, data.programId))

/** The signed-in person's own History views on one program. */
export function loadSavedViews(programId: string) {
  return listFn({ data: { programId } })
}

const saveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ programId: id, name: z.string().max(60), filters }))
  .handler(async ({ data, context }) => saveView(context.user.id, data.programId, data.name, data.filters))

export function saveHistoryView(data: Parameters<typeof saveFn>[0]["data"]) {
  return saveFn({ data })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ viewId: id }))
  .handler(async ({ data, context }) => deleteView(context.user.id, data.viewId))

export function deleteHistoryView(viewId: string) {
  return deleteFn({ data: { viewId } })
}
