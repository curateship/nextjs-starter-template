// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ProjectBlockCard, QuietHeadingButtons } from "@/components/project/notes/project-block-card"
import { PanelCard } from "@/components/project/panel-card"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * The shell's block card as Project draws it (task "Shell
 * look/three-panel-shell-look", 9 Nov 2026), mounted in a page, because what
 * goes into a block's heading row arrives there by a portal once the block
 * has drawn, which a page drawn on the server never shows.
 */

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  window.localStorage.clear()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const heading = () => container.querySelector("h2")!.parentElement!
const tile = () => container.querySelector<HTMLElement>("[data-block-tile]")!

describe("an employee's card in the block look", () => {
  it("puts its note, badge and button in the heading, its body on the tile, and folds by its name", async () => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <PanelCard
            storageId="test-checkin"
            icon={<span />}
            title="Today's check-in"
            meta="Oct 12 to 13"
            badge={<span>Late</span>}
            action={<button type="button">Mark all read</button>}
          >
            <input aria-label="A field" />
          </PanelCard>
        </TooltipProvider>
      )
    })
    expect(heading().textContent).toContain("Oct 12 to 13")
    expect(heading().textContent).toContain("Late")
    expect(heading().querySelector("button:not([aria-hidden])")?.textContent).toBe("Today's check-in")
    expect([...heading().querySelectorAll("button")].map((b) => b.textContent)).toContain("Mark all read")
    // The field is on the white tile and takes typing.
    const field = tile().querySelector("input")!
    expect(field).not.toBeNull()
    field.focus()
    expect(document.activeElement).toBe(field)
    // Not a "/" block: nothing to delete.
    expect(container.querySelector("[aria-label^='More for']")).toBeNull()
    // Pressing the name folds it; the body hides and the heading's own buttons go with it.
    await act(async () => heading().querySelector<HTMLButtonElement>("h2 button")!.click())
    expect(tile().closest("[data-state]")?.getAttribute("data-state")).toBe("closed")
  })
})

describe("a block with buttons of its own", () => {
  it("puts them in the heading row before the ⋮, which ends with Delete block", async () => {
    let removed = false
    await act(async () => {
      root.render(
        <TooltipProvider>
          <ProjectBlockCard
            editing={{ editable: true, remove: () => (removed = true) }}
            kind="project-p1"
            title="Website"
            icon={<span />}
          >
            <QuietHeadingButtons>
              <button type="button" aria-label="New task in Website" />
              <button type="button" aria-label="Open Website" />
            </QuietHeadingButtons>
            <p>On track</p>
          </ProjectBlockCard>
        </TooltipProvider>
      )
    })
    const labels = [...heading().querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? b.textContent)
    expect(labels.indexOf("New task in Website")).toBeGreaterThan(-1)
    expect(labels.indexOf("Open Website")).toBeLessThan(labels.indexOf("More for Website"))
    // What it shows scrolls in a scroll area filling the tile, as Trade's blocks do.
    expect(tile().querySelector('[data-slot="scroll-area-viewport"]')?.textContent).toContain("On track")
    expect(removed).toBe(false)
  })
})
