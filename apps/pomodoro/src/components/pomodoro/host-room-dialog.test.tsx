// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ createRoom: vi.fn(), listTimerPresets: vi.fn() }))

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/lib/api/pomodoro/rooms", () => ({
  createRoom: api.createRoom,
  loadHostingOptions: async () => ({ presets: [], maxInvitesPerRoom: 20 }),
  loadRoomFileChoices: async () => ({ sounds: [], backgrounds: [] }),
}))
vi.mock("@/lib/api/pomodoro/timer-presets", () => ({
  listTimerPresets: api.listTimerPresets,
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}))
// Radix's Select cannot open in jsdom. A native select stands in and passes
// the value, the change and the placeholder through untouched, which is the
// whole contract the dialog relies on.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string
    onValueChange?: (value: string) => void
    children: React.ReactNode
  }) => (
    <select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
      <option value="">none</option>
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    placeholder ? <option disabled data-placeholder>{placeholder}</option> : null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { HostRoomDialog } from "@/components/pomodoro/rooms-page"
import { TooltipProvider } from "@/components/ui/tooltip"
import { seededCatalog } from "@/lib/pomodoro/catalog-fixture"
import { guestMediaBootstrap } from "@/lib/pomodoro/media-pair"
import { MediaBootstrapContext } from "@/lib/pomodoro/room-media-store"

const rhythmPicker = () => {
  const select = [...document.querySelectorAll("select")].find((element) =>
    element.querySelector('option[value="builtin:classic"]')
  )
  if (!select) throw new Error("The Rhythm picker was not drawn")
  return select as HTMLSelectElement
}
const pickerWith = (value: string) => {
  const select = [...document.querySelectorAll("select")].find((element) =>
    element.querySelector(`option[value="${value}"]`)
  )
  if (!select) throw new Error(`No picker offers ${value}`)
  return select as HTMLSelectElement
}
const submit = () =>
  act(async () => {
    document
      .getElementById("host-room-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
const minutes = (key: "focus" | "short" | "long") =>
  (document.getElementById(`room-${key}`) as HTMLInputElement).value

async function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    )?.set
    setter?.call(element, value)
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }))
  })
}

describe("Host a room's Rhythm picker", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // The dialog's scroll area measures itself; jsdom has nothing to measure.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    api.createRoom.mockReset().mockResolvedValue({ room: { slug: "x" } })
    api.listTimerPresets.mockReset().mockResolvedValue([
      {
        id: "mine",
        name: "Writing",
        focusMinutes: 40,
        shortBreakMinutes: 8,
        longBreakMinutes: 20,
        sessionsBeforeLongBreak: 3,
        autoStart: true,
      },
    ])
  })
  afterEach(() => document.body.replaceChildren())

  async function open() {
    const host = document.createElement("div")
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        // The pickers list the catalogue the page's loader read.
        <MediaBootstrapContext.Provider value={guestMediaBootstrap(seededCatalog, () => 0)}>
          <TooltipProvider>
            <HostRoomDialog open onOpenChange={vi.fn()} onCreated={vi.fn()} onBooked={vi.fn()} />
          </TooltipProvider>
        </MediaBootstrapContext.Provider>
      )
    })
  }

  it("opens on Classic, which the default timers already are, and offers your own presets", async () => {
    await open()
    expect(rhythmPicker().value).toBe("builtin:classic")
    expect([...rhythmPicker().options].map((option) => option.textContent)).toContain(
      "Writing · 40 · 8 · 20 min · auto"
    )
  })

  it("fills the timers from a pick, reads Custom after an edit, and creates the room with the picked numbers", async () => {
    await open()
    await change(rhythmPicker(), "builtin:deep-work")
    expect([minutes("focus"), minutes("short"), minutes("long")]).toEqual(["50", "10", "30"])
    expect(rhythmPicker().value).toBe("builtin:deep-work")

    await change(document.getElementById("room-focus") as HTMLInputElement, "45")
    expect(rhythmPicker().value).toBe("")
    expect(document.querySelector("[data-placeholder]")?.textContent).toBe("Custom")

    await change(document.getElementById("room-focus") as HTMLInputElement, "50")
    await change(document.getElementById("room-name") as HTMLInputElement, "Deep Work room")
    await change(pickerWith("curated:rain"), "curated:rain")
    await change(pickerWith("scene:fireplace"), "scene:fireplace")
    await submit()
    expect(api.createRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        focusMinutes: 50,
        shortBreakMinutes: 10,
        longBreakMinutes: 30,
        autoStart: false,
        sound: "curated:rain",
        background: "scene:fireplace",
      })
    )
  })

  it("keeps Create room pressable with no sound or theme, and says which one is missing", async () => {
    await open()
    await change(document.getElementById("room-name") as HTMLInputElement, "Quiet room")
    await submit()
    expect(api.createRoom).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Pick a sound for the room.")

    await change(pickerWith("curated:rain"), "curated:cafe")
    await submit()
    expect(api.createRoom).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Pick a background for the room.")
  })

  it("still offers the built-ins when your own presets fail to load, and says so", async () => {
    api.listTimerPresets.mockRejectedValue(new Error("down"))
    await open()
    expect(rhythmPicker().querySelector('option[value="builtin:deep-work"]')).not.toBeNull()
    expect(document.body.textContent).toContain("Your own presets could not be loaded.")
  })
})

