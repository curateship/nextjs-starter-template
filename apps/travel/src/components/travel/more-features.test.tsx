// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActivityCardContent } from "@/components/travel/activity-card"
import { DayOutlook } from "@/components/travel/day-weather"
import { DraftPlanDialog } from "@/components/travel/draft-plan-dialog"
import { SavedPlacesDialog } from "@/components/travel/saved-places-dialog"
import { TripProvider, type TripContextValue } from "@/components/travel/trip-context"
import { BudgetCard } from "@/components/travel/trip-budget-card"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { Activity, TripPage } from "@/lib/api/travel/trips"
import { DEFAULT_TYPES, type ActivityType } from "@/lib/travel/activity-types"

// The screens' server calls, answered here; the server side has its own tests.
vi.mock("@/lib/api/travel/saved-places", () => ({
  loadSavedPlaces: vi.fn(async () => []),
  loadGoAgain: vi.fn(async () => [
    { id: "a-ramen", title: "Fuunji", place: null, photoUrl: null, tripId: "trip-old", tripName: "Tokyo 2025", day: 2 },
  ]),
  addSavedPlace: vi.fn(),
  addGoAgain: vi.fn(async () => ({ id: "copy-1" })),
  changeSavedPlaceList: vi.fn(),
}))
vi.mock("@/lib/api/travel/trip-draft", () => ({
  draftPlan: vi.fn(async () => ({ items: [], days: [], skipped: [], later: 0 })),
  fillDay: vi.fn(async (_tripId: string, day: number) => ({
    items: [{ day, title: "Lunch at Okutan", typeId: null, startTime: "12:00", durationMinutes: 60 }],
    days: [day],
    skipped: [],
    later: 0,
  })),
  createPlan: vi.fn(),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...(props as object)}>{children}</a>,
}))

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ""
  window.localStorage.clear()
})

const types: ActivityType[] = DEFAULT_TYPES.map((type, index) => ({ ...type, id: `type-${type.builtin}`, position: index }))

function activity(patch: Partial<Activity>): Activity {
  return {
    id: "a1",
    tripId: "trip-1",
    day: 1,
    position: 0,
    title: "Kinkaku-ji",
    typeId: "type-sight",
    startTime: null,
    dayPart: null,
    durationMinutes: null,
    nights: null,
    place: null,
    openingHours: null,
    website: null,
    menuUrl: null,
    phone: null,
    notes: "",
    costCents: null,
    done: false,
    rating: null,
    goAgain: false,
    mustDo: false,
    photoUrl: null,
    photoCredit: null,
    updatedAt: new Date().toISOString(),
    ...patch,
  }
}

function tripPage(activities: Activity[]): TripPage {
  return {
    trip: {
      id: "trip-1",
      name: "Kyoto",
      destination: "Kyoto",
      days: 3,
      startDate: "2099-11-02",
      currency: "USD",
      timeZone: null,
      budgetCents: null,
      status: "planning",
      coverUrl: null,
      coverCredit: null,
      dayInfo: [],
      description: "",
      descriptionLocked: false,
      travelMode: "walk",
      tags: [],
      isSample: false,
      archived: false,
      hasCalendarLink: false,
    },
    activities,
    types,
    notes: [],
    binCount: 0,
    views: [],
    photos: [],
    beenHere: [],
  }
}

function withTrip(activities: Activity[], children: React.ReactNode) {
  const value: TripContextValue = {
    page: tripPage(activities),
    typesById: new Map(types.map((type) => [type.id, type])),
    refresh: async () => {},
    openActivity: () => {},
    openActivityId: undefined,
    readOnly: false,
    weather: { forecast: [], typical: [], holidays: [] },
    openTripNote: () => {},
    noteRequest: null,
  }
  return (
    <TooltipProvider>
      <TripProvider value={value}>{children}</TripProvider>
    </TooltipProvider>
  )
}

const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)))

/** Radix tabs switch on a mouse press, which jsdom only sends when asked. */
function press(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
  })
}

