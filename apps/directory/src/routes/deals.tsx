import { createFileRoute, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFilterBar } from "@/components/directory/public/directory-filter-bar"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { DealWhenFilters } from "@/components/promotions/public/deal-filters"
import { DealGrid } from "@/components/promotions/public/deal-grid"
import { DealsHero } from "@/components/promotions/public/deals-hero"
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
  DEFAULT_DIRECTORY_NEAR_RADIUS_KM,
  readDirectoryCategories,
  toggleDirectoryCategory,
} from "@/lib/directory/public-search"
import { pageGutter } from "@/lib/layout/shell-gutter"
import {
  DEAL_ON_FILTER_LABELS,
  dealsListHref,
  readDealsSearch,
  type DealOnFilter,
  type DealsPageSearch,
} from "@/lib/promotions/deals-page"

/**
 * The Deals page: one grid of what is on, the ones inside their days first and
 * the ones starting later after them. Each card says where it stands, worked
 * out by the server from the site's clock. A deal leaves by itself once its
 * last day, or its last night past midnight, is over. It follows its own
 * on/off switch on the Pages screen.
 *
 * The page is built like the directory's browse page and the Events page: a
 * band at the top holding the name and one search bar, then a row of chips and
 * filter buttons, then the cards. Tyler asked for that shape on 1 Oct 2026, to
 * a drawing.
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
  const search = Route.useLoaderDeps()
  const navigate = Route.useNavigate()
  // What the server found, not what was typed. Keys in one order, so the
  // server and the browser write the same links.
  const current: DealsPageSearch = {
    q: search.q,
    category: search.category,
    on: data.on ?? undefined,
    near: data.nearby.near,
    radius: data.nearby.radius,
    area: data.nearby.area,
  }
  const ticked = readDirectoryCategories(current.category)
  const filtered = Boolean(
    current.q || ticked.length || current.on || current.near
  )
  // A box in the band or in the row writes to the address and starts the list
  // again, because page 3 of the old list is nowhere in the new one.
  const setSearch = (patch: Partial<DealsPageSearch>) =>
    void navigate({ search: { ...current, page: undefined, ...patch } })

  return (
    <DirectoryFrame
      hero={
        <DealsHero
          crumbs={
            <DirectoryBreadcrumbs
              inBand
              crumbs={[
                { label: data.site.name, home: true },
                { label: "Deals" },
              ]}
            />
          }
          intro={`Current offers from places on ${data.site.name}.`}
          current={current}
          radius={current.radius ?? DEFAULT_DIRECTORY_NEAR_RADIUS_KM}
          onSearchChange={(value) => setSearch({ q: value || undefined })}
          onNearChange={(near, area, radius) =>
            setSearch({ near, radius, area })
          }
          onRadiusChange={(radius) => setSearch({ radius })}
          onNearClear={() =>
            setSearch({ near: undefined, radius: undefined, area: undefined })
          }
        />
      }
    >
      {/*
       * The chips and the filter buttons sit the same distance from the cards
       * under them as from the band over them. The band's distance is the
       * site's own spacing from Settings → Styling, so this reads the same
       * number and takes off the 12px the page column already puts between
       * every two blocks.
       */}
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        style={{ marginBottom: `calc(${pageGutter} - 0.75rem)` }}
      >
        <DealWhenFilters current={current} counts={data.whenCounts} />
        <DirectoryFilterBar
          groups={data.filterGroups}
          selected={ticked}
          onToggleCategory={(slug) =>
            setSearch({ category: toggleDirectoryCategory(current.category, slug) })
          }
        />
      </div>

      {data.deals.length ? (
        <DealGrid deals={data.deals} />
      ) : (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              {/* Past the last page is not the same as no deals at all. */}
              {data.total
                ? "There are no deals on this page."
                : filtered
                  ? nothingMatches(
                      current.q,
                      data.tickedNames,
                      data.on,
                      eventNearText(current)
                    )
                  : "No deals are on right now. Check back soon."}
            </p>
          </CardContent>
        </Card>
      )}

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
 * The empty card's words for a narrowed list, naming what it was narrowed by:
 * "Nothing ending soon matching "lunch" in Pizza within 2 km of your
 * location."
 */
function nothingMatches(
  typed: string | undefined,
  tickedNames: string[],
  on: DealOnFilter | null,
  nearText: string
): string {
  return [
    on ? `Nothing ${DEAL_ON_FILTER_LABELS[on].toLowerCase()}` : "No deals",
    typed ? ` matching "${typed}"` : "",
    tickedNames.length ? ` in ${tickedNames.join(", ")}` : "",
    nearText ? ` ${nearText}` : "",
    ".",
  ].join("")
}
