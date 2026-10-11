// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  createRoom: vi.fn(),
  listTimerPresets: vi.fn(),
  loadRoomFileChoices: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(() => "error"), dismiss: vi.fn() },
}))
vi.mock("@/lib/api/pomodoro/rooms", () => ({
  createRoom: api.createRoom,
  loadHostingOptions: async () => ({ presets: [], maxInvitesPerRoom: 20 }),
  loadRoomFileChoices: api.loadRoomFileChoices,
}))
vi.mock("@/lib/api/pomodoro/timer-presets", () => ({
  listTimerPresets: api.listTimerPresets,
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => api.navigate,
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

// jsdom has no audio playback and no media queries; the window's preview
// player and the backgrounds' films need both to exist.
const played: string[] = []
HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
  played.push(this.src)
  return Promise.resolve()
}
HTMLMediaElement.prototype.pause = () => {}
window.matchMedia ??= (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia

import { HostRoomDialog } from "@/components/pomodoro/rooms-page"
import { TooltipProvider } from "@/components/ui/tooltip"
import { seededCatalog } from "@/lib/pomodoro/catalog-fixture"
import { guestMediaBootstrap } from "@/lib/pomodoro/media-pair"
import { MediaBootstrapContext } from "@/lib/pomodoro/room-media-store"

// A host is Pro, so nothing in the catalogue is locked for them.
const bootstrap = { ...guestMediaBootstrap(seededCatalog, () => 0), canUsePremiumMedia: true }

/** Opens a field's cards, presses one, and comes back to the form with Done. */
async function pickMedia(fieldId: "room-sound" | "room-theme", value: string) {
  await act(async () => document.getElementById(fieldId)!.click())
  const card = document.querySelector<HTMLButtonElement>(`[data-choice="${value}"]`)
  if (!card) throw new Error(`No card for ${value}`)
  await act(async () => card.click())
  await act(async () => buttonNamed("Done").click())
}
const buttonNamed = (name: string) => {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === name
  )
  if (!button) throw new Error(`No ${name} button`)
  return button
}

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
    api.loadRoomFileChoices.mockReset().mockResolvedValue({ sounds: [], backgrounds: [] })
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
        <MediaBootstrapContext.Provider value={bootstrap}>
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
    await pickMedia("room-sound", "curated:rain")
    await pickMedia("room-theme", "scene:fireplace")
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

    await pickMedia("room-sound", "curated:cafe")
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
    api.loadRoomFileChoices.mockReset().mockResolvedValue({ sounds: [], backgrounds: [] })
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
          <MediaBootstrapContext.Provider value={bootstrap}>
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
    await pickMedia("room-sound", "curated:rain")
    await pickMedia("room-theme", "scene:fireplace")
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
    expect(document.getElementById("room-sound")!.getAttribute("aria-label")).toBe(
      "Sound: none picked. Press to pick one"
    )
    expect(alerts()).toHaveLength(0)
  })
})

describe("Host a room's sound and background cards", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    played.length = 0
    api.navigate.mockReset()
    api.listTimerPresets.mockReset().mockResolvedValue([])
    api.loadRoomFileChoices.mockReset().mockResolvedValue({ sounds: [], backgrounds: [] })
  })
  afterEach(() => document.body.replaceChildren())

  async function open(value = bootstrap, onOpenChange = vi.fn()) {
    const host = document.createElement("div")
    document.body.appendChild(host)
    await act(async () => {
      createRoot(host).render(
        <MediaBootstrapContext.Provider value={value}>
          <TooltipProvider>
            <HostRoomDialog open onOpenChange={onOpenChange} onCreated={vi.fn()} onBooked={vi.fn()} />
          </TooltipProvider>
        </MediaBootstrapContext.Provider>
      )
    })
  }
  const label = (id: string) => document.getElementById(id)!.getAttribute("aria-label")

  it("plays a sound as it is picked, and the field then names it with a play button", async () => {
    await open()
    await act(async () => document.getElementById("room-sound")!.click())
    expect(document.body.textContent).toContain("Pick the room's sound")
    await act(async () => document.querySelector<HTMLButtonElement>('[data-choice="curated:rain"]')!.click())
    expect(played.at(-1)).toContain("/sounds/audio-rain.mp3")
    expect(
      document.querySelector('[data-choice="curated:rain"]')!.getAttribute("aria-pressed")
    ).toBe("true")
    await act(async () => buttonNamed("Done").click())
    expect(label("room-sound")).toBe("Sound: Rain. Press to change it")
    expect(document.querySelector('[aria-label="Hear Rain"]')).not.toBeNull()
  })

  it("draws a background's picture in the field once picked", async () => {
    await open()
    await pickMedia("room-theme", "scene:stars")
    const field = document.getElementById("room-theme")!
    expect(field.getAttribute("aria-label")).toBe("Background: Starry night. Press to change it")
    // The picture sits beside the button, inside the same box.
    expect(field.parentElement!.querySelector("img")?.getAttribute("src")).toBe(
      "/backgrounds/thumbs-stars.png"
    )
  })

  it("goes back to the form on Escape, keeping the pick and the window open", async () => {
    const onOpenChange = vi.fn()
    await open(bootstrap, onOpenChange)
    await act(async () => document.getElementById("room-sound")!.click())
    await act(async () => document.querySelector<HTMLButtonElement>('[data-choice="shuffle"]')!.click())
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      )
    })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.getElementById("host-room-form")).not.toBeNull()
    expect(label("room-sound")).toBe("Sound: Shuffle every sound. Press to change it")
  })

  it("puts the cards away on the X, leaving the window open", async () => {
    const onOpenChange = vi.fn()
    await open(bootstrap, onOpenChange)
    await act(async () => document.getElementById("room-theme")!.click())
    await act(async () => document.querySelector<HTMLButtonElement>('[data-choice="scene:lofi"]')!.click())
    const close = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Close"
    )!
    await act(async () => close.click())
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(label("room-theme")).toBe("Background: Lofi girl. Press to change it")

    // On the form, the same X closes the window.
    await act(async () =>
      [...document.querySelectorAll("button")].find((button) => button.textContent === "Close")!.click()
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("lists your uploads with their pictures, and says when they could not be read", async () => {
    api.loadRoomFileChoices.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({
      sounds: [],
      backgrounds: [
        {
          value: "media:7d1c0c5e-1b1a-4c2e-9d55-0d6f7a1b2c3d",
          mediaId: "7d1c0c5e-1b1a-4c2e-9d55-0d6f7a1b2c3d",
          label: "My desk",
          kind: "image",
          url: "https://files.example/desk.jpg",
          stillUrl: "",
          own: true,
          credit: null,
        },
      ],
    })
    await open()
    await act(async () => document.getElementById("room-theme")!.click())
    expect(document.body.textContent).toContain("Your uploads and saved files could not be loaded.")
    await act(async () => buttonNamed("Try again").click())
    const card = document.querySelector('[data-choice="media:7d1c0c5e-1b1a-4c2e-9d55-0d6f7a1b2c3d"]')!
    expect(card.textContent).toContain("Your upload")
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://files.example/desk.jpg")
  })
})
