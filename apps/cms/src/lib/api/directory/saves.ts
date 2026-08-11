import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { adminGet, userGet, userPost } from "@/server/guards"
import {
  createSaveCollection,
  mostSavedListings,
  savedCollectionsForUser,
  saveStateFor,
  setListingSaved,
} from "@/server/directory/saves"
import {
  visitorWorkspaceId,
  workspaceIdForRequest,
} from "@/server/workspaces/for-request"

export function getSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
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
    listingIdSchema.extend({ collectionId: z.string().uuid(), saved: z.boolean() })
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
    setListingSaved(data.workspaceId, context.user.id, { ...data, saved: false })
  )

export function removeFromSaved(input: {
  workspaceId: string
  collectionId: string
  listingId: string
}) {
  return removeFromSavedFn({ data: input })
}

const loadMostSavedFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) =>
    mostSavedListings(await workspaceIdForRequest(context.user.id))
  )

export function loadMostSaved() {
  return loadMostSavedFn()
}

export type { SaveCollectionState, SavedCollection } from "@/server/directory/saves"
