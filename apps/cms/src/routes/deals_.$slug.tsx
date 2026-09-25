import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { CalendarIcon, ClockIcon, MapPinIcon } from "lucide-react"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadDeal } from "@/lib/api/promotions/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { focusRing } from "@/lib/layout/focus-ring"
import { shownHeadline } from "@/lib/promotions/deal-headline"

/**
 * One deal's page at /deals/<address>. It follows the Deals page's on/off
 * switch. An ended deal's page still opens, says so, and has no code.
 *
 * No such address, a draft, a deal at a draft listing and another site's deal
 * all answer the same not-found page, so none can be told apart from a deal
 * never written.
 */
export const Route = createFileRoute("/deals_/$slug")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/deals"),
      loadDeal(params.slug),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { deal, site } = loaderData
    return directoryHead(
      directoryTitle(deal.title, site.name),
      directoryDescription(
        deal.description,
        `${deal.title} at ${deal.listingTitle}.`
      ),
      deal.coverImage || deal.listingImage
    )
  },
  component: DealRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function DealRoute() {
  const { site, deal, ended, upcoming, days, times, nowText } =
    Route.useLoaderData()
  const photo = deal.coverImage || deal.listingImage

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[
          { label: site.name, home: true },
          { label: "Deals", deals: true },
          { label: deal.title },
        ]}
      />

      {ended ? (
        <Card>
          <CardContent>
            <p role="status" className="text-sm font-medium">
              This deal has ended
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        {photo ? (
          <img
            src={photo}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
        ) : null}
        <CardContent className="grid gap-4">
          <header className="grid gap-1">
            <p className="text-3xl leading-tight font-bold wrap-anywhere">
              {shownHeadline(deal.headline)}
            </p>
            <h1 className="text-2xl font-semibold">{deal.title}</h1>
          </header>

          <div className="grid gap-2 text-sm">
            <p className="flex items-start gap-2">
              <CalendarIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="grid min-w-0">
                <span className="font-medium">{days}</span>
                {upcoming ? (
                  <span className="text-muted-foreground">
                    Not on yet
                  </span>
                ) : null}
              </span>
            </p>
            {times.length || nowText ? (
              <p className="flex items-start gap-2">
                <ClockIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="grid min-w-0">
                  {times.map((line) => (
                    <span key={line} className="font-medium">
                      {line}
                    </span>
                  ))}
                  {nowText ? (
                    <span className="text-muted-foreground">{nowText}</span>
                  ) : null}
                </span>
              </p>
            ) : null}
            <p className="flex items-start gap-2">
              <MapPinIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="grid min-w-0">
                {deal.listingSlug ? (
                  <Link
                    to="/directory/$slug"
                    params={{ slug: deal.listingSlug }}
                    className={`w-fit rounded-sm font-medium hover:underline ${focusRing}`}
                  >
                    {deal.listingTitle}
                  </Link>
                ) : (
                  <span className="font-medium">{deal.listingTitle}</span>
                )}
                {deal.listingAddress ? (
                  <span className="text-muted-foreground">
                    {deal.listingAddress}
                  </span>
                ) : null}
              </span>
            </p>
          </div>

          {deal.description ? (
            <p className="text-sm whitespace-pre-line">{deal.description}</p>
          ) : null}

          {/* The server sends no code once the deal has ended. */}
          {deal.code ? (
            <div className="grid w-fit max-w-full gap-1 rounded-md border px-4 py-3">
              <span className="text-xs text-muted-foreground">Code</span>
              <span className="font-mono text-lg font-semibold break-all select-all">
                {deal.code}
              </span>
            </div>
          ) : null}

          {deal.smallPrint ? (
            <section aria-labelledby="deal-small-print" className="grid gap-1">
              <h2
                id="deal-small-print"
                className="text-xs font-medium text-muted-foreground"
              >
                Small print
              </h2>
              <p className="text-xs whitespace-pre-line text-muted-foreground">
                {deal.smallPrint}
              </p>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
