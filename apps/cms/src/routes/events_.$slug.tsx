import * as React from "react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { CalendarIcon, MapPinIcon, NavigationIcon } from "lucide-react"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { JsonLd } from "@/components/directory/public/json-ld"
import { ReportProblemButton } from "@/components/directory/public/report-problem-button"
import { AddToCalendarMenu } from "@/components/events/public/calendar-menus"
import { EventPlaceMap } from "@/components/events/public/event-place-map"
import { PostBody } from "@/components/posts/public/post-body"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadEvent } from "@/lib/api/events/public"
import { eventDirectionsUrl } from "@/lib/events/directions"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
  eventJsonLd,
  eventPageShareImage,
} from "@/lib/directory/public-seo"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * One event's page at /events/<address>. It follows the Events page's on/off
 * switch. A private event's page opens the same way, for anyone with the link.
 *
 * No such address, a draft, and another site's event all answer the same
 * not-found page, so a draft cannot be told apart from an event never written.
 */
export const Route = createFileRoute("/events_/$slug")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      requirePageVisible("/events"),
      loadEvent(params.slug),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { event, site, shareImageVersion } = loaderData
    const head = directoryHead(
      directoryTitle(event.title, site.name),
      directoryDescription(event.summary, `${event.title} on ${site.name}.`),
      eventPageShareImage({
        coverImage: event.coverImage,
        siteUrl: site.url,
        slug: event.slug,
        version: shareImageVersion,
      })
    )
    // A private event is for people sent the link, so search engines are
    // asked not to list it. Its preview card still works for that link.
    return event.isPrivate
      ? {
          ...head,
          meta: [...head.meta, { name: "robots", content: "noindex" }],
        }
      : head
  },
  component: EventRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function EventRoute() {
  const {
    site,
    event,
    listingCards,
    ended,
    when,
    timeZone,
    shareImageVersion,
    mapKey,
  } = Route.useLoaderData()
  const directions = ended ? null : eventDirectionsUrl(event)
  const shareImage = eventPageShareImage({
    coverImage: event.coverImage,
    siteUrl: site.url,
    slug: event.slug,
    version: shareImageVersion,
  })
  const jsonLd = eventJsonLd({
    ...event,
    siteName: site.name,
    siteUrl: site.url,
    timeZone,
    image: typeof shareImage === "string" ? shareImage : shareImage.url,
  })

  return (
    <DirectoryFrame>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <DirectoryBreadcrumbs
        crumbs={[
          { label: site.name, home: true },
          { label: "Events", events: true },
          { label: event.title },
        ]}
      />

      {ended ? (
        <Card>
          <CardContent>
            <p role="status" className="text-sm font-medium">
              This event has ended
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        {event.coverImage ? (
          <img
            src={event.coverImage}
            alt=""
            className="aspect-[3/1] w-full object-cover"
          />
        ) : null}
        <CardContent className="grid gap-4">
          <header className="grid gap-1">
            <h1 className="text-2xl font-semibold">{event.title}</h1>
            {event.categories.length ? (
              <p className="text-xs text-muted-foreground">
                {event.categories.map((category, index) => (
                  <React.Fragment key={category.slug}>
                    {index > 0 ? " · " : null}
                    <Link
                      to="/directory/category/$slug"
                      params={{ slug: category.slug }}
                      search={{}}
                      className={`rounded-sm hover:text-foreground hover:underline ${focusRing}`}
                    >
                      {category.name}
                    </Link>
                  </React.Fragment>
                ))}
              </p>
            ) : null}
            {event.summary ? (
              <p className="text-sm text-muted-foreground">{event.summary}</p>
            ) : null}
          </header>

          <div className="grid gap-2 text-sm">
            <p className="flex items-start gap-2">
              <CalendarIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="grid min-w-0">
                <span className="font-medium">{when.day}</span>
                <span className="text-muted-foreground">{when.times}</span>
              </span>
            </p>
            {event.placeName || event.placeAddress ? (
              <p className="flex items-start gap-2">
                <MapPinIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="grid min-w-0">
                  {event.placeName && event.placeListingSlug ? (
                    <Link
                      to="/directory/$slug"
                      params={{ slug: event.placeListingSlug }}
                      className={`w-fit rounded-sm font-medium hover:underline ${focusRing}`}
                    >
                      {event.placeName}
                    </Link>
                  ) : event.placeName ? (
                    <span className="font-medium">{event.placeName}</span>
                  ) : null}
                  {event.placeAddress ? (
                    <span className="text-muted-foreground">
                      {event.placeAddress}
                    </span>
                  ) : null}
                </span>
              </p>
            ) : null}
          </div>

          {mapKey && event.position ? (
            <EventPlaceMap
              apiKey={mapKey}
              position={event.position}
              placeName={event.placeName}
            />
          ) : null}

          {ended ? null : (
            <div className="flex flex-wrap gap-2">
              <AddToCalendarMenu
                event={{ ...event, url: `${site.url}/events/${event.slug}` }}
                timeZone={timeZone}
              />
              {directions ? (
                <Button asChild variant="outline" className="w-fit">
                  <a href={directions} target="_blank" rel="noopener noreferrer">
                    <NavigationIcon aria-hidden="true" />
                    Directions
                  </a>
                </Button>
              ) : null}
            </div>
          )}

          {event.body.content?.length ? (
            <PostBody body={event.body} listingCards={listingCards} />
          ) : null}

          {/* Last, and shown after the event is over too: an event that says
              it ended yesterday when it is really next week is exactly what
              a visitor needs to be able to report. A div, so the link stays
              its own width in the card's grid. */}
          <div>
            <ReportProblemButton
              kind="event"
              subjectId={event.id}
              title={event.title}
            />
          </div>
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
