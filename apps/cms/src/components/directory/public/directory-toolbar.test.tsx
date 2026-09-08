// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/directory/public", () => ({ findDirectoryPlace: vi.fn() }))
import { findDirectoryPlace } from "@/lib/api/directory/public"
import { DirectoryToolbar } from "@/components/directory/public/directory-toolbar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { DirectoryBrowseSearch } from "@/lib/directory/public-search"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const onRadiusChange = vi.fn()

function Toolbar({ initial = {} }: { initial?: DirectoryBrowseSearch }) {
  const [current, setCurrent] = useState(initial)
  return (
    <TooltipProvider>
      <DirectoryToolbar
        current={current}
        sort="order"
        categories={[]}
        mapAvailable={false}
        onSearchChange={vi.fn()}
        onSortChange={vi.fn()}
        onNearChange={(near, place, radius) => setCurrent({ near, place, radius })}
        onRadiusChange={onRadiusChange}
        onNearClear={() => setCurrent({})}
        onClearAll={() => setCurrent({})}
      />
    </TooltipProvider>
  )
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function radius() {
  return host.querySelector<HTMLButtonElement>("#directory-radius")!
}
function button(label: string) {
  return Array.from(host.querySelectorAll("button")).find(item => item.textContent === label)!
}
async function searchPlace() {
  await act(async () => {
    const input = host.querySelector<HTMLInputElement>("#directory-place")!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Toronto")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => button("Search place").click())
}

describe("directory radius", () => {
  it("disables radius without a place and explains why to keyboard users", async () => {
    await act(async () => root.render(<Toolbar />))
    expect(radius().disabled).toBe(true)
    await act(async () => radius().click())
    expect(onRadiusChange).not.toHaveBeenCalled()
    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }))
      radius().closest<HTMLElement>('[data-slot="tooltip-trigger"]')!.focus()
    })
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe("Pick a location first.")
  })

  it("allows radius changes for an existing place and disables again after clearing", async () => {
    await act(async () => root.render(<Toolbar initial={{ near: "43.653,-79.383", place: "Toronto" }} />))
    expect(radius().disabled).toBe(false)
    await act(async () => radius().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })))
    const option = Array.from(document.querySelectorAll('[role="option"]')).find(item => item.textContent === "50 km")!
    expect(option).toBeDefined()
    await act(async () => option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
    expect(onRadiusChange).toHaveBeenCalledExactlyOnceWith(50)
    await act(async () => button("Clear location").click())
    expect(radius().disabled).toBe(true)
  })

  it("enables immediately after a successful place search", async () => {
    vi.mocked(findDirectoryPlace).mockResolvedValue({ place: { latitude: 43.653, longitude: -79.383, label: "Toronto" }, error: null })
    await act(async () => root.render(<Toolbar />))
    expect(radius().disabled).toBe(true)
    await searchPlace()
    expect(findDirectoryPlace).toHaveBeenCalledWith("Toronto")
    expect(radius().disabled).toBe(false)
    expect(host.textContent).toContain("within 10 km of Toronto")
  })

  it("stays disabled after a failed place search", async () => {
    vi.mocked(findDirectoryPlace).mockRejectedValue(new Error("unavailable"))
    await act(async () => root.render(<Toolbar />))
    await searchPlace()
    expect(radius().disabled).toBe(true)
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("We could not look up that place")
    expect(onRadiusChange).not.toHaveBeenCalled()
  })

  it("waits for geolocation success before enabling", async () => {
    let found!: PositionCallback
    vi.stubGlobal("navigator", Object.create(navigator, {
      geolocation: { value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => { found = success }),
      } },
    }))
    await act(async () => root.render(<Toolbar />))
    await act(async () => button("Use my location").click())
    expect(radius().disabled).toBe(true)
    await act(async () => found({ coords: { latitude: 43.653, longitude: -79.383 } } as GeolocationPosition))
    expect(radius().disabled).toBe(false)
  })
})
