// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BreakdownPanel } from "@/components/video-viral/breakdown-panel"
import type { ViralBreakdown } from "@/lib/video/viral-breakdown"

const breakdown: ViralBreakdown = {
  transcript: [{ startMs: 0, endMs: 1200, text: "Who let the dogs out" }],
  segments: [
    { role: "hook", startMs: 0, endMs: 2000, summary: "A familiar scene." },
    { role: "solution", startMs: 2000, endMs: 6000, summary: "The punchline." },
  ],
  scenes: [{ startMs: 0, endMs: 6000 }],
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("the breakdown's sections", () => {
  it("each has a heading with a count and a line saying what it is", () => {
    act(() => root.render(<BreakdownPanel breakdown={breakdown} onSeek={() => undefined} />))
    const headings = [...container.querySelectorAll("h2")].map((h) => h.textContent)
    expect(headings).toEqual(["How it is built · 2", "Shots · 1", "What is said · 1"])
    expect(container.textContent).toContain("The video is one shot: the picture never cuts away.")
    expect(container.textContent).toContain("Click one to play from there.")
    expect(container.textContent).toContain("0:00 to 0:02")
  })

  it("does not say to click when there is no player to jump", () => {
    act(() => root.render(<BreakdownPanel breakdown={breakdown} />))
    expect(container.textContent).not.toContain("Click")
  })
})
