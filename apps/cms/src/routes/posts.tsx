import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { PostGrid } from "@/components/posts/public/post-grid"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadPosts } from "@/lib/api/posts/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { readPage } from "@/lib/nav/list-search"

/**
 * The Posts page: this site's published posts, newest first, a page at a time.
 * Drafts are never selected, so they are not on any page of it.
 */
export const Route = createFileRoute("/posts")({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: readPage(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [, list] = await Promise.all([
      requirePageVisible("/posts"),
      loadPosts(deps.page),
    ])
    if (!list) throw notFound()
    return list
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Posts", loaderData.site.name),
      directoryDescription(`The latest posts from ${loaderData.site.name}.`)
    )
  },
  component: PostsRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function PostsRoute() {
  const { site, posts, total, page, pageSize } = Route.useLoaderData()

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[{ label: site.name, home: true }, { label: "Posts" }]}
      />
      <header>
        <h1 className="text-2xl font-semibold">Posts</h1>
      </header>
      <PostGrid
        posts={posts}
        emptyMessage={
          // Past the last page is not the same as no posts at all.
          total
            ? "There are no posts on this page."
            : "Nothing has been posted yet."
        }
      />
      <DirectoryPagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefForPage={(next) => (next > 1 ? `/posts?page=${next}` : "/posts")}
        label="Post pages"
      />
    </DirectoryFrame>
  )
}
