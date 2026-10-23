import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// A real Link needs a router, and this is about the card's own layout.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params: { slug: string }
  } & React.ComponentProps<"a">) => (
    <a href={to.replace("$slug", params.slug)} {...rest}>
      {children}
    </a>
  ),
}))

import { EventCard } from "@/components/events/public/event-card"
import type { ListedEvent } from "@/lib/api/events/public"

const base: ListedEvent = {
  id: "event-1",
  title: "Toronto BBQ Festival",
  slug: "toronto-bbq-festival",
  summary:
    "A full day of smoked meats, live fire cooking and local pitmasters.",
  coverImage: "https://media.test/bbq.jpg",
  placeName: "Garrison Common, Fort York",
  startDate: "2026-10-04",
  startTime: "12:00",
  endDate: null,
  endTime: "20:00",
  takesSignUps: true,
  going: 212,
  category: { name: "Festival", slug: "festival" },
  ended: false,
}

describe("event card", () => {
  it("puts the date and the category over the photo", () => {
    const markup = renderToStaticMarkup(<EventCard event={base} />)

    expect(markup).toContain("OCT")
    expect(markup).toContain(">04<")
    expect(markup).toContain("Festival")
    expect(markup).toContain("12:00 PM to 8:00 PM")
    expect(markup).toContain("Garrison Common, Fort York")
    expect(markup).toContain("/api/v1/media/resized?src=")
  })

  it("shows the count and the RSVP button when sign-ups are open", () => {
    const markup = renderToStaticMarkup(<EventCard event={base} />)

    expect(markup).toContain("212 going")
    expect(markup).toContain("RSVP")
  })

  it("leaves the whole strip out when an event takes no sign-ups", () => {
    const markup = renderToStaticMarkup(
      <EventCard event={{ ...base, takesSignUps: false, going: 0 }} />
    )

    expect(markup).not.toContain("RSVP")
    expect(markup).not.toContain('data-slot="card-footer"')
  })

  it("says nothing about numbers until somebody has signed up", () => {
    const markup = renderToStaticMarkup(
      <EventCard event={{ ...base, going: 0 }} />
    )

    expect(markup).toContain("RSVP")
    expect(markup).not.toContain("going")
  })

  it("keeps the days on an event that runs over several of them", () => {
    const markup = renderToStaticMarkup(
      <EventCard event={{ ...base, endDate: "2026-10-06", endTime: "20:00" }} />
    )

    expect(markup).toContain("Sun, Oct 4, 12:00 PM to Tue, Oct 6, 8:00 PM")
  })

  it("keeps the date and the category on a card with no photo", () => {
    const markup = renderToStaticMarkup(
      <EventCard event={{ ...base, coverImage: "" }} />
    )

    expect(markup).not.toContain("<img")
    expect(markup).toContain("OCT")
    expect(markup).toContain("Festival")
  })
})
