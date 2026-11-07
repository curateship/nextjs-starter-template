// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import type { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { ActivityCardContent } from "@/components/travel/activity-card"
import { BinDialog } from "@/components/travel/bin-dialog"
import GoogleUseSettings from "@/components/travel/google-use-settings"
import { SavedPlaceEditor } from "@/components/travel/saved-place-editor"
import { SavingDocument } from "@/components/travel/saving-document"
import { TripProvider, type TripContextValue } from "@/components/travel/trip-context"
import { TripNotes } from "@/components/travel/trip-notes-panel"
import { TripsYearView } from "@/components/travel/trips-year-view"
import { TooltipProvider } from "@/components/ui/tooltip"
import { editSavedPlace, type SavedPlace } from "@/lib/api/travel/saved-places"
import { readLink } from "@/lib/api/travel/link-preview"
import { purgeNote, removeNote, restoreNote } from "@/lib/api/travel/trip-notes"
import type { Activity, TripListRow, TripNote, TripPage } from "@/lib/api/travel/trips"
import { DEFAULT_TYPES, type ActivityType } from "@/lib/travel/activity-types"

// The screens' server calls, answered here; the server side has its own tests.
vi.mock("@/lib/api/travel/services", () => ({
  loadTravelServices: vi.fn(async () => ({ google: false, unsplash: false, mapsKey: null })),
}))
vi.mock("@/lib/api/travel/link-preview", () => ({
  readLink: vi.fn(async (url: string) => ({ url, title: "Best ramen in Tokyo", image: null, site: "Eat Japan" })),
}))
vi.mock("@/lib/api/travel/trip-notes", () => ({
  copyNote: vi.fn(async () => ({ id: "copy" })),
  newTripNote: vi.fn(async () => ({ id: "new" })),
  pinNote: vi.fn(async () => undefined),
  purgeNote: vi.fn(async () => undefined),
  removeNote: vi.fn(async () => undefined),
  restoreNote: vi.fn(async () => undefined),
  saveNote: vi.fn(async () => undefined),
}))
vi.mock("@/lib/api/travel/trip-admin", () => ({
  loadBin: vi.fn(async () => ({
    activities: [],
    notes: [
      {
        id: "n-binned",
        body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ramen list" }] }] }),
        deletedAt: new Date().toISOString(),
      },
    ],
  })),
  purgeActivity: vi.fn(async () => undefined),
  restoreActivity: vi.fn(async () => undefined),
}))
vi.mock("@/lib/api/travel/google-use", () => ({
  getGoogleUse: vi.fn(async () => ({
    today: 12,
    month: 340,
    top: [{ name: "Anna", email: "anna@example.com", lookups: 200 }],
    googleOn: true,
  })),
}))
vi.mock("@/lib/api/travel/saved-places", () => ({ editSavedPlace: vi.fn(async () => undefined) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(() => "toast-1"), dismiss: vi.fn() } }))

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

// jsdom measures no text, and the editor measures the cursor to scroll to it; an empty answer stands in.
const noRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
Range.prototype.getClientRects = noRects
Range.prototype.getBoundingClientRect = () => new DOMRect()
Object.assign(Text.prototype, { getClientRects: noRects, getBoundingClientRect: () => new DOMRect() })

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
  vi.clearAllMocks()
})

const settle = (ms = 0) => act(async () => await new Promise((resolve) => setTimeout(resolve, ms)))
const types: ActivityType[] = DEFAULT_TYPES.map((type, index) => ({ ...type, id: `type-${type.builtin}`, position: index }))

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function card(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    tripId: "trip-1",
    day: 1,
    position: 0,
    title: "Yoyogi Park",
    typeId: "type-sight",
    startTime: "14:30",
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

const note = (id: string, text: string, pinned = false): TripNote => ({
  id,
  body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }),
  pinned,
  createdAt: "2099-01-01T00:00:00.000Z",
  updatedAt: "2099-01-01T00:00:00.000Z",
})

