import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// A real Link needs a router, and this is about the list's own layout.
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

import { EventList } from "@/components/events/public/event-list"
import type { ListedEvent } from "@/lib/api/events/public"

const trivia: ListedEvent = {
  id: "event-1",
  title: "Trivia night",
  slug: "trivia-night",
  summary: "",
  coverImage: "",
  placeName: "43 Down",
  startDate: "2026-11-26",
  startTime: "19:00",
  endDate: null,
  endTime: "22:00",
  takesSignUps: true,
  going: 0,
  full: false,
  scheduleStatus: "scheduled",
  category: { name: "Pub food", slug: "pub-food" },
  ended: false,
}

function event(fields: Partial<ListedEvent>): ListedEvent {
  return { ...trivia, ...fields }
}

/** The headings, in order, with the markup's tags taken out. */
function headings(markup: string) {
  return [...markup.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((match) => match[1])
}

describe("the Events page's list", () => {
  it("puts each month's events under its own heading", () => {
    const markup = renderToStaticMarkup(
      <EventList
        emptyMessage="Nothing"
        events={[
          trivia,
          event({ id: "2", startDate: "2026-12-01" }),
          event({ id: "3", startDate: "2026-12-03" }),
        ]}
      />
    )

    expect(headings(markup)).toEqual(["November 2026", "December 2026"])
    expect(markup).toContain(">THU<")
    expect(markup).toContain(">26<")
    expect(markup.replace(/\s/gu, " ")).toContain("7:00 – 10:00 PM")
    expect(markup).toContain("43 Down")
    expect(markup).toContain("Pub food")
    expect(markup).toContain("RSVP")
  })

  it("heads the featured events the server pins to the top Featured", () => {
    const markup = renderToStaticMarkup(
      <EventList
        emptyMessage="Nothing"
        events={[
          event({ id: "f", startDate: "2026-12-20", featured: true }),
          event({ id: "1", featured: false }),
          event({ id: "2", startDate: "2026-12-01", featured: false }),
        ]}
      />
    )

    expect(headings(markup)).toEqual(["Featured", "November 2026", "December 2026"])
  })

  it("labels a cancelled event and offers no RSVP", () => {
    const markup = renderToStaticMarkup(
      <EventList emptyMessage="Nothing" events={[event({ scheduleStatus: "cancelled" })]} />
    )

    expect(markup).toContain("Cancelled")
    expect(markup).not.toContain("RSVP")
  })

  it("says Full in place of RSVP, and the empty line with no events", () => {
    expect(
      renderToStaticMarkup(<EventList emptyMessage="Nothing" events={[event({ full: true })]} />)
    ).toContain(">Full<")
    expect(renderToStaticMarkup(<EventList emptyMessage="Nothing is on." events={[]} />)).toContain(
      "Nothing is on."
    )
  })
})

describe("one day's list", () => {
  it("has no month heading, because the day's own heading names it", () => {
    const markup = renderToStaticMarkup(
      <EventList byMonths={false} emptyMessage="Nothing" events={[trivia]} />
    )

    expect(headings(markup)).toEqual([])
    expect(markup).toContain("Trivia night")
  })
})
