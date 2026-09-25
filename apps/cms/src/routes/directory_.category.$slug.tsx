import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import {
  DirectoryBreadcrumbs,
  type Crumb,
} from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryFilterRail } from "@/components/directory/public/directory-filter-rail"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ListingGrid } from "@/components/directory/public/listing-grid"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { CategoryGrid } from "@/components/directory/public/category-grid"
import { EventCardGrid } from "@/components/events/public/event-card"
import { PostGrid } from "@/components/posts/public/post-grid"
import { loadDirectoryCategory } from "@/lib/api/directory/public"
import { requirePageVisible } from "@/lib/api/content/pages"
import {
  categoryJsonLd,
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { focusRing } from "@/lib/layout/focus-ring"
import {
  formatDirectoryCategories,
  readDirectoryCategories,
  readDirectoryMinRating,
  toggleDirectoryCategory,
} from "@/lib/directory/public-search"
import { readPage } from "@/lib/nav/list-search"

/**
 * One category: what it is, the categories under it, its listings, the
 * soonest events filed under it, and the newest posts filed under it.
 *
 * **Its own listings, never its children's.** A listing put in "Italian" does
 * not appear under "Restaurants" as well — that is what the directory app this
 * is ported from does, and rolling children up would put a listing on a page
 * nobody ever assigned it to. The subcategories are drawn as links instead, so
 * a visitor can walk down to them.
 */
export const Route = createFileRoute("/directory_/category/$slug")({
  // The page number, and the rail's filters. No search box and no order
  // control — a category page is one shelf, in the order an admin arranged it
  // — but the boxes down the left narrow it the same way they narrow the
  // browse page. Every value is optional, so a plain link to a category does
  // not have to spell any of them out.
  validateSearch: (
    search: Record<string, unknown>
  ): { page?: number; category?: string; minRating?: number } => ({
    page: readPage(search.page),
    category: formatDirectoryCategories(
      readDirectoryCategories(search.category)
    ),
    minRating: readDirectoryMinRating(search.minRating),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    // Follows the directory's own switch, like a listing page does.
    const [, page] = await Promise.all([
      requirePageVisible("/directory"),
      loadDirectoryCategory({
        slug: params.slug,
        page: deps.page,
        category: deps.category,
        minRating: deps.minRating,
      }),
    ])

    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle(loaderData.category.name, loaderData.site.name),
      directoryDescription(
        loaderData.category.metaDescription,
        loaderData.category.description,
        `${loaderData.category.name} on ${loaderData.site.name}.`
      ),
      loaderData.category.featuredImage
    )
  },
  component: CategoryRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function CategoryRoute() {
  const {
    site,
    category,
    filterGroups,
    ancestors,
    children,
    listings,
    total,
    page,
    pageSize,
    browseTitle,
    posts,
    upcomingEvents,
    categoryDeals,
  } = Route.useLoaderData()
  const events = upcomingEvents?.events ?? []
  const current = Route.useSearch()
  const navigate = Route.useNavigate()
  const ticked = readDirectoryCategories(current.category)
  const setListSearch = (patch: {
    category?: string
    minRating?: number
    page?: number
  }) => {
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
    })
  }

  const crumbs: Crumb[] = [
    { label: site.name, home: true },
    { label: browseTitle },
    // `ancestors` ends with this category itself, so the last one is the page
    // you are on and the breadcrumb draws it as plain text.
    ...ancestors.map((step) => ({
      label: step.name,
      categorySlug: step.slug,
    })),
  ]

  return (
    <DirectoryFrame>
      <JsonLd
        data={categoryJsonLd({
          siteName: site.name,
          siteUrl: site.url,
          name: category.name,
          slug: category.slug,
          // When a meta description exists, this is the exact sentence in
          // the page's meta tag. With none, keep today's structured markup.
          description: category.metaDescription
            ? directoryDescription(category.metaDescription)
            : category.description,
        })}
      />

      <DirectoryBreadcrumbs crumbs={crumbs} />

      {/*
       * Picture beside the words rather than a band across the top, which is
       * how the old site draws a neighbourhood. A category with no picture
       * keeps the plain heading — a lone column of text in the right-hand 60%
       * of the page would look like a mistake.
       */}
      <header
        className={
          category.featuredImage
            ? "grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8"
            : "flex flex-col gap-1"
        }
      >
        {category.featuredImage ? (
          <img
            src={category.featuredImage}
            alt=""
            className="aspect-[4/3] w-full rounded-xl object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{category.name}</h1>
          {category.description ? (
            <p className="text-sm text-muted-foreground">
              {category.description}
            </p>
          ) : null}
        </div>
      </header>

      {children.length ? (
        <section className="grid gap-2 md:gap-3" aria-labelledby="explore">
          <h2 id="explore" className="text-lg font-semibold">
            Explore {category.name}
          </h2>
          <CategoryGrid categories={children} />
        </section>
      ) : null}

      {categoryDeals.length ? (
        <section className="grid gap-2 md:gap-3" aria-labelledby="deals">
          <h2 id="deals" className="text-lg font-semibold">
            Deals in {category.name}
          </h2>
          <DealGrid deals={categoryDeals} />
        </section>
      ) : null}

      {/*
       * The same rail as the browse page, minus this category's own group:
       * every listing here is already in this category, so a box for it could
       * only narrow the page to itself or empty it.
       */}
      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
        <DirectoryFilterRail
          groups={filterGroups}
          selected={ticked}
          minRating={current.minRating}
          onToggleCategory={(slug) =>
            setListSearch({
              category: toggleDirectoryCategory(current.category, slug),
              page: undefined,
            })
          }
          onMinRatingChange={(minRating) =>
            setListSearch({ minRating, page: undefined })
          }
          onClearAll={
            ticked.length || current.minRating
              ? () =>
                  setListSearch({
                    category: undefined,
                    minRating: undefined,
                    page: undefined,
                  })
              : undefined
          }
        />

        <div className="flex min-w-0 flex-col gap-2 md:gap-3">
          {/* A category holding only posts or events skips the "nothing here"
              card, which would be untrue with them right below it. */}
          {listings.length || (!posts.length && !events.length) ? (
            <ListingGrid
              listings={listings}
              emptyMessage={
                ticked.length || current.minRating
                  ? "Nothing here matches those filters. Try fewer of them."
                  : children.length
                    ? "Choose a subcategory above to see its listings."
                    : `There is nothing in ${category.name} yet.`
              }
            />
          ) : null}

          <DirectoryPagination
            page={page}
            pageSize={pageSize}
            total={total}
            hrefForPage={(next) => categoryPageHref(category.slug, current, next)}
          />
        </div>
      </div>

      {upcomingEvents && events.length ? (
        <section className="grid gap-2 md:gap-3" aria-labelledby="events">
          <div className="grid gap-1">
            <h2 id="events" className="text-lg font-semibold">
              Upcoming events in {category.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              All times are {upcomingEvents.zone}.
            </p>
          </div>
          <EventCardGrid
            // Only events still to come are read here, so none is over.
            events={events.map((event) => ({ ...event, ended: false }))}
            emptyMessage=""
          />
          {upcomingEvents.total > events.length ? (
            <Link
              to="/events"
              search={{ category: category.slug }}
              className={`w-fit rounded-sm text-sm font-medium hover:underline ${focusRing}`}
            >
              All upcoming events in {category.name}
            </Link>
          ) : null}
        </section>
      ) : null}

      {posts.length ? (
        <section className="grid gap-2 md:gap-3" aria-labelledby="posts">
          <h2 id="posts" className="text-lg font-semibold">
            Posts about {category.name}
          </h2>
          <PostGrid posts={posts} siteName={site.name} emptyMessage="" />
        </section>
      ) : null}
    </DirectoryFrame>
  )
}

/**
 * A page link that keeps the boxes ticked. A pager that dropped them would
 * send a visitor from page 2 of a narrowed list to page 2 of the whole
 * category, which is not the list they were reading.
 */
function categoryPageHref(
  slug: string,
  search: { category?: string; minRating?: number },
  page: number
) {
  const parameters = new URLSearchParams()
  if (search.category) parameters.set("category", search.category)
  if (search.minRating) parameters.set("minRating", String(search.minRating))
  if (page > 1) parameters.set("page", String(page))
  const query = parameters.toString()
  return `/directory/category/${encodeURIComponent(slug)}${query ? `?${query}` : ""}`
}
