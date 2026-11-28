// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { AnalysisCards } from "@/components/viral/analysis-cards"
import type { AnalysisPieces } from "@/lib/viral/analysis"

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

const pieces: AnalysisPieces = {
  whyItWorks: {
    hook: "It names a pain the viewer feels while watching.",
    parts: [
      { role: "hook", summary: "Names a pain the viewer has right now." },
      { role: "problem", summary: "Says why it happens, in one line." },
    ],
    whySpread: "People send it to a friend who sits all day.",
  },
  script: [],
  ideas: [],
  title: { title: "", caption: "", hashtags: [] },
}

describe("Why it works", () => {
  it("says the hook once: the parts after \"The hook.\" leave out the breakdown's own Hook part", async () => {
    await act(async () => root.render(<AnalysisCards pieces={pieces} topic="Desk stretches" />))
    const parts = [...container.querySelectorAll("ol li")].map((item) => item.textContent)
    expect(container.textContent).toContain("The hook. It names a pain the viewer feels while watching.")
    expect(parts).toEqual(["Problem. Says why it happens, in one line."])
  })

  it("keeps the Hook part when there is no hook line to say it", async () => {
    await act(async () => root.render(<AnalysisCards pieces={{ ...pieces, whyItWorks: { ...pieces.whyItWorks, hook: "" } }} topic="Desk stretches" />))
    const parts = [...container.querySelectorAll("ol li")].map((item) => item.textContent)
    expect(parts).toEqual(["Hook. Names a pain the viewer has right now.", "Problem. Says why it happens, in one line."])
  })
})
