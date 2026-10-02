import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  SocialFeed,
  SocialFeedPage,
  SocialFeedScope,
  SocialFeedView,
  SocialFolder,
} from "@/lib/trade/social/feed"
import { userGet, userPost } from "@/server/guards"
import {
  loadSocialFeed,
  loadSocialFeedPage,
  loadSocialFeedView,
} from "@/server/trade/social-feed"
import {
  createSocialFolder,
  deleteSocialFolder,
  renameSocialFolder,
  saveSocialFolderOrder,
  setCreatorInFolder,
} from "@/server/trade/social-folders"

import { createErrorMessage } from "../error-message"

export type { SocialFeed, SocialFeedPage, SocialFeedView, SocialFolder }

/**
 * Every door onto the social feed and its folders.
 *
 * All of them carry a shared guard and hand the signed-in member's own id to
 * the database layer, which filters on it in the same `where` as the rows it
 * reads. A folder or creator id is never trusted: one belonging to somebody
 * else reads nothing and changes nothing.
 */

/**
 * What the feed is narrowed to. Ids are capped at a UUID's length rather than
 * checked for shape, because an id that matches nothing simply reads nothing.
 */
const scopeSchema = z.object({
  folderId: z.string().min(1).max(36).nullable(),
  creatorId: z.string().min(1).max(36).nullable(),
  coin: z
    .string()
    .max(20)
    .regex(/^[A-Za-z0-9]+$/)
    .nullable(),
})

const loadSocialFeedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }): Promise<SocialFeed> =>
    loadSocialFeed(context.user.id)
  )

const loadSocialFeedViewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(scopeSchema)
  .handler(({ data, context }): Promise<SocialFeedView> =>
    loadSocialFeedView(context.user.id, data)
  )

const pageSchema = scopeSchema.extend({
  /** The oldest post already on screen. */
  before: z.number().int().positive(),
})

const loadSocialFeedPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(pageSchema)
  .handler(({ data, context }): Promise<SocialFeedPage> =>
    loadSocialFeedPage(
      context.user.id,
      { folderId: data.folderId, creatorId: data.creatorId, coin: data.coin },
      data.before
    )
  )

const folderIdSchema = z.string().uuid()
const creatorIdSchema = z.string().min(1).max(36)

const createSocialFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z.string().max(80),
      creatorId: creatorIdSchema.optional(),
    })
  )
  .handler(({ data, context }): Promise<SocialFolder[]> =>
    createSocialFolder(context.user.id, data)
  )

const renameSocialFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ folderId: folderIdSchema, name: z.string().max(80) })
  )
  .handler(({ data, context }): Promise<SocialFolder[]> =>
    renameSocialFolder(context.user.id, data.folderId, data.name)
  )

const deleteSocialFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ folderId: folderIdSchema }))
  .handler(({ data, context }): Promise<SocialFolder[]> =>
    deleteSocialFolder(context.user.id, data.folderId)
  )

const setCreatorInFolderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      folderId: folderIdSchema,
      creatorId: creatorIdSchema,
      saved: z.boolean(),
    })
  )
  .handler(({ data, context }) => setCreatorInFolder(context.user.id, data))

const saveSocialFolderOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      folderIds: z.array(folderIdSchema).max(100),
      hiddenFolderIds: z.array(folderIdSchema).max(100),
    })
  )
  .handler(({ data, context }): Promise<SocialFolder[]> =>
    saveSocialFolderOrder(context.user.id, data)
  )

export function loadSocialFeedData() {
  return loadSocialFeedFn()
}

export function loadSocialFeedViewData(scope: SocialFeedScope) {
  return loadSocialFeedViewFn({ data: scope })
}

export function loadSocialFeedPageData(scope: SocialFeedScope, before: number) {
  return loadSocialFeedPageFn({ data: { ...scope, before } })
}

export function createCreatorFolder(input: {
  name: string
  creatorId?: string
}) {
  return createSocialFolderFn({ data: input })
}

export function renameCreatorFolder(folderId: string, name: string) {
  return renameSocialFolderFn({ data: { folderId, name } })
}

export function deleteCreatorFolder(folderId: string) {
  return deleteSocialFolderFn({ data: { folderId } })
}

export function setFolderCreator(input: {
  folderId: string
  creatorId: string
  saved: boolean
}) {
  return setCreatorInFolderFn({ data: input })
}

export function saveCreatorFolderOrder(input: {
  folderIds: string[]
  hiddenFolderIds: string[]
}) {
  return saveSocialFolderOrderFn({ data: input })
}

export const getSocialFolderErrorMessage = createErrorMessage(
  {
    "Give the folder a name": "Give the folder a name.",
    "Folder names can be at most 80 characters":
      "Folder names can be at most 80 characters.",
    "You already have a folder with that name":
      "You already have a folder with that name.",
    "You can have at most 100 folders of creators":
      "You can have at most 100 folders of creators.",
    "That folder no longer exists": "That folder no longer exists.",
    "That creator is not one you track": "That creator is not one you track.",
    "That folder arrangement could not be saved":
      "That folder arrangement could not be saved. Reload the page and try it again.",
  },
  "That folder change did not save. Try it again."
)

export const getSocialFeedErrorMessage = createErrorMessage(
  {},
  "The feed could not be read. Try again."
)
