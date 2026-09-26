// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/lib/api/directory/featured", () => ({
  loadEventFeaturedPurchase: vi.fn(),
  startEventFeaturedCheckout: vi.fn(),
  getFeaturedErrorMessage: String,
}))
vi.mock("@/lib/api/events/submissions", () => ({
  sendEventForMyListing: vi.fn(),
  getEventSubmissionErrorMessage: (error: unknown) => String(error),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

import { OwnerEventsCard } from "@/components/events/owner-events"
import type { OwnerEvent, OwnerEvents } from "@/lib/api/events/submissions"
import type { OwnedListing } from "@/lib/api/directory/claims"

/**
 * The views line under an owner's own event on My listings: both counts on a
 * published event, and nothing at all while it has no page.
 */

const listing = {
  claimId: "claim-1",
  listingId: "listing-1",
  title: "Café Luna",
  slug: "cafe-luna",
  metaDescription: "",
  featuredImage: "",
  status: "published",
  featured: { active: false, endsAt: null },
  contactLinks: { address: "", menuLinks: [], socialLinks: [] },
  body: { type: "doc", content: [] },
  siteName: "Alpha",
  siteId: "site-1",
  siteUrl: "https://alpha.example.test",
  badgesEnabled: false,
  pendingRequestId: null,
} as unknown as OwnedListing

function ownerEvent(overrides: Partial<OwnerEvent>): OwnerEvent {
  return {
    id: "submission-1",
    status: "approved",
    title: "Open mic",
    startDate: "2026-09-25",
    startTime: "20:00",
    endTime: "23:00",
    reviewNote: "",
    eventSlug: "open-mic",
    eventId: "event-1",
    featured: false,
    views: { recent: 12, all: 48 },
    createdAt: new Date("2026-09-20T12:00:00.000Z"),
    ...overrides,
  }
}

function owner(events: OwnerEvent[]): OwnerEvents {
  return {
    events: { "listing-1": events },
    sites: { "site-1": { eventsOn: true, today: "2026-09-24" } },
  }
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

async function show(events: OwnerEvent[]) {
  await act(async () =>
    root.render(<OwnerEventsCard listing={listing} owner={owner(events)} />)
  )
}

describe("an owner's view counts", () => {
  it("shows the last 30 days and all time on a published event", async () => {
    await show([ownerEvent({})])
    expect(host.textContent).toContain("12 views in 30 days · 48 all time")
  })

  it("says one view rather than 1 views", async () => {
    await show([ownerEvent({ views: { recent: 1, all: 1 } })])
    expect(host.textContent).toContain("1 view in 30 days · 1 all time")
  })

  it("shows 0 for a page nobody has opened yet", async () => {
    await show([ownerEvent({ views: { recent: 0, all: 0 } })])
    expect(host.textContent).toContain("0 views in 30 days · 0 all time")
  })

  it("shows no count at all while the event is still waiting", async () => {
    await show([
      ownerEvent({
        status: "pending",
        eventSlug: null,
        eventId: null,
        views: null,
      }),
    ])
    expect(host.textContent).toContain("Waiting for approval")
    expect(host.textContent).not.toContain("all time")
  })
})
