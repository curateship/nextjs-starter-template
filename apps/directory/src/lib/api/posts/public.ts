import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { visitorSite, type VisitorSite } from "@/server/directory/public"
import {
  readPublicPosts,
  readPublicPost,
  type PublicPostsPage,
  type PublicPostPage,
} from "@/server/posts/public"

/**
 * The public posts pages' two doors. Neither carries a guard, because a
 * public page that needs a session is not a public page; both are written
 * down in `src/app/open-endpoints.ts` with the reason.
 *
 * Each checks the Posts page's own switch before reading anything. The route
 * checks it too, but the route only decides what a browser draws, and anyone
 * can call these directly. A switched-off Posts page, or a members-only one
 * asked for by somebody signed out, answers null, the same as a page that
 * does not exist.
 */

async function siteWithOpenPosts(): Promise<VisitorSite | null> {
  const site = await visitorSite()
  if (!site) return null
  const visibility = await readPageVisibility(site.id, "/posts")
  if (visibility === "off") return null
  if (visibility === "members") {
    const viewer = await findCurrentUser().catch(() => null)
    if (!viewer) return null
  }
  return site
}

const readPostsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({ page: z.number().int().min(1).max(10_000).optional() })
  )
  .handler(async ({ data }): Promise<PublicPostsPage | null> => {
    const site = await siteWithOpenPosts()
    if (!site) return null
    return readPublicPosts(site, data.page ?? 1)
  })

/** One page of the visited site's published posts, newest first. */
export function loadPosts(page?: number) {
  return readPostsFn({ data: { page } })
}

const readPostFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ slug: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<PublicPostPage | null> => {
    const site = await siteWithOpenPosts()
    if (!site) return null
    return readPublicPost(site, data.slug)
  })

/** One published post by its address, or null if there is not one. */
export function loadPost(slug: string) {
  return readPostFn({ data: { slug } })
}

export type { PublicPostCard } from "@/server/posts/cards"
