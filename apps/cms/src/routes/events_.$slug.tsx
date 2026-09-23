import * as React from "react"
import {
  createFileRoute,
  isRedirect,
  Link,
  notFound,
  redirect,
} from "@tanstack/react-router"
import { CalendarIcon, MapPinIcon } from "lucide-react"

import { DirectoryBreadcrumbs } from "@/components/directory/public/directory-breadcrumbs"
import { DirectoryRouteError } from "@/components/directory/public/directory-error"
import { DirectoryFrame } from "@/components/directory/public/directory-frame"
import { PostBody } from "@/components/posts/public/post-body"
import { Card, CardContent } from "@/components/ui/card"
import { requirePageVisible } from "@/lib/api/content/pages"
import { loadEvent } from "@/lib/api/events/public"
import {
  directoryDescription,
  directoryHead,
  directoryTitle,
} from "@/lib/directory/public-seo"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * One event's page at /events/<address>. It follows the Events page's on/off
 * switch.
 *
 * No such address, a draft, and another site's event all answer the same
 * not-found page, so a draft cannot be told apart from an event never written.
 */
export const Route = createFileRoute("/events_/$slug")({
  loader: async ({ params }) => {
    const [, page] = await Promise.all([
      // A members-only switch sends a signed-out visitor to sign in and back
      // to the switch's own address. /events has no list yet, so they are
      // sent back to this event instead.
      requirePageVisible("/events").catch((error: unknown) => {
        if (!isRedirect(error)) throw error
        throw redirect({
          to: "/login",
          search: { redirect: `/events/${params.slug}` },
        })
      }),
      loadEvent(params.slug),
    ])
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const { event, site } = loaderData
    return directoryHead(
      directoryTitle(event.title, site.name),
      directoryDescription(event.summary, `${event.title} on ${site.name}.`),
      event.coverImage
    )
  },
  component: EventRoute,
  // A visitor must never be shown the server's own words for a failure.
  errorComponent: DirectoryRouteError,
})

function EventRoute() {
  const { site, event, listingCards, ended, when } = Route.useLoaderData()

  return (
    <DirectoryFrame>
      <DirectoryBreadcrumbs
        crumbs={[{ label: site.name, home: true }, { label: event.title }]}
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
                  {event.placeName ? (
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

          {event.body.content?.length ? (
            <PostBody body={event.body} listingCards={listingCards} />
          ) : null}
        </CardContent>
      </Card>
    </DirectoryFrame>
  )
}