describe("Host a room's errors and fresh start", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    api.createRoom.mockReset().mockResolvedValue({ room: { slug: "x" } })
    api.listTimerPresets.mockReset().mockResolvedValue([])
  })
  afterEach(() => document.body.replaceChildren())

  function mount() {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const render = (isOpen: boolean) =>
      act(async () => {
        root.render(
          <MediaBootstrapContext.Provider value={guestMediaBootstrap(seededCatalog, () => 0)}>
            <TooltipProvider>
              <HostRoomDialog open={isOpen} onOpenChange={vi.fn()} onCreated={vi.fn()} onBooked={vi.fn()} />
            </TooltipProvider>
          </MediaBootstrapContext.Provider>
        )
      })
    return render
  }
  const alerts = () =>
    [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent)
  const pickPair = async () => {
    await change(document.getElementById("room-name") as HTMLInputElement, "Booked room")
    await change(pickerWith("curated:rain"), "curated:rain")
    await change(pickerWith("scene:fireplace"), "scene:fireplace")
  }

  it("shows a bad time once, not again under it after Book", async () => {
    const render = mount()
    await render(true)
    await pickPair()
    await change(pickerWith("later"), "later")
    await change(document.getElementById("room-starts-at") as HTMLInputElement, "2000-01-01T09:00")
    expect(alerts()).toHaveLength(1)
    await submit()
    expect(api.createRoom).not.toHaveBeenCalled()
    expect(alerts()).toHaveLength(1)
  })

  it("waits for the invite field to be left before calling an address wrong", async () => {
    const render = mount()
    await render(true)
    await pickPair()
    await change(pickerWith("later"), "later")
    const invites = document.getElementById("room-invites") as HTMLTextAreaElement
    await act(async () => invites.focus())
    await change(invites as unknown as HTMLInputElement, "sam@")
    expect(alerts()).toEqual([])
    await act(async () => invites.blur())
    expect(alerts()).toHaveLength(1)
  })

  it("starts a booking at least half an hour away, even at a minute to the hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date(2026, 9, 10, 22, 59, 52))
    try {
      const render = mount()
      await render(true)
      await change(pickerWith("later"), "later")
      expect((document.getElementById("room-starts-at") as HTMLInputElement).value).toBe(
        "2026-10-11T00:00"
      )
      expect(alerts()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it("opens again to a clean form after it was closed", async () => {
    const render = mount()
    await render(true)
    await pickPair()
    await change(pickerWith("later"), "later")
    await submit()
    await render(false)
    await render(true)
    expect((document.getElementById("room-name") as HTMLInputElement).value).toBe("")
    expect(pickerWith("later").value).toBe("now")
    expect(pickerWith("curated:rain").value).toBe("")
    expect(alerts()).toHaveLength(0)
  })
})
