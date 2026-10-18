import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  createCollection,
  deleteCollection,
  listCollections,
  loadCollection,
  renameCollection,
  setStarred,
  starredIn,
  type StarredVideo,
  type ViralCollectionSummary,
} from "@/server/video/viral/collections"
import { PROJECT_FOLDER_NAME_MAX } from "@/lib/video/project-folders"

/**
 * Favourites: the star on every video and the collections it fills. Admin
 * only, like the rest of Viral. Starring is free and downloads nothing.
 */

export type { StarredVideo, ViralCollectionSummary }

const id = z.string().min(1).max(36)
const name = z.string().min(1).max(PROJECT_FOLDER_NAME_MAX)
const count = z.number().int().min(0).max(1e13).nullable()

const starredVideo = z.object({
  platform: z.enum(["youtube", "tiktok", "instagram"]),
  platformVideoId: z.string().min(1).max(100),
  url: z.string().min(1).max(2048),
  title: z.string().max(1000),
  channelId: z.string().max(100),
  channelName: z.string().max(500),
  subscribers: count,
  views: count,
  likes: count,
  comments: count,
  postedAt: z.string().max(40).nullable(),
  durationSeconds: z.number().int().min(0).max(1e7).nullable(),
  thumbnailUrl: z.string().max(2048).nullable(),
})

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const [collections, starred] = await Promise.all([
      listCollections(context.user.id),
      starredIn(context.user.id),
    ])
    return { collections, starred }
  })

/** Every collection, and which of them each starred video is in. */
export function loadFavourites() {
  return listFn()
}

const createFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name }))
  .handler(async ({ data, context }) => createCollection(context.user.id, data.name))

export function createViralCollection(collectionName: string) {
  return createFn({ data: { name: collectionName } })
}

const renameFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ collectionId: id, name }))
  .handler(async ({ data, context }) => {
    await renameCollection(context.user.id, data.collectionId, data.name)
  })

export function renameViralCollection(collectionId: string, collectionName: string) {
  return renameFn({ data: { collectionId, name: collectionName } })
}

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ collectionId: id }))
  .handler(async ({ data, context }) => {
    await deleteCollection(context.user.id, data.collectionId)
  })

export function deleteViralCollection(collectionId: string) {
  return deleteFn({ data: { collectionId } })
}

const starFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      collectionId: id,
      videos: z.array(starredVideo).min(1).max(100),
      starred: z.boolean(),
      sourceProjectId: id.nullable(),
    })
  )
  .handler(async ({ data, context }) => ({
    changed: await setStarred(
      context.user.id,
      data.collectionId,
      data.videos,
      data.starred,
      data.sourceProjectId
    ),
  }))

/** Stars videos into a collection, or takes them out, in one request. */
export function setViralStar(input: {
  collectionId: string
  videos: StarredVideo[]
  starred: boolean
  sourceProjectId: string | null
}) {
  return starFn({ data: input })
}

const collectionFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ collectionId: id }))
  .handler(async ({ data, context }) => {
    const [opened, collections] = await Promise.all([
      loadCollection(context.user.id, data.collectionId),
      listCollections(context.user.id),
    ])
    return { ...opened, collections }
  })

/** One collection's videos, scored on this read, plus the list to switch to. */
export function loadViralCollection(collectionId: string) {
  return collectionFn({ data: { collectionId } })
}
