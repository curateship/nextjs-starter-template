import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadDealsPage } from "@/lib/api/promotions/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { dealStage } from "@/lib/promotions/deal-days"
import { dealsListHref, readDealsSearch } from "@/lib/promotions/deals-page"

/**
 * The Deals page: every deal on now, then every deal starting on a later day.
 * A deal leaves by itself the morning after its last day, by the site's
 * calendar. It follows its own on/off switch on the Pages screen.
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
  // A page can hold the end of one group and the start of the next.
  const onNow = data.deals.filter(
    (deal) => dealStage(deal, data.today) === "on"
  )
  const comingUp = data.deals.filter(
    (deal) => dealStage(deal, data.today) === "soon"
  )

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[{ label: data.site.name, home: true }, { label: "Deals" }]}
      />
      <h1 className="text-2xl font-semibold">Deals</h1>

      {data.deals.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              {/* Past the last page is not the same as no deals at all. */}
              {data.total
                ? "There are no deals on this page."
                : "No deals are on right now. Check back soon."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {onNow.length ? (
        <section aria-labelledby="deals-on-now" className="grid gap-2 md:gap-3">
          <h2 id="deals-on-now" className="text-base font-semibold">
            On now
          </h2>
          <DealGrid deals={onNow} today={data.today} />
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
          <DealGrid deals={comingUp} today={data.today} />
        </section>
      ) : null}

      <DirectoryPagination
        page={data.page}
        pageSize={data.pageSize}
        total={data.total}
        hrefForPage={dealsListHref}
        label="Deal pages"
      />
    </DirectoryFrame>
  )
}
