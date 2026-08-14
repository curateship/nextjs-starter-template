import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { DirectoryToolbar } from "@/components/directory/public/directory-toolbar"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { loadDirectoryBrowse } from "@/lib/api/directory/public"
import { plural } from "@/lib/format/plural"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  DIRECTORY_SORTS,
  type DirectoryBrowseSearch,
  type DirectorySort,
} from "@/lib/directory/public-search"
import { directoryDescription, directoryHead, directoryTitle } from "@/lib/directory/public-seo"
import { readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

/**
 * The public directory: one page of a site's published listings, with a search
 * box, category chips and an order.
 *
 * Which site's listings is never asked here. The endpoint reads the domain on
 * the server, so `alpha.example.com/directory` and `beta.example.com/directory`
 * are the same route showing different content, and neither can be talked into
 * showing the other's.
 *
 * Nothing at all comes back when the address belongs to no site, and that is a
 * dead link rather than an empty directory.
 */
export const Route = createFileRoute("/directory")({
  validateSearch: (search: Record<string, unknown>): DirectoryBrowseSearch => ({
    // Every value is checked against a fixed list or a range, so a hand-edited
    // address can only ever fall back to the default.
    q: readSearchText(search.q),
    category: readSearchText(search.category),
    sort: readOneOf(search.sort, DIRECTORY_SORTS),
    page: readPage(search.page),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    // An admin can switch the directory off or make it members-only, the same
    // as any other public page. Asked alongside the list rather than before
    // it: the answer has to arrive before the page draws, not before it starts
    // fetching, and a hidden page rejects here with nothing it fetched shown.
    const [, browse] = await Promise.all([
      requirePageVisible("/directory"),
      loadDirectoryBrowse({
        search: deps.q,
        category: deps.category,
        sort: deps.sort,
        page: deps.page,
      }),
    ])

    if (!browse) throw notFound()
    return browse
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Directory", loaderData.site.name),
      directoryDescription(`Browse listings on ${loaderData.site.name}.`)
    )
  },
  component: DirectoryRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function DirectoryRoute() {
  const { site, listings, categories, total, page, pageSize } =
    Route.useLoaderData()
  const current = Route.useSearch()
  const navigate = Route.useNavigate()
  const setListSearch = (patch: Partial<DirectoryBrowseSearch>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    })
  }

  return (
    <DirectoryFrame>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Directory</h1>
        <p className="text-sm text-muted-foreground">
          {total} {plural(total, "listing", "listings")} on {site.name}
        </p>
      </header>

      <DirectoryToolbar
        current={current}
        categories={categories}
        // A new search or a new order starts at the beginning: page 4 of the
        // old list is nowhere in the new one.
        onSearchChange={(value) => setListSearch({ q: value, page: undefined })}
        onSortChange={(value: DirectorySort) =>
          setListSearch({ sort: value, page: undefined })
        }
      />

      <ListingGrid
        listings={listings}
        emptyMessage={
          current.q || current.category
            ? "Nothing matches that. Try a different search or category."
            : "There is nothing in this directory yet."
        }
      />

      <DirectoryPagination
        page={page}
        pageSize={pageSize}
        total={total}
        hrefForPage={(next) => directoryPageHref(current, next)}
      />
    </DirectoryFrame>
  )
}

function directoryPageHref(search: DirectoryBrowseSearch, page: number) {
  const parameters = new URLSearchParams()
  if (search.q) parameters.set("q", search.q)
  if (search.category) parameters.set("category", search.category)
  if (search.sort) parameters.set("sort", search.sort)
  if (page > 1) parameters.set("page", String(page))
  const query = parameters.toString()
  return `/directory${query ? `?${query}` : ""}`
}
