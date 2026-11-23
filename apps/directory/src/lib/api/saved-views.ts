import { createServerFn } from "@tanstack/react-start"
import type { z } from "zod"

import {
  deleteSavedViewSchema,
  listSavedViewsSchema,
  saveSavedViewSchema,
  updateSavedViewSchema,
} from "@/lib/saved-views"
import { userGet, userPost } from "@/server/guards"
import {
  deleteSavedView,
  listSavedViews,
  saveSavedView,
  updateSavedView,
} from "@/server/saved-views"

export type { SavedView } from "@/lib/saved-views"

/** Only the person's own views come back, so listing needs no check of the screen. */
const loadSavedViewsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listSavedViewsSchema)
  .handler(async ({ data, context }) => listSavedViews(context.user.id, data.screen))

const saveSavedViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveSavedViewSchema)
  .handler(async ({ data, context }) => saveSavedView(context.user.id, data))

const updateSavedViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateSavedViewSchema)
  .handler(async ({ data, context }) => updateSavedView(context.user.id, data))

const deleteSavedViewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteSavedViewSchema)
  .handler(async ({ data, context }) => deleteSavedView(context.user.id, data.viewId))

export function loadSavedViews(screen: string) {
  return loadSavedViewsFn({ data: { screen } })
}

export function saveView(data: z.input<typeof saveSavedViewSchema>) {
  return saveSavedViewFn({ data })
}

export function updateView(data: z.input<typeof updateSavedViewSchema>) {
  return updateSavedViewFn({ data })
}

export function deleteView(viewId: string) {
  return deleteSavedViewFn({ data: { viewId } })
}
