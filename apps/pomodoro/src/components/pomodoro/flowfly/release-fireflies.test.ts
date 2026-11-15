// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FIREFLIES_PER_TICK,
  releaseFireflies,
} from "@/components/pomodoro/flowfly/release-fireflies"

/** Tyler, 15 Nov 2026: "Build the fireflies lifting off from the tick box". */

function tickBox() {
  const box = document.createElement("button")
  box.getBoundingClientRect = () =>
    ({ left: 100, top: 200, width: 20, height: 20 }) as DOMRect
  document.body.append(box)
  return box
}

function wantsLessMotion(wants: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: wants })
}

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe("releaseFireflies", () => {
  it("draws the fireflies over the middle of the tick box, then clears them", () => {
    vi.useFakeTimers()
    wantsLessMotion(false)
    releaseFireflies(tickBox())

    const burst = document.querySelector<HTMLElement>(".flowfly-burst")
    expect(burst?.style.left).toBe("110px")
    expect(burst?.style.top).toBe("210px")
    expect(burst?.children).toHaveLength(FIREFLIES_PER_TICK)
    // Every firefly rises: none is sent down over the task's own text.
    for (const firefly of burst!.children)
      expect(
        parseFloat((firefly as HTMLElement).style.getPropertyValue("--fly-y"))
      ).toBeLessThan(0)

    vi.advanceTimersByTime(2000)
    expect(document.querySelector(".flowfly-burst")).toBeNull()
  })

  it("draws nothing when the device asks for less motion", () => {
    wantsLessMotion(true)
    releaseFireflies(tickBox())
    expect(document.querySelector(".flowfly-burst")).toBeNull()
  })
})
