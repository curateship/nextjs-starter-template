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
    expect(document.body.textContent).toContain("Pick a theme for the room.")
  })

  it("still offers the built-ins when your own presets fail to load, and says so", async () => {
    api.listTimerPresets.mockRejectedValue(new Error("down"))
    await open()
    expect(rhythmPicker().querySelector('option[value="builtin:deep-work"]')).not.toBeNull()
    expect(document.body.textContent).toContain("Your own presets could not be loaded.")
  })
})
