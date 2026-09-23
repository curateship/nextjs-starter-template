import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { LISTING_STATUS_FILTERS } from "@/lib/directory/listing-sort"
import { POST_SORT_COLUMNS, type PostSortColumn } from "@/lib/posts/post-sort"
import { adminGet, adminPost } from "@/server/guards"
import {
  categoryIdsFor,
  setContentCategories,
} from "@/server/directory/content-categories"
import {
  createPost,
  deletePosts,
  findPost,
  listingChoicesForBody,
  listPosts,
  MAX_POST_SUMMARY,
  MAX_POST_TITLE,
  searchListingChoices,
  updatePost,
  type SitePost,
  type ListingChoice,
  type PostStatus,
  type PostSummary,
} from "@/server/posts/posts"
import { POST_CONTENT_TYPE } from "@/server/posts/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { getListingErrorMessage } from "../directory/listings"

export type { SitePost, ListingChoice, PostSummary }

/**
 * The Posts screen's doors. All admin-only, and all work on the site the admin
 * has open, read on the server rather than sent by the page. The server's
 * refusals are sentences about what the admin typed, so they pass through.
 */
export const getPostErrorMessage = getListingErrorMessage

export type PostsPage = {
  posts: PostSummary[]
  total: number
  page: number
  pageSize: number
}

const idInput = z.string().min(1).max(36)

const loadPostsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      status: z.enum(LISTING_STATUS_FILTERS).optional(),
      sort: z.enum(POST_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<PostsPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const site = await workspaceIdForRequest(context.user.id)
    const { posts, total } = await listPosts(site, {
      search: data.search,
      status: data.status,
      sort: data.sort,
      direction: data.direction,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
    return { posts, total, page, pageSize }
  })

export function loadPostsPage(input: {
  search?: string
  status?: PostStatus
  sort?: PostSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadPostsPageFn({ data: input })
}

/** The editor's whole load: the post, its categories, and its cards' listings. */
export type PostForEdit = {
  post: SitePost
  categoryIds: string[]
  listings: ListingChoice[]
}

const loadPostForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<PostForEdit | null> => {
    const site = await workspaceIdForRequest(context.user.id)
    const [post, categoryIds] = await Promise.all([
      findPost(site, data.id),
      categoryIdsFor(site, POST_CONTENT_TYPE, data.id),
    ])
    if (!post) return null
    return {
      post,
      categoryIds,
      listings: await listingChoicesForBody(site, post.body),
    }
  })

export function loadPostForEdit(id: string) {
  return loadPostForEditFn({ data: { id } })
}

const createPostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      title: z.string().min(1).max(MAX_POST_TITLE),
      slug: z.string().max(160).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SitePost> => {
    return createPost(await workspaceIdForRequest(context.user.id), data)
  })

export function saveNewPost(input: { title: string; slug?: string }) {
  return createPostFn({ data: input })
}

const updatePostFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: idInput,
      title: z.string().min(1).max(MAX_POST_TITLE).optional(),
      slug: z.string().max(160).optional(),
      coverImage: z.string().max(600).optional(),
      summary: z.string().max(MAX_POST_SUMMARY).optional(),
      status: z.enum(["draft", "published"]).optional(),
      // A tree whose rule is "keep only what is allowed", which the server's
      // cleaner says better than a schema.
      body: z.unknown().optional(),
      categoryIds: z.array(idInput).max(50).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<SitePost> => {
    const { id, categoryIds, ...rest } = data
    const site = await workspaceIdForRequest(context.user.id)
    const post = await updatePost(site, id, rest)
    if (categoryIds !== undefined) {
      await setContentCategories(site, POST_CONTENT_TYPE, id, categoryIds)
    }
    return post
  })

export function savePost(input: {
  id: string
  title?: string
  slug?: string
  coverImage?: string
  summary?: string
  status?: PostStatus
  body?: unknown
  categoryIds?: string[]
}) {
  return updatePostFn({ data: input })
}

const deletePostsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(idInput).min(1).max(500) }))
  .handler(
    async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
      return deletePosts(await workspaceIdForRequest(context.user.id), data.ids)
    }
  )

/** One request for the whole selection; the result counts honestly. */
export function removePosts(ids: string[]) {
  return deletePostsFn({ data: { ids } })
}

const searchListingChoicesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ search: z.string().max(120) }))
  .handler(async ({ data, context }): Promise<ListingChoice[]> => {
    return searchListingChoices(
      await workspaceIdForRequest(context.user.id),
      data.search
    )
  })

/** This site's listings matching a title, for the editor's card picker. */
export function findListingChoices(search: string) {
  return searchListingChoicesFn({ data: { search } })
}
