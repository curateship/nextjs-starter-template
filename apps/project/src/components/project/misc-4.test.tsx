// @vitest-environment jsdom
import { act } from "react"
import { createPortal } from "react-dom"
import { createRoot } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import { foldOnHeadingClick } from "@/lib/project/heading-fold"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = null
  root = null
})

function render(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(node))
  return host
}

// Misc 4, 28 Oct 2026: "Make section one click to uncollapsed".
describe("a List heading", () => {
  function heading(toggle: () => void) {
    return render(
      <h3 onClick={foldOnHeadingClick(toggle)}>
        <span>No date</span>
        <button type="button">+</button>
      </h3>
    )
  }

  it("folds or opens on a click anywhere on it", () => {
    const toggle = vi.fn()
    const box = heading(toggle)
    act(() => box.querySelector("span")!.click())
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it("leaves a click inside a dropdown opened from it alone", () => {
    const toggle = vi.fn()
    // React passes a portaled dropdown's clicks up to the heading, though the
    // dropdown sits elsewhere on the page.
    const outside = document.createElement("div")
    document.body.append(outside)
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    act(() =>
      root!.render(
        <h3 onClick={foldOnHeadingClick(toggle)}>
          No date
          {createPortal(<div role="option">High</div>, outside)}
        </h3>
      )
    )
    act(() => (outside.querySelector("[role=option]") as HTMLElement).click())
    expect(toggle).not.toHaveBeenCalled()
    outside.remove()
  })

  it("leaves a click on its own buttons to them", () => {
    const toggle = vi.fn()
    const box = heading(toggle)
    act(() => box.querySelector("button")!.click())
    expect(toggle).not.toHaveBeenCalled()
  })
})
