import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  COLLECTION_NAME_REQUIRED_MESSAGE,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
} from "@/lib/video/media-collections"
import { userGet, userPost } from "@/server/guards"
import {
  addMediaToOwnedCollection,
  createOwnedCollection,
  deleteOwnedCollection,
  listOwnedCollections,
  removeMediaFromOwnedCollection,
  renameOwnedCollection,
  setMediaItemCollections,
  type MediaCollectionSummary,
} from "@/server/video/media-collections"
import {
  listVideoMedia as listVideoMediaQuery,
  type VideoMediaItem,
  type VideoMediaListResponse,
} from "@/server/video/media-list"

export type { MediaCollectionSummary, VideoMediaItem, VideoMediaListResponse }

/**
 * The studio's media endpoints: the library list with this app's extras
 * (playback proxies, filmstrips, collections) and the collection operations.
 * Everything is per-person — `userGet`/`userPost`, never admin — because a
 * collection is one editor's shelf, not a site-wide fixture.
 */

const KNOWN_MESSAGES = new Set([
  COLLECTION_NAME_REQUIRED_MESSAGE,
  COLLECTION_NAME_TAKEN_MESSAGE,
  COLLECTION_NOT_FOUND_MESSAGE,
  "Media not found",
])

export function getVideoMediaErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Media request failed."
}

const listVideoMediaSchema = z
  .object({
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    search: z.string().trim().max(120).default(""),
    fileType: z.enum(["image", "video"]).optional(),
    // Absent = no filter; null = "Uncollected"; an id = that collection.
    collectionId: z.string().min(1).max(36).nullish(),
  })
  .optional()

const collectionIdSchema = z.object({
  collectionId: z.string().min(1).max(36),
})

const collectionNameSchema = z.object({
  name: z.string().min(1).max(200),
})

const renameSchema = collectionIdSchema.extend({
  name: z.string().min(1).max(200),
})

const membershipSchema = collectionIdSchema.extend({
  mediaIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const itemCollectionsSchema = z.object({
  mediaId: z.string().min(1).max(36),
  collectionIds: z.array(z.string().min(1).max(36)).max(50),
})

const listVideoMediaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listVideoMediaSchema)
  .handler(async ({ data, context }) => {
    return listVideoMediaQuery({
      userId: context.user.id,
      page: data?.page ?? 1,
      pageSize: data?.pageSize ?? 24,
      search: data?.search,
      fileType: data?.fileType,
      collectionId: data?.collectionId,
    })
  })

const listCollectionsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    return listOwnedCollections(context.user.id)
  })

const createCollectionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(collectionNameSchema)
  .handler(async ({ data, context }) => {
    return createOwnedCollection(context.user.id, data.name)
  })

const renameCollectionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(renameSchema)
  .handler(async ({ data, context }) => {
    await renameOwnedCollection(context.user.id, data.collectionId, data.name)
  })

const deleteCollectionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(collectionIdSchema)
  .handler(async ({ data, context }) => {
    await deleteOwnedCollection(context.user.id, data.collectionId)
  })

const addToCollectionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(membershipSchema)
  .handler(async ({ data, context }) => {
    return addMediaToOwnedCollection(
      context.user.id,
      data.collectionId,
      data.mediaIds
    )
  })

const removeFromCollectionFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(membershipSchema)
  .handler(async ({ data, context }) => {
    return removeMediaFromOwnedCollection(
      context.user.id,
      data.collectionId,
      data.mediaIds
    )
  })

const setMediaCollectionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(itemCollectionsSchema)
  .handler(async ({ data, context }) => {
    await setMediaItemCollections(
      context.user.id,
      data.mediaId,
      data.collectionIds
    )
  })

export function listVideoMedia({
  page = 1,
  pageSize = 24,
  search,
  fileType,
  collectionId,
}: {
  page?: number
  pageSize?: number
  search?: string
  fileType?: "image" | "video"
  collectionId?: string | null
} = {}) {
  return listVideoMediaFn({
    data: { page, pageSize, search, fileType, collectionId },
  })
}

export function listMediaCollections() {
  return listCollectionsFn()
}

export function createMediaCollection(name: string) {
  return createCollectionFn({ data: { name } })
}

export function renameMediaCollection(collectionId: string, name: string) {
  return renameCollectionFn({ data: { collectionId, name } })
}

export function deleteMediaCollection(collectionId: string) {
  return deleteCollectionFn({ data: { collectionId } })
}

export function addMediaToCollection(collectionId: string, mediaIds: string[]) {
  return addToCollectionFn({ data: { collectionId, mediaIds } })
}

export function removeMediaFromCollection(
  collectionId: string,
  mediaIds: string[]
) {
  return removeFromCollectionFn({ data: { collectionId, mediaIds } })
}

export function setMediaCollections(mediaId: string, collectionIds: string[]) {
  return setMediaCollectionsFn({ data: { mediaId, collectionIds } })
}
