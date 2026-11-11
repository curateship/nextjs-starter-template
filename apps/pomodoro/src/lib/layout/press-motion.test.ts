// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import "@/lib/layout/press-motion"

function bar(kind: "data-open-bar" | "data-dashboards-bar") {
  const element = document.createElement("span")
  element.setAttribute(kind, "")
  document.body.appendChild(element)
  return element
}

describe("press-motion", () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it("arms only the bars on screen when the press lands, for two seconds", () => {
    vi.useFakeTimers()
    const before = bar("data-open-bar")
    const side = bar("data-dashboards-bar")

    window.dispatchEvent(new Event("pointerdown"))
    // Drawn after the press, as a refresh or the page's own pick on arrival draws it.
    const after = bar("data-open-bar")

    expect(before.hasAttribute("data-slide-armed")).toBe(true)
    expect(side.hasAttribute("data-slide-armed")).toBe(true)
    expect(after.hasAttribute("data-slide-armed")).toBe(false)

    vi.advanceTimersByTime(2000)
    expect(before.hasAttribute("data-slide-armed")).toBe(false)
    expect(side.hasAttribute("data-slide-armed")).toBe(false)
  })

  it("arms nothing without a press, so a page that has just loaded never slides", () => {
    const loaded = bar("data-open-bar")
    expect(loaded.hasAttribute("data-slide-armed")).toBe(false)
  })
})