function tripPage(patch: Partial<TripPage> = {}): TripPage {
  return {
    trip: {
      id: "trip-1",
      name: "Tokyo",
      destination: "Tokyo",
      days: 3,
      startDate: null,
      currency: "JPY",
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
    activities: [],
    types,
    notes: [],
    binCount: 0,
    views: [],
    photos: [],
    beenHere: [],
    ...patch,
  }
}

function withTrip(page: TripPage, children: React.ReactNode, patch: Partial<TripContextValue> = {}) {
  const value: TripContextValue = {
    page,
    typesById: new Map(types.map((type) => [type.id, type])),
    refresh: async () => {},
    openActivity: () => {},
    openActivityId: undefined,
    readOnly: false,
    weather: { forecast: [], typical: [], holidays: [] },
    openTripNote: () => {},
    noteRequest: null,
    ...patch,
  }
  return (
    <TooltipProvider>
      <TripProvider value={value}>{children}</TripProvider>
    </TooltipProvider>
  )
}

async function noteEditor() {
  await settle()
  const editable = host.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
  expect(editable?.editor).toBeDefined()
  return editable!.editor!
}

function key(editor: Editor, name: string) {
  act(() => {
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }))
  })
}

const options = () => [...document.body.querySelectorAll('[role="option"]')].map((option) => option.textContent ?? "")

describe("rain at the card's hour (part 3)", () => {
  it("shows the hour's rain in the card's time row", () => {
    act(() => root.render(<ActivityCardContent activity={card()} type={types[3]} currency="JPY" rain="40% rain at 2:30 PM" />))
    expect(host.textContent).toContain("40% rain at 2:30 PM")
    act(() => root.render(<ActivityCardContent activity={card()} type={types[3]} currency="JPY" />))
    expect(host.textContent).not.toContain("rain")
  })
})

describe("the Web page block, once Link (part 5)", () => {
  it("reads a pasted address into a small card that opens the page in a new tab", async () => {
    const saved: string[] = []
    act(() => root.render(withTrip(tripPage(), <SavingDocument value="" onSave={async (json) => saved.push(json)} />)))
    const editor = await noteEditor()
    act(() => {
      // The Link block is named Web page since 6 Nov 2026, as Project's is.
      editor.chain().focus().insertContent("/web").run()
    })
    await settle()
    expect(options()).toHaveLength(1)
    expect(options()[0]).toContain("Web page")
    key(editor, "Enter")
    await settle()
    const input = document.body.querySelector<HTMLInputElement>('input[placeholder="example.com"]')
    expect(input).not.toBeNull()
    typeInto(input!, "https://example.org/ramen")
    await act(async () => input!.form!.requestSubmit())
    await settle()
    expect(readLink).toHaveBeenCalledWith("https://example.org/ramen")
    const link = host.querySelector<HTMLAnchorElement>('a[href="https://example.org/ramen"]')
    expect(link?.target).toBe("_blank")
    expect(link?.rel).toContain("noopener")
    expect(link?.textContent).toContain("Best ramen in Tokyo")
    expect(link?.textContent).toContain("Eat Japan")
    await settle(800)
    expect(saved.at(-1)).toContain('"noteLink"')
  })

  it("leaves Place and Map out of a note that belongs to no trip, and draws without one", async () => {
    act(() => root.render(<TooltipProvider><SavingDocument value="" cards={false} onSave={async () => undefined} /></TooltipProvider>))
    const editor = await noteEditor()
    act(() => {
      editor.chain().focus().insertContent("/").run()
    })
    await settle()
    expect(options().map((text) => text.split(/(?=[A-Z][a-z]+ )/)[0])).toEqual(
      expect.arrayContaining([expect.stringContaining("Image"), expect.stringContaining("Video"), expect.stringContaining("Link")])
    )
    expect(options().some((text) => text.startsWith("Place") || text.startsWith("Map") || text.startsWith("Budget"))).toBe(false)
  })
})

