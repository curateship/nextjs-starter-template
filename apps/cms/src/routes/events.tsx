import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { EventFilters } from "@/components/events/public/event-filters"
import { EventCardGrid } from "@/components/events/public/event-card"
import { SubscribeMenu } from "@/components/events/public/calendar-menus"
import { EventMonth } from "@/components/events/public/event-month"
import { EventViewSwitch } from "@/components/events/public/event-view-switch"
import { Button } from "@/components/ui/button"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadEventsPage } from "@/lib/api/events/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { parseYearMonth, toMonthString } from "@/lib/events/calendar-grid"
import {
  eventDateFilterText,
  eventNearText,
  eventsListHref,
  readEventsSearch,
  type EventDateSearch,
  type EventsPageSearch,
} from "@/lib/events/events-page"
import { formatEventDay } from "@/lib/events/event-time"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The Events page: what is coming up, as a list or a month. It opens on the
 * list. The view, the month, a chosen day and the filters all live in the
 * address, so a shared link opens the same view.
 */
export const Route = createFileRoute("/events")({
  validateSearch: readEventsSearch,
  // Read again, because the router keeps address words the reader dropped,
  // like `?when=someday`, beside the ones it returned. Passed on as they are,
  // the endpoint refuses them and the visitor gets an error page.
  loaderDeps: ({ search }) => readEventsSearch(search),
  loader: async ({ deps }) => {
    const [, data] = await Promise.all([
      requirePageVisible("/events"),
      loadEventsPage(deps),
    ])
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    return directoryHead(
      directoryTitle("Events", loaderData.site.name),
      directoryDescription(`What is on at ${loaderData.site.name}.`)
    )
  },
  component: EventsRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function EventsRoute() {
  const data = Route.useLoaderData()
  const search = Route.useLoaderDeps()
  // What the server found, not what was typed: a category or a place that is
  // not here is left out of every link, the same as it is left out of the list.
  // Every key is named in one order, because a link's address is written in
  // its keys' order, and an order taken from the address can differ between
  // the server and the browser, which then disagree about every chip's link.
  const current: EventsPageSearch = {
    view: search.view,
    month: search.month,
    day: search.day,
    page: search.page,
    place: data.view === "list" ? data.place?.slug : undefined,
    category: data.category?.slug,
    when: search.when,
    from: search.from,
    to: search.to,
    near: data.view === "list" ? data.nearby.near : undefined,
    radius: data.view === "list" ? data.nearby.radius : undefined,
    area: data.view === "list" ? data.nearby.area : undefined,
  }
  const categoryName = data.category?.name

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[{ label: data.site.name, home: true }, { label: "Events" }]}
      />
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">
            All times are {data.zone}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.canSuggest ? (
            <Button asChild variant="outline">
              <Link to="/add-event">
                <PlusIcon />
                Suggest an event
              </Link>
            </Button>
          ) : null}
          {data.calendarFeedUrl ? (
            <SubscribeMenu feedUrl={data.calendarFeedUrl} />
          ) : null}
          <EventViewSwitch
            current={data.view}
            month={
              data.view === "list" && data.day
                ? toMonthString(parseYearMonth(data.day)!)
                : undefined
            }
            category={current.category}
          />
        </div>
      </header>

      <EventFilters
        current={current}
        categories={data.categories}
        showListFilters={data.view === "list" && !data.day}
      />

      {data.view === "month" ? (
        <EventMonth
          month={data.month}
          events={data.events}
          today={data.today}
          category={data.category}
        />
      ) : data.day ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">
              {formatEventDay(data.day)}
            </h2>
            <Link
              to="/events"
              search={{}}
              className={`rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline ${focusRing}`}
            >
              All upcoming events
            </Link>
          </div>
          <EventCardGrid
            events={data.events}
            emptyMessage={
              categoryName
                ? `Nothing in ${categoryName} is on that day.`
                : "Nothing is on that day."
            }
          />
        </>
      ) : (
        <>
          {data.place ? (
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                At{" "}
                {data.place.linked ? (
                  <Link
                    to="/directory/$slug"
                    params={{ slug: data.place.slug }}
                    search={{}}
                    className={`rounded-sm hover:underline ${focusRing}`}
                  >
                    {data.place.title}
                  </Link>
                ) : (
                  data.place.title
                )}
              </h2>
              <Link
                to="/events"
                search={{}}
                className={`rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline ${focusRing}`}
              >
                All upcoming events
              </Link>
            </div>
          ) : null}
          <EventCardGrid
            events={data.events}
            emptyMessage={
              // Past the last page is not the same as nothing coming up.
              data.total
                ? "There are no events on this page."
                : nothingComingUp(
                    data.dates,
                    categoryName,
                    data.place?.title,
                    eventNearText(data.nearby)
                  )
            }
          />
          <DirectoryPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            hrefForPage={(next) =>
              eventsListHref({
                place: current.place,
                category: current.category,
                ...data.dates,
                ...data.nearby,
                page: next,
              })
            }
            label="Event pages"
          />
        </>
      )}
    </DirectoryFrame>
  )
}

/**
 * The upcoming list's empty card, naming what it was narrowed by:
 * "Nothing is on this weekend in Live music at The Rex within 5 km of
 * Toronto.", or "Nothing is coming up yet." with no filter at all.
 */
function nothingComingUp(
  dates: EventDateSearch,
  categoryName: string | undefined,
  placeTitle: string | undefined,
  nearText: string
): string {
  const when = eventDateFilterText(dates)
  const filtered = when || categoryName || placeTitle || nearText
  return [
    when ? `Nothing is on ${when}` : "Nothing is coming up",
    categoryName ? ` in ${categoryName}` : "",
    placeTitle ? ` at ${placeTitle}` : "",
    nearText ? ` ${nearText}` : "",
    filtered ? "." : " yet.",
  ].join("")
}
