import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  COLLECTION_NAME_REQUIRED_MESSAGE,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
  MEDIA_COLLECTION_NAME_MAX,
} from "@/lib/media-collections"
import type { MediaCollection } from "@/server/media-collections"

export type { MediaCollection }
export { MEDIA_COLLECTION_NAME_MAX }

const collectionIdSchema = z.object({
  collectionId: z.string().min(1).max(36),
})

const createSchema = z.object({
  name: z.string().min(1).max(MEDIA_COLLECTION_NAME_MAX),
})

const renameSchema = z.object({
  collectionId: z.string().min(1).max(36),
  name: z.string().min(1).max(MEDIA_COLLECTION_NAME_MAX),
})

const membershipSchema = z.object({
  collectionId: z.string().min(1).max(36),
  mediaIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const itemCollectionsSchema = z.object({
  mediaId: z.string().min(1).max(36),
  collectionIds: z.array(z.string().min(1).max(36)).max(50),
})

// Only messages the user can act on are passed through; anything else becomes
// the generic failure so internal errors never reach the screen.
const safeErrorMessages = new Set([
  COLLECTION_NAME_REQUIRED_MESSAGE,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
  "Media not found",
])

export function getMediaCollectionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Collection request failed."
  if (safeErrorMessages.has(error.message)) return error.message
  return "Collection request failed."
}

const listMediaCollectionsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<MediaCollection[]> => {
    const { requireUser } = await import("@/server/security")
    const { listOwnedCollections } = await import("@/server/media-collections")
    const user = await requireUser()
    return listOwnedCollections(user.id)
  }
)

const createMediaCollectionFn = createServerFn({ method: "POST" })
  .inputValidator(createSchema)
  .handler(async ({ data }): Promise<MediaCollection> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { createOwnedCollection } = await import("@/server/media-collections")
    requireAppOrigin()
    const user = await requireUser()
    return createOwnedCollection(user.id, data.name)
  })

const renameMediaCollectionFn = createServerFn({ method: "POST" })
  .inputValidator(renameSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { renameOwnedCollection } = await import("@/server/media-collections")
    requireAppOrigin()
    const user = await requireUser()
    await renameOwnedCollection(user.id, data.collectionId, data.name)
  })

const deleteMediaCollectionFn = createServerFn({ method: "POST" })
  .inputValidator(collectionIdSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { deleteOwnedCollection } = await import("@/server/media-collections")
    requireAppOrigin()
    const user = await requireUser()
    await deleteOwnedCollection(user.id, data.collectionId)
  })

const addMediaToCollectionFn = createServerFn({ method: "POST" })
  .inputValidator(membershipSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { addMediaToOwnedCollection } = await import(
      "@/server/media-collections"
    )
    requireAppOrigin()
    const user = await requireUser()
    return addMediaToOwnedCollection(user.id, data.collectionId, data.mediaIds)
  })

const removeMediaFromCollectionFn = createServerFn({ method: "POST" })
  .inputValidator(membershipSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { removeMediaFromOwnedCollection } = await import(
      "@/server/media-collections"
    )
    requireAppOrigin()
    const user = await requireUser()
    return removeMediaFromOwnedCollection(
      user.id,
      data.collectionId,
      data.mediaIds
    )
  })

const setMediaItemCollectionsFn = createServerFn({ method: "POST" })
  .inputValidator(itemCollectionsSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { requireUser } = await import("@/server/security")
    const { setMediaItemCollections } = await import(
      "@/server/media-collections"
    )
    requireAppOrigin()
    const user = await requireUser()
    await setMediaItemCollections(user.id, data.mediaId, data.collectionIds)
  })

export function listMediaCollections() {
  return listMediaCollectionsFn()
}

export function createMediaCollection(name: string) {
  return createMediaCollectionFn({ data: { name } })
}

export function renameMediaCollection(collectionId: string, name: string) {
  return renameMediaCollectionFn({ data: { collectionId, name } })
}

export function deleteMediaCollection(collectionId: string) {
  return deleteMediaCollectionFn({ data: { collectionId } })
}

export function addMediaToCollection(collectionId: string, mediaIds: string[]) {
  return addMediaToCollectionFn({ data: { collectionId, mediaIds } })
}

export function removeMediaFromCollection(
  collectionId: string,
  mediaIds: string[]
) {
  return removeMediaFromCollectionFn({ data: { collectionId, mediaIds } })
}

export function setMediaCollections(mediaId: string, collectionIds: string[]) {
  return setMediaItemCollectionsFn({ data: { mediaId, collectionIds } })
}
