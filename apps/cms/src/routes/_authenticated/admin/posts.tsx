import { createFileRoute } from "@tanstack/react-router"

import { PostsDashboard } from "@/components/posts/posts-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadCategories } from "@/lib/api/directory/categories"
import { getPostErrorMessage, loadPostsPage } from "@/lib/api/posts/posts"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import {
  LISTING_STATUS_FILTERS,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"
import { POST_SORT_COLUMNS, type PostSortColumn } from "@/lib/posts/post-sort"

type PostsSearch = {
  q?: string
  status?: ListingStatusFilter
  sort?: PostSortColumn
  direction?: "asc" | "desc"
  page?: number
  size?: number
  /** Which post's window is open, so a post can be linked to. */
  open?: string
}

/** The list's state lives in the address; anything unexpected falls back. */
function readPostsSearch(search: Record<string, unknown>): PostsSearch {
  return {
    q: readSearchText(search.q),
    status: readOneOf(search.status, LISTING_STATUS_FILTERS),
    sort: readOneOf(search.sort, POST_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(
      String(search.size),
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String)
    )
      ? Number(search.size)
      : undefined,
    ...readOpenSearch(search),
  }
}

export const Route = createFileRoute("/_authenticated/admin/posts")({
  validateSearch: readPostsSearch,
  // Everything except `open`: opening a post must not refetch the list.
  loaderDeps: ({ search: { open: _open, ...rest } }) => rest,
  // The category tree comes with the list, because a new post has no record
  // to bring it and the window needs it the moment it opens.
  loader: async ({ deps }) => {
    const [page, categories] = await Promise.all([
      loadPostsPage({
        search: deps.q,
        status: deps.status,
        sort: deps.sort,
        direction: deps.direction,
        page: deps.page,
        limit: deps.size,
      }),
      loadCategories(),
    ])
    return { page, categories }
  },
  component: AdminPostsRoute,
  errorComponent: routeErrorComponent(getPostErrorMessage),
})

function AdminPostsRoute() {
  const search = Route.useSearch()
  const { page, categories } = Route.useLoaderData()
  return <PostsDashboard data={page} categories={categories} search={search} />
}