describe("the Budget block (Tyler, 7 Nov 2026: \"turn this bottom card into a budget block\")", () => {
  it("puts the trip's money in a note once, and saves it with no values of its own", async () => {
    // The test page can't scroll, and picking Budget again scrolls to the one already there.
    Element.prototype.scrollIntoView = vi.fn()
    const saved: string[] = []
    act(() => root.render(withTrip(tripPage(), <SavingDocument value="" onSave={async (json) => saved.push(json)} />)))
    const editor = await noteEditor()
    act(() => {
      editor.chain().focus().insertContent("/bud").run()
    })
    await settle()
    expect(options()).toHaveLength(1)
    expect(options()[0]).toContain("Budget")
    key(editor, "Enter")
    await settle()
    expect(host.querySelector('[data-travel-block="noteBudget"]')?.textContent).toContain("By type")
    // Picking it again takes away the "/" and adds no second one.
    act(() => {
      editor.chain().focus().insertContent("/budget").run()
    })
    await settle()
    key(editor, "Enter")
    await settle()
    expect(host.querySelectorAll('[data-travel-block="noteBudget"]')).toHaveLength(1)
    expect(editor.getText()).not.toContain("/")
    await settle(800)
    expect(saved.at(-1)).toContain('{"type":"noteBudget"}')
  })
  it("folds from its heading, Budget: the total of the budget, and remembers the fold", async () => {
    act(() => root.render(withTrip(tripPage(), <SavingDocument value={JSON.stringify({ type: "doc", content: [{ type: "noteBudget" }] })} onSave={async () => undefined} />)))
    await settle()
    const block = host.querySelector('[data-travel-block="noteBudget"]')!
    const heading = block.querySelector<HTMLButtonElement>("h2 button")!
    expect(heading.textContent).toMatch(/^Budget: /)
    expect(block.textContent).toContain("By type")
    await act(async () => heading.click())
    await settle()
    expect(block.textContent).not.toContain("By type")
    expect(heading.getAttribute("aria-expanded")).toBe("false")
  })
})

describe("notes: pins and the bin (parts 6 and 7)", () => {
  it("marks pinned notes and offers Pin in the right-click menu", async () => {
    const page = tripPage({ notes: [note("n1", "Pinned plan", true), note("n2", "Loose ideas")] })
    act(() => root.render(withTrip(page, <TripNotes />)))
    const rows = [...host.querySelectorAll<HTMLButtonElement>("[data-note-id]")]
    expect(rows[0].querySelector('[aria-label="Pinned"]')).not.toBeNull()
    expect(rows[1].querySelector('[aria-label="Pinned"]')).toBeNull()
    act(() => {
      rows[1].dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await settle()
    const items = [...document.body.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)
    expect(items).toEqual(["Pin", "Duplicate", "Delete"])
  })

  it("deletes into the bin without asking, with Undo on the bar", async () => {
    const page = tripPage({ notes: [note("n1", "Ramen list")] })
    act(() => root.render(withTrip(page, <TripNotes />)))
    const row = host.querySelector<HTMLButtonElement>("[data-note-id]")!
    act(() => {
      row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }))
    })
    await settle()
    const remove = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) => item.textContent === "Delete")!
    await act(async () => remove.click())
    await settle()
    expect(removeNote).toHaveBeenCalledWith("n1")
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    const [line, options] = vi.mocked(toast.success).mock.calls.at(-1)! as [string, { action: { label: string; onClick: () => void } }]
    expect(line).toBe("Note moved to the bin.")
    expect(options.action.label).toBe("Undo")
    await act(async () => options.action.onClick())
    expect(restoreNote).toHaveBeenCalledWith("n1")
  })

  it("lists a binned note in the trip's Bin, and puts it back", async () => {
    act(() => root.render(withTrip(tripPage(), <BinDialog open onClose={() => {}} />)))
    await settle()
    const text = document.body.textContent ?? ""
    expect(text).toContain("Ramen list")
    expect(text).toContain("Note · deleted today")
    const back = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Put back"))!
    await act(async () => back.click())
    await settle()
    expect(restoreNote).toHaveBeenCalledWith("n-binned")
  })

  it("asks on the row before deleting a binned note for good", async () => {
    act(() => root.render(withTrip(tripPage(), <BinDialog open onClose={() => {}} />)))
    await settle()
    const trash = document.body.querySelector<HTMLButtonElement>('[aria-label="Delete Ramen list for good"]')!
    act(() => trash.click())
    expect(document.body.textContent).toContain("Delete for good?")
    expect(purgeNote).not.toHaveBeenCalled()
    const cancel = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Cancel")!
    act(() => cancel.click())
    expect(document.body.textContent).not.toContain("Delete for good?")
    act(() => document.body.querySelector<HTMLButtonElement>('[aria-label="Delete Ramen list for good"]')!.click())
    const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Delete")!
    await act(async () => confirm.click())
    await settle()
    expect(purgeNote).toHaveBeenCalledWith("n-binned")
    expect(document.body.textContent).not.toContain("Ramen list")
  })
})