describe("the card (More Travel features parts 1 and 4)", () => {
  it("shows Google's rating, reviews and price, and the Must do flag", () => {
    const card = activity({
      mustDo: true,
      place: { name: "Kinkaku-ji", address: "Kyoto", lat: 35, lng: 135.7, placeId: "p", rating: 4.6, ratingCount: 2300, priceLevel: 2 },
    })
    act(() => root.render(<ActivityCardContent activity={card} type={types[3]} currency="USD" />))
    expect(host.textContent).toContain("Google 4.6 (2,300) · $$")
    expect(host.querySelector('[aria-label="Must do"]')).not.toBeNull()
  })

  it("shows neither on an older card", () => {
    act(() => root.render(<ActivityCardContent activity={activity({ place: { name: "x", address: "", lat: null, lng: null, placeId: null } })} type={null} currency="USD" />))
    expect(host.textContent).not.toContain("Google")
    expect(host.querySelector('[aria-label="Must do"]')).toBeNull()
  })
})

describe("a day's heading (More Travel features parts 7 and 8)", () => {
  it("shows the holiday and what a far-off day is usually like, and the forecast when there is one", () => {
    const weather = {
      forecast: [{ day: 1, high: 18, low: 9, kind: "clear" as const, rain: 70, hourlyRain: [] }],
      typical: [
        { day: 1, high: 20, low: 10, rainDays: 3 },
        { day: 2, high: 24, low: 15, rainDays: 8 },
      ],
      holidays: [{ day: 2, name: "Culture Day" }],
    }
    act(() => root.render(<DayOutlook weather={weather} day={2} />))
    expect(host.textContent).toContain("Culture Day")
    expect(host.textContent).toContain("Usually 24° / 15° · rain on 8 of 30 days")
    act(() => root.render(<DayOutlook weather={weather} day={1} />))
    expect(host.textContent).toContain("18° / 9° · 70% rain")
    expect(host.textContent).not.toContain("Usually")
  })
})

describe("the Budget block's money (More Travel features part 13)", () => {
  it("switches from By day to By type, biggest first", () => {
    const cards = [
      activity({ id: "h", day: 1, typeId: "type-hotel", costCents: 90000 }),
      activity({ id: "f1", day: 2, typeId: "type-food", costCents: 3000 }),
      activity({ id: "f2", day: 3, typeId: "type-food", costCents: 1200 }),
      activity({ id: "i", day: null, typeId: "type-sight", costCents: 5000 }),
    ]
    act(() => root.render(withTrip(cards, <BudgetCard />)))
    expect(host.textContent).toContain("Day 1 · Mon 2 Nov")
    press(host.querySelector('[role="tab"][id$="type"]')!)
    const text = host.textContent ?? ""
    expect(text).toContain("Hotel$900")
    expect(text).toContain("Food$42")
    expect(text.indexOf("Hotel")).toBeLessThan(text.indexOf("Food"))
    expect(text).not.toContain("Sight$50")
    expect(window.localStorage.getItem("travel-money-view")).toBe("type")
  })
})

describe("the Go again tab (More Travel features part 14)", () => {
  it("lists ticked places with their trip and day, with Add to trip from a trip", async () => {
    act(() => root.render(withTrip([], <SavedPlacesDialog open tripId="trip-1" onClose={() => {}} />)))
    await settle()
    press(document.querySelector('[role="tab"][id$="again"]')!)
    await settle()
    expect(document.body.textContent).toContain("Fuunji")
    expect(document.body.textContent).toContain("Tokyo 2025 · Day 2")
    expect(document.body.textContent).toContain("Add to trip")
  })
})

describe("Fill this day (More Travel features part 6)", () => {
  it("opens titled for its day and lists what fits", async () => {
    act(() =>
      root.render(
        withTrip([], <DraftPlanDialog open tripId="trip-1" startDate="2099-11-02" types={types} day={2} onClose={() => {}} onMade={async () => {}} />)
      )
    )
    await settle()
    expect(document.body.textContent).toContain("Fill Day 2")
    expect(document.body.textContent).toContain("free time on Day 2")
    expect((document.querySelector('input[aria-label="Name"]') as HTMLInputElement).value).toBe("Lunch at Okutan")
    expect(document.body.textContent).toContain("Create 1 activity")
  })
})
