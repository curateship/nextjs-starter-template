// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("@/components/shell/shell-layout", () => {
  const runtime = { config: { styling: { dashboardTabs: "pills" } } }
  return { useShellRuntime: () => runtime, useOptionalShellRuntime: () => runtime }
})

const { HeaderChoice, ListHeader } = await import("./list-header")
const { TooltipProvider } = await import("@/components/ui/tooltip")

/**
 * Content's one list header (Tyler, 27 Nov 2026, `workspace/tasks/Misc/misc.md`):
 * search as an icon, the list's own dropdown right after it, and Select in a ⋮.
 */
describe("the list header", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  async function draw(node: React.ReactNode) {
    await act(async () => {
      root.render(<TooltipProvider>{node}</TooltipProvider>)
    })
  }
  const labels = () => Array.from(container.querySelectorAll("button")).map((one) => one.getAttribute("aria-label") || one.textContent?.trim())

  it("draws the search as an icon, with the list's dropdown after it and before Filter, wherever the dropdown is written", async () => {
    const onToggle = vi.fn()
    await draw(
      <ListHeader
        tabs={
          <span>
            Lead
            <HeaderChoice>
              <button type="button">Which list</button>
            </HeaderChoice>
          </span>
        }
        filter={<button type="button">Filter</button>}
        primary={<button type="button">New thing</button>}
        menuLabel="More for things"
        search={{ name: "thing-search", label: "Search things", placeholder: "Search things", value: "", onChange: () => {} }}
        massSelect={{ on: false, onToggle }}
      />
    )
    // No search box until the icon is pressed.
    expect(container.querySelector("input")).toBeNull()
    const order = labels()
    expect(order.indexOf("Search things")).toBeGreaterThan(-1)
    expect(order.indexOf("Which list")).toBeGreaterThan(order.indexOf("Search things"))
    expect(order.indexOf("Filter")).toBeGreaterThan(order.indexOf("Which list"))
    // Select is no button of its own: it is in the list's ⋮.
    expect(order).not.toContain("Mass select")
    expect(order).toContain("More for things")
  })

  it("draws a dropdown in place outside a list header", async () => {
    await draw(
      <HeaderChoice>
        <button type="button">Which list</button>
      </HeaderChoice>
    )
    expect(labels()).toEqual(["Which list"])
  })
})
