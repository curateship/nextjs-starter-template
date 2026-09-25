import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { DealFilters } from "@/components/promotions/public/deal-filters"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadDealsPage } from "@/lib/api/promotions/public"
import { eventNearText } from "@/lib/events/events-page"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import {
  DEAL_ON_FILTER_LABELS,
  dealsListHref,
  readDealsSearch,
  type DealOnFilter,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"

/**
 * The Deals page: every deal inside its days, then every deal starting on a
 * later day. Each card says "On now" or when it is next on, worked out by the
 * server from the site's clock. A deal leaves by itself once its last day, or
 * its last night past midnight, is over. It follows its own on/off switch on
 * the Pages screen.
 */
export const Route = createFileRoute("/deals")({
  validateSearch: readDealsSearch,
  loaderDeps: ({ search }) => readDealsSearch(search),
  loader: async ({ deps }) => {
    const [, data] = await Promise.all([
      requirePageVisible("/deals"),
      loadDealsPage(deps),
    ])
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Deals", loaderData.site.name),
      directoryDescription(`Deals on now at ${loaderData.site.name}.`)
    )
  },
  component: DealsRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function DealsRoute() {
  const data = Route.useLoaderData()
  // What the server found, not what was typed: a category that has no live
  // deal here is left out of every link, the same as it is left out of the
  // list. Keys in one order, so the server and the browser write the same links.
  const current: DealsPageSearch = {
    category: data.category?.slug,
    on: data.on ?? undefined,
    near: data.nearby.near,
    radius: data.nearby.radius,
    area: data.nearby.area,
  }
  const filtered = Boolean(current.category || current.on || current.near)
  // A page can hold the end of one group and the start of the next.
  const currentDeals = data.deals.filter((deal) => deal.stage === "on")
  const comingUp = data.deals.filter((deal) => deal.stage === "soon")

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[{ label: data.site.name, home: true }, { label: "Deals" }]}
      />
      <h1 className="text-2xl font-semibold">Deals</h1>
      <DealFilters current={current} categories={data.categories} />

      {data.deals.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              {/* Past the last page is not the same as no deals at all. */}
              {data.total
                ? "There are no deals on this page."
                : filtered
                  ? nothingMatches(data.category?.name, data.on, eventNearText(current))
                  : "No deals are on right now. Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {currentDeals.length ? (
        <section
          aria-labelledby="deals-current"
          className="grid gap-2 md:gap-3"
        >
          <h2 id="deals-current" className="text-base font-semibold">
            Current deals
          </h2>
          <DealGrid deals={currentDeals} />
        </section>
      ) : null}

      {comingUp.length ? (
        <section
          aria-labelledby="deals-coming-up"
          className="grid gap-2 md:gap-3"
        >
          <h2 id="deals-coming-up" className="text-base font-semibold">
            Starting soon
          </h2>
          <DealGrid deals={comingUp} />
        </section>
      ) : null}

      <DirectoryPagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        hrefForPage={(page) => dealsListHref({ ...current, page })}
        label="Deal pages"
      />
    </DirectoryFrame>
  )
}

/**
 * The empty card's words for a narrowed list, naming what it was narrowed
 * by: "Nothing on now in Pizza within 2 km of your location."
 */
function nothingMatches(
  categoryName: string | undefined,
  on: DealOnFilter | null,
  nearText: string
): string {
  return [
    on ? `Nothing ${DEAL_ON_FILTER_LABELS[on].toLowerCase()}` : "No deals",
    categoryName ? ` in ${categoryName}` : "",
    nearText ? ` ${nearText}` : "",
    ".",
  ].join("")
}
