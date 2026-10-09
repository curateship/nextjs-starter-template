// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { ViralScoreCell } from "@/components/video-viral/viral-score-cell"
import { scoreViralVideo } from "@/lib/video/viral-score"

// The first worked example in viral-score.test.ts: 80, medium, no breakdown.
const score = scoreViralVideo({
  views: 1_200_000,
  likes: 90_000,
  comments: 3_000,
  postedAt: "2026-10-05T12:00:00Z",
  followers: 40_000,
  breakdown: null,
  now: new Date("2026-10-09T12:00:00Z"),
})

/** jsdom has no ResizeObserver, and the open tooltip measures itself. */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
    StubResizeObserver
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ""
})

function render(rowAction = vi.fn()) {
  act(() => {
    root.render(
      <TooltipProvider>
        <Table>
          <TableBody>
            <TableRow rowAction={rowAction}>
              <TableCell column="meta">
                <ViralScoreCell score={score} />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TooltipProvider>
    )
  })
  return rowAction
}

describe("ViralScoreCell", () => {
  it("shows the score with how sure it is beside it", () => {
    render()
    const button = container.querySelector("button")
    expect(button?.textContent).toBe("80sure: medium")
    expect(button?.getAttribute("aria-label")).toContain(
      "Score 80 out of 100, sure: medium"
    )
  })

  it("opens each part's points on a tap, without opening the video", () => {
    const rowAction = render()
    act(() => container.querySelector("button")?.click())

    const shown = document.querySelector('[data-slot="tooltip-content"]')
    const text = shown?.textContent ?? ""
    expect(text).toContain("Views per day30 of 30")
    expect(text).toContain("Views against followers21.8 of 25")
    expect(text).toContain("Likes and comments per view15.5 of 20")
    expect(text).toContain("How recent12.8 of 15")
    expect(text).toContain("Breakdown0 of 10")
    expect(text).toContain("Missing breakdown")
    expect(rowAction).not.toHaveBeenCalled()
  })
})
