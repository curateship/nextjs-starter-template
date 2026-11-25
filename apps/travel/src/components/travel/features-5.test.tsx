// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NewTripDialog } from "@/components/travel/new-trip-dialog"
import { PlacesMap, PlaceViewSwitch } from "@/components/travel/places-map"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SavedPlace } from "@/lib/api/travel/saved-places"
import { DEFAULT_TYPES, type ActivityType } from "@/lib/travel/activity-types"
import type { PlaceRow } from "@/lib/travel/trips-lists"

// The real map needs Google's script; this one draws each pin as a button, so a click can stand in for one.
vi.mock("@/components/travel/google-map", () => ({
  GoogleMap: ({ pins, onPick }: { pins: { id: string; title: string }[]; onPick: (id: string) => void }) => (
    <div data-testid="map">
      {pins.map((pin) => (
        <button key={pin.id} type="button" data-pin={pin.id} onClick={() => onPick(pin.id)}>
          {pin.title}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/lib/api/travel/trips", () => ({ makeTrip: vi.fn(async () => ({ id: "t1" })) }))

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** jsdom has no ResizeObserver, and New trip's fields measure themselves. */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, ResizeObserver: StubResizeObserver })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ""
})

const types: ActivityType[] = DEFAULT_TYPES.map((type, index) => ({ ...type, id: `type-${type.builtin}`, position: index }))

function saved(id: string, title: string, at: { lat: number; lng: number } | null): PlaceRow {
  const place: SavedPlace = {
    id,
    title,
    typeId: "type-food",
    place: at ? { name: title, address: `${title} street`, lat: at.lat, lng: at.lng, placeId: null } : null,
    website: null,
    menuUrl: null,
    phone: null,
    notes: "",
    photoUrl: null,
    photoCredit: null,
    createdAt: "2099-01-01T00:00:00.000Z",
    deletedAt: null,
  }
  return { kind: "saved", id, saved: place }
}

function draw(rows: PlaceRow[], onPick: (id: string) => void, empty: React.ReactNode = null) {
  act(() =>
    root.render(
      <TooltipProvider>
        <PlacesMap rows={rows} types={types} openId={undefined} empty={empty} onPick={onPick} />
      </TooltipProvider>
    )
  )
}

describe("Places on a map", () => {
  it("pins the places with a map position and lists the rest under the map", () => {
    const picked: string[] = []
    draw(
      [saved("a", "Okutan", { lat: 35.0, lng: 135.7 }), saved("b", "Ippudo", { lat: 35.6, lng: 139.7 }), saved("c", "Corner bar", null)],
      (id) => picked.push(id)
    )
    const pins = [...host.querySelectorAll("[data-pin]")].map((pin) => pin.getAttribute("data-pin"))
    expect(pins).toEqual(["a", "b"])
    expect(host.querySelector('[data-pin="a"]')?.textContent).toBe("Okutan, Okutan street")
    expect(host.textContent).toContain("Not on the map, with no address picked from Google")
    const unplaced = [...host.querySelectorAll("li button")]
    expect(unplaced.map((button) => button.textContent)).toEqual(["Corner bar"])

    act(() => (host.querySelector('[data-pin="b"]') as HTMLButtonElement).click())
    act(() => (unplaced[0] as HTMLButtonElement).click())
    expect(picked).toEqual(["b", "c"])
  })

  it("leaves the list under the map out when every place is pinned", () => {
    draw([saved("a", "Okutan", { lat: 35.0, lng: 135.7 })], () => {})
    expect(host.textContent).not.toContain("Not on the map")
  })

  it("shows the list's loading, failed or empty line instead of a map", () => {
    draw([], () => {}, "No places match that search.")
    expect(host.querySelector('[data-testid="map"]')).toBeNull()
    expect(host.textContent).toBe("No places match that search.")
  })
})

describe("Places' List and Map switch", () => {
  it("marks the view showing and hands back the one clicked", () => {
    const chosen: string[] = []
    act(() =>
      root.render(
        <TooltipProvider>
          <PlaceViewSwitch value="list" onChange={(next) => chosen.push(next)} />
        </TooltipProvider>
      )
    )
    const list = host.querySelector('[aria-label="Show as a list"]')!
    const map = host.querySelector('[aria-label="Show on a map"]') as HTMLButtonElement
    expect(list.getAttribute("aria-pressed")).toBe("true")
    expect(map.getAttribute("aria-pressed")).toBe("false")
    act(() => map.click())
    expect(chosen).toEqual(["map"])
  })
})

describe("New trip's currency", () => {
  it("opens on the currency it is handed, not US dollars", () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <NewTripDialog open usualCurrency="CAD" onClose={() => {}} />
        </TooltipProvider>
      )
    )
    expect(document.getElementById("new-trip-currency")?.textContent).toContain("CAD")
  })
})
