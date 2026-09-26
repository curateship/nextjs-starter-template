// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const router = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => router.navigate,
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api/events/events", () => ({
  copyEvent: vi.fn(),
  removeEvents: vi.fn(),
  getEventErrorMessage: (error: unknown) => String(error),
}))
// The window loads its own record and has nothing to do with the column.
vi.mock("@/components/events/event-dialog", () => ({
  EventDialog: () => null,
}))

import { EventsDashboard } from "@/components/events/events-dashboard"
import type { EventSummary, EventsPage } from "@/lib/api/events/events"

/**
 * The Views column on Admin → Events: the number on each row, the heading the
 * chosen range gives it, and what clicking the heading puts in the address.
 */

function event(title: string, slug: string, views: number): EventSummary {
  return {
    id: slug,
    title,
    slug,
    coverImage: "",
    summary: "",
    status: "published",
    visibility: "public",
    featured: false,
    publishedAt: new Date("2026-09-01T12:00:00.000Z"),
    listingId: null,
    placeName: "",
    placeAddress: "",
    position: null,
    locatedFor: null,
    repeat: null,
    seriesId: null,
    editedAlone: false,
    sourceUrl: "",
    takesSignUps: false,
    seats: null,
    startDate: "2026-09-26",
    startTime: "18:00",
    endDate: null,
    endTime: null,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    updatedAt: new Date("2026-09-02T12:00:00.000Z"),
    categories: [],
    seriesDates: { total: 0, upcoming: 0 },
    featuredNow: false,
    views,
  }
}

const page: EventsPage = {
  events: [
    event("Night market", "night-market", 1234),
    event("Quiz", "quiz", 0),
  ],
  total: 2,
  page: 1,
  pageSize: 50,
}

let host: HTMLDivElement
let root: Root

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function show(search: Parameters<typeof EventsDashboard>[0]["search"]) {
  await act(async () =>
    root.render(<EventsDashboard data={page} categories={[]} search={search} />)
  )
}

function sortButton(label: string) {
  return Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label
  )
}

describe("the Views column", () => {
  it("shows each event's count, grouped in thousands", async () => {
    await show({})
    expect(sortButton("Views")).toBeDefined()
    expect(host.textContent).toContain("1,234")
    expect(host.textContent).toContain("0")
  })

  it("names the range in the heading when 30 days is chosen", async () => {
    await show({ days: 30 })
    expect(sortButton("30-day views")).toBeDefined()
    expect(sortButton("Views")).toBeUndefined()
  })

  it("asks the address to sort by views, biggest first, from page 1", async () => {
    await show({})
    await act(async () => sortButton("Views")!.click())
    expect(router.navigate).toHaveBeenCalledTimes(1)
    const call = router.navigate.mock.calls[0]![0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ page: 3 })).toEqual({
      sort: "views",
      direction: "desc",
    })
  })

  it("flips to smallest first on a second click of the same heading", async () => {
    await show({ sort: "views", direction: "desc" })
    await act(async () => sortButton("Views")!.click())
    const call = router.navigate.mock.calls[0]![0] as {
      search: (previous: Record<string, unknown>) => Record<string, unknown>
    }
    expect(call.search({ sort: "views", direction: "desc" })).toEqual({
      sort: "views",
      direction: "asc",
    })
  })
})
