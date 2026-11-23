// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MyProfilePanel } from "@/components/dating/my-profile-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { DatingDashboard } from "@/lib/api/dating/dashboard"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * What a browser would show of task "features/03-your-profile" on the My
 * profile panel, drawn by the real component with the data the dashboard
 * sends: before and after with Apply, Applied with Undo, a prompt to keep, a
 * change the phone is making and one that failed, and the first-photo test.
 */

type Own = NonNullable<DatingDashboard["own"]>

const at = new Date("2099-01-01T19:00:00Z")

const own: Own = {
  name: "Tyler",
  photoIds: ["p1", "p2", "p3"],
  bio: "Product person who cooks too much.",
  prompts: [
    { question: "My simple pleasures", answer: "Coffee." },
    { question: "Two truths and a lie", answer: "I cook, I run, I sing." },
  ],
  readAt: at,
  review: {
    photoIds: ["p1", "p2", "p3"],
    photoOrder: [{ photo: 2, why: "Smiling, face clear." }],
    bio: "Cooks too much, shares the leftovers.",
    prompts: [
      { question: "My simple pleasures", answer: "Sourdough on a Sunday.", keep: false },
      { question: "Two truths and a lie", answer: "", keep: true },
    ],
    notes: [],
  },
  reviewMadeAt: at,
  aiError: "",
  photoAfter: ["p2", "p1", "p3"],
  before: null,
  appliedAt: {},
  changing: null,
  failed: null,
  photoTest: null,
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const applied: unknown[] = []

beforeEach(() => {
  applied.length = 0
  // The photos are fetched by address; the test has none to give.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function mount(value: Own) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () =>
    root.render(
      <TooltipProvider>
        <MyProfilePanel
          own={value}
          busy={null}
          onReadAgain={() => {}}
          onReviewAgain={() => {}}
          onApply={(what) => applied.push(what)}
          onUndo={() => applied.push("undo")}
          onStartTest={() => {}}
          onStopTest={async () => true}
        />
      </TooltipProvider>
    )
  )
}

function text(): string {
  return (host.textContent ?? "").replace(/\s+/g, " ")
}

/** The block for one suggestion, by its heading. */
function block(title: string): HTMLElement {
  const heading = [...host.querySelectorAll("h3")].find((item) => item.textContent === title)
  if (!heading) throw new Error(`No block called ${title}`)
  return heading.closest("section") as HTMLElement
}

function press(inside: HTMLElement, label: string) {
  const button = [...inside.querySelectorAll("button")].find((item) => item.textContent === label)
  if (!button) throw new Error(`No ${label} button`)
  act(() => button.click())
}

describe("the My profile panel", () => {
  it("shows each suggestion with before and after, and Apply asks for that one change only", async () => {
    await mount(own)
    expect(block("Bio").textContent).toContain("BeforeProduct person who cooks too much.AfterCooks too much, shares the leftovers.")
    expect(block("My simple pleasures").textContent).toContain("BeforeCoffee.AfterSourdough on a Sunday.")
    press(block("Bio"), "Apply")
    press(block("My simple pleasures"), "Apply")
    press(block("Photo order"), "Apply")
    expect(applied).toEqual([{ kind: "bio" }, { kind: "prompt", question: "My simple pleasures" }, { kind: "photos" }])
  })

  it("says to keep a prompt the AI would not change, with no Apply", async () => {
    await mount(own)
    const keep = block("Two truths and a lie")
    expect(keep.textContent).toContain("Keep this answer.")
    expect([...keep.querySelectorAll("button")].map((button) => button.textContent)).toEqual([])
  })

  it("says Applied with the day and offers Undo on the last change, and shows a change on its way and one that failed", async () => {
    await mount({
      ...own,
      bio: "Cooks too much, shares the leftovers.",
      before: { kind: "bio", bio: "Product person who cooks too much." },
      appliedAt: { bio: "2099-01-01T19:00:00.000Z" },
      changing: { key: "prompt:My simple pleasures", undo: false },
      failed: null,
    })
    expect(block("Bio").textContent).toContain("Applied 1 Jan")
    press(block("Bio"), "Undo")
    expect(applied).toEqual(["undo"])
    expect(block("My simple pleasures").textContent).toContain("Applying on the phone")

    act(() => root.unmount())
    host.remove()
    await mount({ ...own, failed: { key: "photos", error: "Tinder shows 2 photos and Date expected 3." } })
    expect(block("Photo order").textContent).toContain("The phone could not do this: Tinder shows 2 photos and Date expected 3.")
  })

  it("shows the test's weeks so far with how many likes each had, and the winner at the end", async () => {
    const week = (place: number, likes: number, matches: number, per100: number | null, extra: object = {}) => ({
      place,
      photoId: `p${place}`,
      startedAt: at,
      endedAt: at,
      likes,
      matches,
      per100,
      winner: false,
      current: false,
      ...extra,
    })
    await mount({
      ...own,
      photoTest: {
        phase: "week",
        stopped: false,
        weeks: [week(1, 20, 4, 20), week(2, 10, 3, 30, { endedAt: null, current: true }), week(3, 0, 0, null, { startedAt: null, endedAt: null })],
        weekEndsAt: at,
        moveError: "",
      },
    })
    expect(text()).toContain("First-photo test · week 2 of 3")
    expect(text()).toContain("Photo 1" + "20 matches per 100 likes (4 matches from 20 likes)")
    expect(text()).toContain("Week 2, so far: 30 matches per 100 likes (3 matches from 10 likes)")
    expect(text()).toContain("Week 3, not started yet")
    expect(text()).toContain("Stop the test")

    act(() => root.unmount())
    host.remove()
    await mount({
      ...own,
      photoTest: {
        phase: "done",
        stopped: false,
        weeks: [week(1, 20, 4, 20), week(2, 10, 3, 30, { winner: true }), week(3, 40, 5, 13)],
        weekEndsAt: null,
        moveError: "",
      },
    })
    expect(text()).toContain("Photo 2 won with 30 matches per 100 likes, and it is first now.")
    expect(text()).toContain("Photo 2, the winner")
    expect(text()).toContain("Test my first photo")
  })
})