describe("the Year tab (part 9)", () => {
  const row = (patch: Partial<TripListRow>): TripListRow => ({
    id: "t1",
    name: "Tokyo",
    destination: "Tokyo",
    days: 5,
    startDate: "2099-03-01",
    currency: "JPY",
    status: "planning",
    coverUrl: null,
    tags: [],
    isSample: false,
    archived: false,
    deletedAt: null,
    activityCount: 0,
    timeZone: null,
    createdAt: "2099-01-01T00:00:00.000Z",
    ...patch,
  })

  it("draws dated trips as bars in their year, says how many have no dates, and opens a trip", async () => {
    const opened: string[] = []
    const trips = [row({}), row({ id: "t2", name: "Lisbon", startDate: "2100-06-01" }), row({ id: "t3", name: "Someday", startDate: null })]
    act(() =>
      root.render(
        <TooltipProvider>
          <TripsYearView trips={trips} onOpen={(trip) => opened.push(trip.id)} />
        </TooltipProvider>
      )
    )
    expect(host.textContent).toContain("2099")
    expect(host.textContent).toContain("1 trip this year.")
    expect(host.textContent).toContain("1 trip has no dates, so it isn't shown.")
    const bar = host.querySelector<HTMLButtonElement>('[data-trip-id="t1"]')!
    expect(bar.textContent).toContain("Tokyo")
    act(() => bar.click())
    expect(opened).toEqual(["t1"])
    const next = host.querySelector<HTMLButtonElement>('[aria-label="Next year"]')!
    act(() => next.click())
    expect(host.textContent).toContain("2100")
    expect(host.querySelector('[data-trip-id="t2"]')).not.toBeNull()
    expect(host.querySelector('[data-trip-id="t1"]')).toBeNull()
  })
})

describe("Google use (part 4)", () => {
  it("shows today, this month and who used the most", async () => {
    act(() => root.render(<GoogleUseSettings />))
    await settle()
    expect(host.textContent).toContain("Today12")
    expect(host.textContent).toContain("This month340")
    expect(host.textContent).toContain("Anna")
    expect(host.textContent).toContain("200")
  })
})

describe("editing a saved place (part 11)", () => {
  const place: SavedPlace = {
    id: "s1",
    title: "Okutan",
    typeId: "type-food",
    place: null,
    website: null,
    menuUrl: null,
    phone: null,
    notes: "",
    photoUrl: null,
    photoCredit: null,
    createdAt: "2099-01-01T00:00:00.000Z",
  }

  it("saves a new name after a pause, and refuses an empty one", async () => {
    const changed: SavedPlace[] = []
    act(() =>
      root.render(
        <TooltipProvider>
          <SavedPlaceEditor place={place} types={types} onChange={(next) => changed.push(next)} onBack={() => {}} />
        </TooltipProvider>
      )
    )
    const name = host.querySelector<HTMLInputElement>("#saved-s1-name")!
    typeInto(name, "Okutan, Nanzen-ji")
    await settle(800)
    expect(editSavedPlace).toHaveBeenCalledWith({ savedPlaceId: "s1", title: "Okutan, Nanzen-ji" })
    expect(changed.at(-1)?.title).toBe("Okutan, Nanzen-ji")
    typeInto(name, "  ")
    act(() => name.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(editSavedPlace).toHaveBeenCalledTimes(1)
  })

  it("saves a name still waiting on its pause when the window closes", async () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <SavedPlaceEditor place={place} types={types} onChange={() => {}} onBack={() => {}} />
        </TooltipProvider>
      )
    )
    typeInto(host.querySelector<HTMLInputElement>("#saved-s1-name")!, "Okutan tofu")
    act(() => root.render(<TooltipProvider>{null}</TooltipProvider>))
    await settle()
    expect(editSavedPlace).toHaveBeenCalledWith({ savedPlaceId: "s1", title: "Okutan tofu" })
  })
})
