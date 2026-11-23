import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import {
  createSaveCollection,
  deleteSaveCollection,
  deleteSaveCollectionsAsAdmin,
  mostSavedListings,
  removeSavedItemAsAdmin,
  renameSaveCollection,
  renameSaveCollectionAsAdmin,
  savedCollectionForWorkspace,
  savedCollectionPageForWorkspace,
  savedCollectionsForUser,
  saveStateFor,
  setSaveCollectionPublic,
  setSaveCollectionPublicAsAdmin,
  setListingSaved,
} from "@/server/directory/saves"
import {
  visitorWorkspaceId,
  workspaceIdForRequest,
} from "@/server/workspaces/for-request"

export function getSaveErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ""
  return (
    describeAuthError(message) ??
    (message || "Saved listings are unavailable right now. Please try again.")
  )
}

const listingIdSchema = z.object({ listingId: z.string().uuid() })

async function publicSiteId() {
  const workspaceId = await visitorWorkspaceId()
  if (!workspaceId) throw new Error("That site is not available.")
  return workspaceId
}

const loadSaveStateFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listingIdSchema)
  .handler(async ({ data, context }) =>
    saveStateFor(await publicSiteId(), context.user.id, data.listingId)
  )

export function loadSaveState(listingId: string) {
  return loadSaveStateFn({ data: { listingId } })
}

const setSavedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    listingIdSchema.extend({
      collectionId: z.string().uuid(),
      saved: z.boolean(),
    })
  )
  .handler(async ({ data, context }) =>
    setListingSaved(await publicSiteId(), context.user.id, data)
  )

export function setSaved(input: {
  listingId: string
  collectionId: string
  saved: boolean
}) {
  return setSavedFn({ data: input })
}

const createSavedListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(listingIdSchema.extend({ name: z.string().max(80) }))
  .handler(async ({ data, context }) =>
    createSaveCollection(await publicSiteId(), context.user.id, data)
  )

export function createSavedList(listingId: string, name: string) {
  return createSavedListFn({ data: { listingId, name } })
}

const loadMySavedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => savedCollectionsForUser(context.user.id))

export function loadMySaved() {
  return loadMySavedFn()
}

const removeFromSavedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      collectionId: z.string().uuid(),
      listingId: z.string().uuid(),
    })
  )
  .handler(({ data, context }) =>
    setListingSaved(data.workspaceId, context.user.id, {
      ...data,
      saved: false,
    })
  )

export function removeFromSaved(input: {
  workspaceId: string
  collectionId: string
  listingId: string
}) {
  return removeFromSavedFn({ data: input })
}

const setSavedListPublicFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      collectionId: z.string().uuid(),
      isPublic: z.boolean(),
    })
  )
  .handler(({ data, context }) =>
    setSaveCollectionPublic(
      data.workspaceId,
      context.user.id,
      data.collectionId,
      data.isPublic
    )
  )

export function setSavedListPublic(input: {
  workspaceId: string
  collectionId: string
  isPublic: boolean
}) {
  return setSavedListPublicFn({ data: input })
}

const renameMySavedListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      collectionId: z.string().uuid(),
      name: z.string().max(80),
    })
  )
  .handler(({ data, context }) =>
    renameSaveCollection(
      data.workspaceId,
      context.user.id,
      data.collectionId,
      data.name
    )
  )

export function renameMySavedList(input: {
  workspaceId: string
  collectionId: string
  name: string
}) {
  return renameMySavedListFn({ data: input })
}

const deleteMySavedListFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      workspaceId: z.string().uuid(),
      collectionId: z.string().uuid(),
    })
  )
  .handler(({ data, context }) =>
    deleteSaveCollection(data.workspaceId, context.user.id, data.collectionId)
  )

export function deleteMySavedList(input: {
  workspaceId: string
  collectionId: string
}) {
  return deleteMySavedListFn({ data: input })
}

export const SAVED_COLLECTION_SORT_COLUMNS = [
  "name",
  "owner",
  "visibility",
  "listings",
] as const

export type SavedCollectionSortColumn =
  (typeof SAVED_COLLECTION_SORT_COLUMNS)[number]

export type SavedListsSearch = {
  q?: string
  sort?: SavedCollectionSortColumn
  direction?: "asc" | "desc"
  page?: number
  size?: number
  open?: string
}

const savedCollectionPageSchema = z.object({
  search: z.string().max(120).optional(),
  sort: z.enum(SAVED_COLLECTION_SORT_COLUMNS).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
})

const loadSavesAdminFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(savedCollectionPageSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const page = data.page ?? 1
    const pageSize = data.limit ?? 50
    const [mostSaved, savedLists] = await Promise.all([
      mostSavedListings(workspaceId),
      savedCollectionPageForWorkspace(workspaceId, {
        search: data.search,
        sort: data.sort,
        direction: data.direction,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    ])
    return {
      mostSaved,
      savedLists: { ...savedLists, page, pageSize },
    }
  })

export function loadSavesAdmin(input: {
  search?: string
  sort?: SavedCollectionSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadSavesAdminFn({ data: input })
}

const adminSavedListSchema = z.object({ collectionId: z.string().uuid() })

const loadAdminSavedListFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(adminSavedListSchema)
  .handler(async ({ data, context }) => {
    const collection = await savedCollectionForWorkspace(
      await workspaceIdForRequest(context.user.id),
      data.collectionId
    )
    if (!collection) throw new Error("That saved list no longer exists.")
    return collection
  })

export function loadAdminSavedList(collectionId: string) {
  return loadAdminSavedListFn({ data: { collectionId } })
}

const adminRenameSavedListFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(adminSavedListSchema.extend({ name: z.string().max(80) }))
  .handler(async ({ data, context }) =>
    renameSaveCollectionAsAdmin(
      await workspaceIdForRequest(context.user.id),
      data.collectionId,
      data.name
    )
  )

export function adminRenameSavedList(collectionId: string, name: string) {
  return adminRenameSavedListFn({ data: { collectionId, name } })
}

const adminSetSavedListPublicFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(adminSavedListSchema.extend({ isPublic: z.boolean() }))
  .handler(async ({ data, context }) =>
    setSaveCollectionPublicAsAdmin(
      await workspaceIdForRequest(context.user.id),
      data.collectionId,
      data.isPublic
    )
  )

export function adminSetSavedListPublic(
  collectionId: string,
  isPublic: boolean
) {
  return adminSetSavedListPublicFn({ data: { collectionId, isPublic } })
}

const adminRemoveSavedItemFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(adminSavedListSchema.extend({ listingId: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    removeSavedItemAsAdmin(
      await workspaceIdForRequest(context.user.id),
      data.collectionId,
      data.listingId
    )
  )

export function adminRemoveSavedItem(collectionId: string, listingId: string) {
  return adminRemoveSavedItemFn({ data: { collectionId, listingId } })
}

const adminDeleteSavedListsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ collectionIds: z.array(z.string().uuid()).max(100) })
  )
  .handler(async ({ data, context }) =>
    deleteSaveCollectionsAsAdmin(
      await workspaceIdForRequest(context.user.id),
      data.collectionIds
    )
  )

export function adminDeleteSavedLists(collectionIds: string[]) {
  return adminDeleteSavedListsFn({ data: { collectionIds } })
}

export type {
  SaveCollectionState,
  SavedCollection,
  AdminSavedCollection,
  AdminSavedCollectionSummary,
} from "@/server/directory/saves"
