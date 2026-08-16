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
  formatDirectoryNearPoint,
  parseDirectoryNearPoint,
  readDirectoryNearRadius,
  type DirectoryBrowseSearch,
  type DirectorySort,
} from "@/lib/directory/public-search"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
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
  validateSearch: (search: Record<string, unknown>): DirectoryBrowseSearch => {
    const point = parseDirectoryNearPoint(search.near)
    const near = point ? formatDirectoryNearPoint(point) : undefined
    const sort = readOneOf(search.sort, DIRECTORY_SORTS)
    return {
      // Every value is checked against a fixed list or a range, so a hand-edited
      // address can only ever fall back to the default.
      q: readSearchText(search.q),
      category: readSearchText(search.category),
      sort: sort === "distance" && !near ? undefined : sort,
      page: readPage(search.page),
      near,
      place: readSearchText(search.place),
      radius: readDirectoryNearRadius(search.radius),
    }
  },
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
        near: deps.near,
        place: deps.place,
        radius: deps.radius,
      }),
    ])

    if (!browse) throw notFound()
    return browse
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle(loaderData.browseTitle, loaderData.site.name),
      directoryDescription(
        loaderData.browseIntro,
        `Browse listings on ${loaderData.site.name}.`
      )
    )
  },
  component: DirectoryRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function DirectoryRoute() {
  const {
    site,
    listings,
    categories,
    total,
    page,
    pageSize,
    browseTitle,
    browseIntro,
    sort,
  } = Route.useLoaderData()
  const current = Route.useSearch()
  const navigate = Route.useNavigate()
  const setListSearch = (patch: Partial<DirectoryBrowseSearch>) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    })
  }

  // What the visitor asked for, in their own words. `category` is a slug in the
  // address, so it is turned back into the name they clicked.
  const categoryName = current.category
    ? (categories.find((row) => row.slug === current.category)?.name ??
      current.category)
    : null
  const anythingApplied = Boolean(current.q || current.category || current.near)

  /*
   * Two sentences, not one, and the difference is the whole point.
   *
   * With nothing applied the line describes the site: "5 listings on Alpha
   * Guide" is true and useful. With a search on, the same shape becomes a lie —
   * a search for something the site does not stock printed "0 listings on Alpha
   * Guide", which reads as "this directory is empty" to a visitor who then
   * leaves without seeing the five listings that are there.
   *
   * The search term is put in through JSX, so a term containing markup is drawn
   * as the characters somebody typed and can never be anything else.
   */
  const counted = total === 0 ? "No listings" : `${total} ${plural(total, "listing", "listings")}`
  const searchSummary = anythingApplied ? (
    <>
      {counted}
      {current.q ? <> matching “{current.q}”</> : null}
      {categoryName ? <> in {categoryName}</> : null}
      {current.near && !current.q && !categoryName ? <> nearby</> : null}
    </>
  ) : null

  return (
    <DirectoryFrame>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{browseTitle}</h1>
        {browseIntro ? (
          <p className="text-sm text-muted-foreground">{browseIntro}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {searchSummary ?? (
            <>
              {total} {plural(total, "listing", "listings")} on {site.name}
            </>
          )}
        </p>
      </header>

      <DirectoryToolbar
        current={current}
        sort={sort}
        categories={categories}
        // A new search or a new order starts at the beginning: page 4 of the
        // old list is nowhere in the new one.
        onSearchChange={(value) => setListSearch({ q: value, page: undefined })}
        onSortChange={(value: DirectorySort) =>
          setListSearch({ sort: value, page: undefined })
        }
        onNearChange={(near, place, radius) =>
          setListSearch({
            near,
            place,
            radius,
            sort: "distance",
            page: undefined,
          })
        }
        onRadiusChange={(radius) => setListSearch({ radius, page: undefined })}
        onClearAll={() =>
          setListSearch({
            q: undefined,
            category: undefined,
            near: undefined,
            place: undefined,
            radius: undefined,
            sort: undefined,
            page: undefined,
          })
        }
        onNearClear={() =>
          setListSearch({
            near: undefined,
            place: undefined,
            radius: undefined,
            sort: undefined,
            page: undefined,
          })
        }
      />

      <ListingGrid
        listings={listings}
        emptyMessage={
          current.near
            ? "Nothing is within that distance. Try a wider distance or a different location."
            : current.q || current.category
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
  if (search.near) parameters.set("near", search.near)
  if (search.place) parameters.set("place", search.place)
  if (search.radius) parameters.set("radius", String(search.radius))
  if (page > 1) parameters.set("page", String(page))
  const query = parameters.toString()
  return `/directory${query ? `?${query}` : ""}`
}
