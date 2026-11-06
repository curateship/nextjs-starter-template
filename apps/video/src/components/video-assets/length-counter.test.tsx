// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it } from "vitest"

import { LengthCounter } from "@/components/video-assets/length-counter"
import { SteadyLabel } from "@/components/video-assets/steady-label"

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function draw(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

describe("the count under a text box", () => {
  it("draws nothing while the words are well short of the limit", () => {
    expect(draw(<LengthCounter length={3_999} max={5_000} />).textContent).toBe("")
  })

  it("shows the count from 80 out of 100 of the limit", () => {
    expect(draw(<LengthCounter length={4_000} max={5_000} />).textContent).toBe("4,000 / 5,000")
  })

  it("turns red at the limit", () => {
    const counter = draw(<LengthCounter length={5_000} max={5_000} />).querySelector("span")
    expect(counter?.className).toContain("text-destructive")
  })
})

describe("a busy button's words", () => {
  it("holds only the words showing, with the other as an invisible shadow", () => {
    const idle = draw(<SteadyLabel busy={false} idle="Write it with AI" working="Writing…" />)
    expect(idle.textContent).toBe("Write it with AI")
    expect(idle.querySelector("[data-other]")?.getAttribute("data-other")).toBe("Writing…")
  })

  it("swaps them while busy", () => {
    const busy = draw(<SteadyLabel busy idle="Write it with AI" working="Writing…" />)
    expect(busy.textContent).toBe("Writing…")
    expect(busy.querySelector("[data-other]")?.getAttribute("data-other")).toBe("Write it with AI")
  })
})
