// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { DndContext } from "@dnd-kit/core"
import { SortableContext } from "@dnd-kit/sortable"
import type { Editor } from "@tiptap/core"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ActivityCardContent } from "@/components/travel/activity-card"
import { ActivityPhotosRow } from "@/components/travel/activity-photos-row"
import { DayColumn } from "@/components/travel/day-column"
import { RateTripDialog } from "@/components/travel/rate-trip-dialog"
import { SavingDocument } from "@/components/travel/saving-document"
import { SuggestIdeasDialog } from "@/components/travel/suggest-ideas-dialog"
import { TripProvider, type TripContextValue } from "@/components/travel/trip-context"
import { TripPhotosView } from "@/components/travel/trip-photos-view"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createIdeas } from "@/lib/api/travel/trip-draft"
import { saveActivity, type Activity, type TripPage } from "@/lib/api/travel/trips"
import { DEFAULT_TYPES, type ActivityType } from "@/lib/travel/activity-types"
import { readNotes } from "@/lib/travel/notes"

// The screens' server calls, answered here; the server side has its own tests.
vi.mock("@/lib/api/travel/services", () => ({
  loadTravelServices: vi.fn(async () => ({ google: false, unsplash: true, mapsKey: null })),
}))
vi.mock("@/lib/api/travel/trips", () => ({ saveActivity: vi.fn(async () => undefined) }))
vi.mock("@/lib/api/travel/activity-photos", () => ({ saveActivityPhotos: vi.fn(async () => undefined) }))
vi.mock("@/lib/api/travel/trip-draft", () => ({
  suggestIdeas: vi.fn(async () => ({
    items: [
      { title: "Kinkaku-ji", typeId: "type-sight", reason: "The gold pavilion on the pond." },
      { title: "Nishiki Market", typeId: "type-food", reason: "Kyoto's kitchen, for lunch." },
    ],
  })),
  createIdeas: vi.fn(async () => ({ created: ["new-1"], placed: 0, looked: false, repeated: 0 })),
}))
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
  window.localStorage.clear()
  vi.clearAllMocks()
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

function tripPage(activities: Activity[], patch: Partial<TripPage> = {}): TripPage {
  return {
    trip: {
      id: "trip-1",
      name: "Kyoto",
      destination: "Kyoto",
      days: 3,
      startDate: null,
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

const settle = (ms = 0) => act(async () => await new Promise((resolve) => setTimeout(resolve, ms)))

function press(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }))
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
  })
}

