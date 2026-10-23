// @vitest-environment jsdom
import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/directory/public", () => ({
  findDirectoryPlace: vi.fn(),
  loadDirectorySuggestions: vi.fn(),
}))
// A real Link needs a router. What is being proved here is the box's keyboard
// and how often it asks the server, so the link is only ever an anchor.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    ...rest
  }: {
    to: string
    params: { slug: string }
  } & React.ComponentProps<"a">) => (
    <a href={to.replace("$slug", params.slug)} {...rest} />
  ),
}))

import { loadDirectorySuggestions } from "@/lib/api/directory/public"
import {
  DirectorySuggestionList,
  useDirectorySuggestions,
} from "@/components/directory/public/directory-suggestions"

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
const onSearch = vi.fn()

function Box() {
  const [text, setText] = React.useState("")
  const box = useDirectorySuggestions({ text, onSearch })
  return (
    <div className="relative">
      <input
        aria-label="Search listings"
        value={text}
        onChange={(event) => setText(event.target.value)}
        {...box.inputProps}
      />
      <DirectorySuggestionList box={box} />
    </div>
  )
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(loadDirectorySuggestions).mockResolvedValue({
    categories: [{ title: "Pizza", slug: "pizza" }],
    listings: [{ title: "Luigi's Pizza", slug: "luigis" }],
    events: [],
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(<Box />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function input() {
  return host.querySelector<HTMLInputElement>("input")!
}
function options() {
  return Array.from(host.querySelectorAll<HTMLAnchorElement>('[role="option"]'))
}

/** One character at a time, the way somebody actually types. */
async function type(word: string, msBetweenKeys = 30) {
  await act(async () => input().focus())
  for (let length = 1; length <= word.length; length += 1) {
    await act(async () => {
      const next = word.slice(0, length)
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input(), next)
      input().dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(msBetweenKeys)
    })
  }
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(250)
  })
}

async function press(key: string, isComposing = false) {
  await act(async () => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
        isComposing,
      })
    )
  })
}

