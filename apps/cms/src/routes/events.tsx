import { createFileRoute, Link, notFound } from "@tanstack/react-router"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { DirectoryPagination } from "@/components/directory/public/directory-pagination"
import { EventList } from "@/components/events/public/event-list"
import { SubscribeMenu } from "@/components/events/public/calendar-menus"
import { EventMonth } from "@/components/events/public/event-month"
import { EventViewSwitch } from "@/components/events/public/event-view-switch"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadEventsPage } from "@/lib/api/events/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { parseYearMonth, toMonthString } from "@/lib/events/calendar-grid"
import { readEventsSearch } from "@/lib/events/events-page"
import { formatEventDay } from "@/lib/events/event-time"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * The Events page: what is coming up, as a list or a month. It opens on the
 * list. The view, the month and a chosen day all live in the address, so a
 * shared link opens the same view.
 */
export const Route = createFileRoute("/events")({
  validateSearch: readEventsSearch,
  loaderDeps: ({ search }) => search,
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
          />
        </div>
      </header>

      {data.view === "month" ? (
        <EventMonth
          month={data.month}
          events={data.events}
          today={data.today}
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
          <EventList
            events={data.events}
            emptyMessage="Nothing is on that day."
          />
        </>
      ) : (
        <>
          <EventList
            events={data.events}
            emptyMessage={
              // Past the last page is not the same as nothing coming up.
              data.total
                ? "There are no events on this page."
                : "Nothing is coming up yet."
            }
          />
          <DirectoryPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            hrefForPage={(next) =>
              next > 1 ? `/events?page=${next}` : "/events"
            }
            label="Event pages"
          />
        </>
      )}
    </DirectoryFrame>
  )
}
