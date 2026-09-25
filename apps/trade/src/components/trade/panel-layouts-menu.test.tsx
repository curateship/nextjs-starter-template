// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PanelLayoutsMenu } from "@/components/trade/panel-layouts-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { NamedPanelLayout } from "@/lib/trade/panel-layout"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

const horizontal = { markets: 20, chart: 58, "smart-orders": 22 }
const vertical = { workspace: 72, activity: 28 }

let host: HTMLDivElement
let root: Root
let created: ReturnType<typeof vi.fn<(name: string) => void>>
let applied: ReturnType<typeof vi.fn<(id: string) => void>>
let deleted: ReturnType<typeof vi.fn<(id: string) => void>>

function Harness() {
  const [layouts, setLayouts] = React.useState<NamedPanelLayout[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  return (
    <TooltipProvider>
      <PanelLayoutsMenu
        layouts={layouts}
        activeId={activeId}
        onCreate={async (name) => {
          created(name)
          setLayouts([
            {
              id: "layout-1",
              name,
              horizontal,
              vertical,
              openMarketRows: {},
            },
          ])
          setActiveId("layout-1")
        }}
        onApply={async (id) => {
          applied(id)
          setActiveId(id)
        }}
        onDelete={async (id) => {
          deleted(id)
          setLayouts([])
          setActiveId(null)
        }}
      />
    </TooltipProvider>
  )
}

beforeEach(async () => {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  created = vi.fn()
  applied = vi.fn()
  deleted = vi.fn()
  await act(async () => root.render(<Harness />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

describe("the saved panel layout menu", () => {
  it("creates, switches and confirms deletion without a save button", async () => {
    await act(async () => button("Saved panel layouts").click())
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Layout name"]'
    )
    if (!input) throw new Error("Missing panel layout name")
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set?.call(input, "Reading")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => button("Create layout").click())
    expect(created).toHaveBeenCalledWith("Reading")
    expect(button("Use Reading").getAttribute("data-state")).toBe("checked")

    await act(async () => button("Use Reading").click())
    expect(applied).toHaveBeenCalledWith("layout-1")
    expect(
      document.querySelector('button[aria-label^="Save changes to"]')
    ).toBeNull()

    const deleteButton = button("Delete Reading")
    expect(deleteButton.getAttribute("data-variant")).toBe("ghost")
    expect(deleteButton.className).toContain("opacity-0")
    await act(async () => deleteButton.click())
    expect(document.body.textContent).toContain("Delete saved layout?")
    await act(async () => button("Delete layout", false).click())
    expect(deleted).toHaveBeenCalledWith("layout-1")
  })
})

function button(name: string, aria = true) {
  const found = aria
    ? document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
    : Array.from(document.querySelectorAll("button")).find(
        (item) => item.textContent?.trim() === name
      )
  if (!found) throw new Error(`Missing ${name}`)
  return found
}