function byText(text: string, selector = "button") {
  return [...document.body.querySelectorAll(selector)].find((element) => element.textContent?.trim() === text)
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

/** The note's editor, once it has drawn. */
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

describe("the \"/\" blocks in a note (Travel features 3, parts 1 to 3)", () => {
  it("opens the list, narrows it, and adds a Video that plays YouTube", async () => {
    const saved: string[] = []
    act(() =>
      root.render(withTrip(tripPage([activity({})]), <SavingDocument value="" onSave={async (json) => saved.push(json)} />))
    )
    const editor = await noteEditor()
    act(() => {
      editor.chain().focus().insertContent("/").run()
    })
    await settle()
    expect(["Image", "Place", "Video", "Map"].every((name) => document.body.textContent?.includes(name))).toBe(true)

    act(() => {
      editor.chain().insertContent("vi").run()
    })
    await settle()
    const options = [...document.body.querySelectorAll('[role="option"]')].map((option) => option.textContent)
    expect(options).toHaveLength(1)
    expect(options[0]).toContain("Video")

    key(editor, "Enter")
    await settle()
    const link = document.body.querySelector<HTMLInputElement>('input[placeholder="A YouTube, TikTok or Instagram link"]')
    expect(link).not.toBeNull()
    // The "/vi" that opened the list went with it.
    expect(editor.getText()).not.toContain("/vi")

    typeInto(link!, "https://vimeo.com/123")
    act(() => link!.form!.requestSubmit())
    expect(link!.getAttribute("aria-invalid")).toBe("true")

    typeInto(link!, "https://youtu.be/dQw4w9WgXcQ")
    act(() => link!.form!.requestSubmit())
    await settle()
    expect(document.body.querySelector('a[aria-label="Open on YouTube"]')?.getAttribute("href")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(document.body.querySelector("iframe")).toBeNull()
    press(document.body.querySelector('[aria-label="Play the YouTube video"]')!)
    expect(document.body.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1")

    await settle(800)
    expect(readNotes(saved.at(-1) ?? "").content).toContainEqual({
      type: "noteVideo",
      attrs: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    })
  })

  it("links a trip card with Place, drawn as a small card that opens it", async () => {
    const opened: string[] = []
    const cards = [activity({ id: "a1", title: "Kinkaku-ji", day: 2, startTime: "09:00" }), activity({ id: "a2", title: "Fuunji", day: 1 })]
    act(() =>
      root.render(
        withTrip(tripPage(cards), <SavingDocument value="" onSave={async () => undefined} />, {
          openActivity: (id) => opened.push(id),
        })
      )
    )
    const editor = await noteEditor()
    act(() => {
      editor.chain().focus().insertContent("/pl").run()
    })
    await settle()
    key(editor, "Enter")
    await settle()
    expect(document.body.textContent).toContain("Link a card")
    press(byText("Kinkaku-ji9:00 AM")!)
    await settle()
    const link = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Kinkaku-ji"))
    expect(link?.textContent).toContain("Day 2 · 9:00 AM")
    press(link!)
    expect(opened).toEqual(["a1"])
  })

  it("leaves the \"/\" as typed after Esc, and shows a removed card as removed", async () => {
    const note = JSON.stringify({ type: "doc", content: [{ type: "notePlace", attrs: { activityId: "gone" } }] })
    act(() => root.render(withTrip(tripPage([]), <SavingDocument value={note} onSave={async () => undefined} />)))
    const editor = await noteEditor()
    expect(host.textContent).toContain("Removed: this card is no longer on the trip")
    act(() => {
      editor.chain().focus("end").insertContent("/ma").run()
    })
    await settle()
    key(editor, "Escape")
    await settle()
    expect(document.body.querySelector('[role="option"]')).toBeNull()
    expect(editor.getText()).toContain("/ma")
  })
})

describe("a card's photos (Travel features 3, parts 5 and 6)", () => {
  const card = activity({ id: "a1", photoUrl: "https://r2.example/one.jpg" })
  const photos = [{ activityId: "a1", url: "https://r2.example/two.jpg", credit: null }]

  it("shows the row with the picture first, and opens one large", () => {
    act(() => root.render(withTrip(tripPage([card], { photos }), <ActivityPhotosRow activity={card} />)))
    const thumbs = host.querySelectorAll('button[aria-label^="Open"]')
    expect([...thumbs].map((thumb) => thumb.querySelector("img")?.getAttribute("src"))).toEqual([
      "https://r2.example/one.jpg",
      "https://r2.example/two.jpg",
    ])
    expect(host.querySelector('[aria-label="Add a photo"]')).not.toBeNull()
    press(thumbs[0])
    expect(document.body.textContent).toContain("Photo 1 of 2, the card's picture")
  })

  it("shows nothing for a card with no picture, and no Add with no signal", () => {
    const bare = activity({ id: "a2" })
    act(() => root.render(withTrip(tripPage([bare]), <ActivityPhotosRow activity={bare} />)))
    expect(host.innerHTML).toBe("")
    act(() => root.render(withTrip(tripPage([card], { photos }), <ActivityPhotosRow activity={card} />, { readOnly: true })))
    expect(host.querySelector('[aria-label="Add a photo"]')).toBeNull()
  })

  it("puts every photo on the Photos tab under its day, and says how to add one when there are none", () => {
    const opened: string[] = []
    act(() =>
      root.render(withTrip(tripPage([card], { photos }), <TripPhotosView activities={[card]} />, { openActivity: (id) => opened.push(id) }))
    )
    expect(host.querySelector("h3")?.textContent).toBe("Day 12")
    press(host.querySelector('button[aria-label="Open Kinkaku-ji"]')!)
    expect(opened).toEqual(["a1"])
    act(() => root.render(withTrip(tripPage([]), <TripPhotosView activities={[]} />)))
    expect(host.textContent).toContain("No photos yet")
  })
})

describe("the board (Travel features 3, parts 8 and 10)", () => {
  it("draws how full a day is, in the warning colour past 12 hours", () => {
    const column = (planned: number) => (
      <TooltipProvider>
        <DndContext>
          <SortableContext items={[]}>
            <DayColumn
              id="day-1"
              day={1}
              date={null}
              info={{ note: "" }}
              isToday={false}
              folded={false}
              count={0}
              onFold={() => {}}
              onCopyDay={() => {}}
              onBestOrder={() => {}}
              onFillDay={() => {}}
              readOnly
              planned={planned}
              addButton={null}
            >
              {null}
            </DayColumn>
          </SortableContext>
        </DndContext>
      </TooltipProvider>
    )
    act(() => root.render(withTrip(tripPage([]), column(360))))
    const meter = host.querySelector('[role="meter"]')
    expect(meter?.getAttribute("aria-valuenow")).toBe("360")
    expect(meter?.getAttribute("aria-valuetext")).toBe("6h of 12h planned")
    act(() => root.render(withTrip(tripPage([]), column(13 * 60))))
    expect(host.querySelector('[role="meter"]')?.getAttribute("aria-valuetext")).toBe("13h of 12h planned, more than 12 hours")
  })

  it("marks a card whose place was done on another trip", () => {
    act(() => root.render(<ActivityCardContent activity={activity({})} type={types[3]} currency="USD" beenHere="Been here: Tokyo" />))
    expect(host.querySelector('[aria-label="Been here: Tokyo"]')).not.toBeNull()
  })
})

describe("Rate the trip and Suggest Ideas (Travel features 3, parts 9 and 11)", () => {
  it("walks through the Done cards with no rating, saving each star", async () => {
    const cards = [
      activity({ id: "a1", title: "Kinkaku-ji", done: true }),
      activity({ id: "a2", title: "Fuunji", done: true, day: 2 }),
      activity({ id: "a3", title: "Rated", done: true, rating: 4 }),
      activity({ id: "a4", title: "Not done" }),
    ]
    act(() => root.render(withTrip(tripPage(cards), <RateTripDialog open onClose={() => {}} />)))
    expect(document.body.textContent).toContain("Card 1 of 2 marked Done with no rating.")
    expect(document.body.textContent).toContain("Kinkaku-ji")
    press(document.body.querySelector('[aria-label="4 of 5"]')!)
    await settle()
    expect(saveActivity).toHaveBeenCalledWith({ activityId: "a1", rating: 4 })
    press(byText("Skip")!)
    expect(document.body.textContent).toContain("Fuunji")
    press(byText("Skip")!)
    expect(document.body.textContent).toContain("That's all 2 done.")
  })

  it("shows the suggested places ticked with their reasons, and adds only the ticked ones", async () => {
    const onMade = vi.fn(async () => {})
    act(() => root.render(<SuggestIdeasDialog open tripId="trip-1" types={types} onClose={() => {}} onMade={onMade} />))
    await settle()
    expect(document.body.textContent).toContain("The gold pavilion on the pond.")
    press(document.body.querySelector('[aria-label="Add Nishiki Market"]')!)
    press(byText("Add 1 place to Ideas")!)
    await settle()
    expect(createIdeas).toHaveBeenCalledWith("trip-1", [{ title: "Kinkaku-ji", typeId: "type-sight" }])
    expect(onMade).toHaveBeenCalled()
  })
})
