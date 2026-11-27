// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ShowLeftPanelProvider } from "@/components/shared/three-panels"
import { WidgetCard, WidgetMenuOptions } from "@/components/shared/widgets/widget-card"
import { ManageWidgetsProvider, WidgetMenu } from "@/components/shared/widgets/widget-menus"

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function Widget({ options }: { options?: React.ReactNode }) {
  return (
    <WidgetCard title="PnL Graph" icon={null} menu={<WidgetMenu title="PnL Graph" />}>
      {options ? <WidgetMenuOptions>{options}</WidgetMenuOptions> : null}
      <p>The graph</p>
    </WidgetCard>
  )
}

async function openMenu() {
  const more = host.querySelector<HTMLButtonElement>('button[aria-label="More for PnL Graph"]')
  expect(more).not.toBeNull()
  await act(async () => more?.click())
  return document.querySelector<HTMLElement>('[data-slot="popover-content"]')
}

/**
 * A widget's ⋮ holds the widget's own options, then Manage widgets, which
 * shows the left panel and opens its ⋮ at Widgets (Tyler, 10 Nov 2026). It no
 * longer swaps or removes the widget.
 */
describe("a widget's ⋮", () => {
  it("shows the widget's own options, then Manage widgets, and never the widget list", async () => {
    const manage = vi.fn()
    const showLeft = vi.fn()
    await act(async () =>
      root.render(
        <ShowLeftPanelProvider value={showLeft}>
          <ManageWidgetsProvider value={manage}>
            <Widget options={<p>Exchange filter</p>} />
          </ManageWidgetsProvider>
        </ShowLeftPanelProvider>
      )
    )
    // The options are in the ⋮, not on the card.
    expect(host.textContent).not.toContain("Exchange filter")
    const menu = await openMenu()
    expect(menu?.textContent).toContain("Exchange filter")
    expect(menu?.textContent).not.toContain("Remove widget")
    expect(menu?.textContent).not.toContain("Moves here")

    const row = [...(menu?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Manage widgets")
    expect(row).toBeDefined()
    await act(async () => row?.click())
    expect(showLeft).toHaveBeenCalledOnce()
    expect(manage).toHaveBeenCalledOnce()
  })

  it("is Manage widgets alone for a widget with no options", async () => {
    await act(async () =>
      root.render(
        <ManageWidgetsProvider value={vi.fn()}>
          <Widget />
        </ManageWidgetsProvider>
      )
    )
    const menu = await openMenu()
    expect(menu?.textContent).toBe("Manage widgets")
  })

  it("is not drawn with nothing to hold", async () => {
    await act(async () => root.render(<Widget />))
    expect(host.querySelector('button[aria-label="More for PnL Graph"]')).toBeNull()
  })
})