describe("directory search suggestions", () => {
  it("asks once for a quickly typed word, and never for one letter", async () => {
    await type("p")
    await settle()
    expect(loadDirectorySuggestions).not.toHaveBeenCalled()

    await type("pizza")
    await settle()
    expect(loadDirectorySuggestions).toHaveBeenCalledExactlyOnceWith("pizza")
    expect(options().map((item) => item.textContent)).toEqual([
      "PizzaCategory",
      "Luigi's Pizza",
    ])
  })

  it("does not ask twice for a word it has already answered", async () => {
    await type("pizza")
    await settle()
    expect(loadDirectorySuggestions).toHaveBeenCalledTimes(1)

    await press("Escape")
    await type("pizza")
    await settle()
    expect(loadDirectorySuggestions).toHaveBeenCalledTimes(1)
    expect(options()).toHaveLength(2)
  })

  it("walks the list with the arrows and opens the highlighted row on Enter", async () => {
    await type("pizza")
    await settle()
    expect(input().getAttribute("aria-activedescendant")).toBeNull()

    await press("ArrowDown")
    expect(options()[0]?.getAttribute("aria-selected")).toBe("true")
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[0]?.id)

    await press("ArrowDown")
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true")
    // Past the end wraps back to the top rather than stopping dead.
    await press("ArrowDown")
    expect(options()[0]?.getAttribute("aria-selected")).toBe("true")
    await press("ArrowUp")
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true")

    const opened = vi.fn()
    options()[1]!.addEventListener("click", (event) => {
      event.preventDefault()
      opened()
    })
    await press("Enter")
    expect(opened).toHaveBeenCalledTimes(1)
    expect(onSearch).not.toHaveBeenCalled()
    expect(options()[1]?.getAttribute("href")).toBe("/directory/luigis")
    expect(options()[0]?.getAttribute("href")).toBe("/directory/category/pizza")
  })

  it("offers an event last, with its date, and the keyboard reaches it the same way", async () => {
    vi.mocked(loadDirectorySuggestions).mockResolvedValue({
      categories: [{ title: "Markets", slug: "markets" }],
      listings: [{ title: "Night Owl Cafe", slug: "night-owl" }],
      events: [
        { title: "Night market", slug: "night-market", startDate: "2026-09-26" },
      ],
    })
    await type("night")
    await settle()
    expect(options().map((item) => item.textContent)).toEqual([
      "MarketsCategory",
      "Night Owl Cafe",
      "Night marketSat, Sep 26",
    ])
    expect(options()[2]?.getAttribute("href")).toBe("/events/night-market")

    // Up from nothing wraps to the last row, which is the event.
    await press("ArrowUp")
    expect(options()[2]?.getAttribute("aria-selected")).toBe("true")
    const opened = vi.fn()
    options()[2]!.addEventListener("click", (event) => {
      event.preventDefault()
      opened()
    })
    await press("Enter")
    expect(opened).toHaveBeenCalledTimes(1)
    expect(onSearch).not.toHaveBeenCalled()
  })

  it("runs the plain search on Enter with nothing highlighted", async () => {
    await type("pizza")
    await settle()

    await press("Enter")
    expect(onSearch).toHaveBeenCalledTimes(1)
    expect(options()).toEqual([])
    expect(input().getAttribute("aria-expanded")).toBe("false")
  })

  it("closes on Escape, keeps what was typed, and reopens on the next key", async () => {
    await type("pizza")
    await settle()
    expect(input().getAttribute("aria-expanded")).toBe("true")

    await press("Escape")
    expect(options()).toEqual([])
    expect(input().value).toBe("pizza")

    await type("pizzas")
    await settle()
    expect(options()).toHaveLength(2)
  })

  it("leaves a plain search box when the lookup is refused or fails", async () => {
    vi.mocked(loadDirectorySuggestions).mockResolvedValue({
      categories: [],
      listings: [],
      events: [],
    })
    await type("pizza")
    await settle()
    expect(options()).toEqual([])
    expect(host.textContent).not.toContain("Too many")

    vi.mocked(loadDirectorySuggestions).mockRejectedValue(new Error("offline"))
    await type("burger")
    await settle()
    expect(options()).toEqual([])

    // A failure is not remembered, so typing the word again asks again.
    await type("bur")
    await type("burger")
    await settle()
    expect(loadDirectorySuggestions).toHaveBeenCalledWith("burger")
    expect(vi.mocked(loadDirectorySuggestions).mock.calls.filter(
      ([query]) => query === "burger"
    )).toHaveLength(2)
  })

  it("asks again for a word it has forgotten", async () => {
    // The box remembers the last 30 words. The 31st pushes the first one out,
    // and going back to it has to ask the server again rather than draw a
    // blank list for a word that plainly has matches.
    const words = Array.from({ length: 31 }, (_, index) => `w${index}`)
    for (const word of words) {
      await type(word)
      await settle()
    }
    expect(loadDirectorySuggestions).toHaveBeenCalledTimes(31)

    await type(words[0]!)
    await settle()
    expect(loadDirectorySuggestions).toHaveBeenCalledTimes(32)
    expect(options()).toHaveLength(2)
  })

  it("leaves Enter and the arrows alone while a character is being composed", async () => {
    await type("pizza")
    await settle()

    // Enter here belongs to the keyboard's own character list, not to us.
    await press("Enter", true)
    expect(onSearch).not.toHaveBeenCalled()
    expect(options()).toHaveLength(2)

    await press("ArrowDown", true)
    expect(input().getAttribute("aria-activedescendant")).toBeNull()
  })

  it("only offers the list while the box has the focus", async () => {
    await type("pizza")
    await settle()
    expect(options()).toHaveLength(2)

    await act(async () => input().blur())
    expect(options()).toEqual([])
  })
})
