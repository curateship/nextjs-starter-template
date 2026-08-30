// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import TradeGridFields from "@/components/automations/nodes/trade-grid-panel"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  emaGridCleanHours,
  tradeGridNode,
  tradeGridSettingsSchema,
} from "@/lib/automations/nodes/trade-grid"
import type { AutomationNode } from "@/lib/automations/graph"

function draw(settings = tradeGridNode.createSettings()): string {
  const node: AutomationNode = {
    id: "grid-1",
    kind: tradeGridNode.kind,
    x: 0,
    y: 0,
    settings,
  }
  return renderToStaticMarkup(
    <TooltipProvider>
      <TradeGridFields node={node} onChange={() => {}} />
    </TooltipProvider>
  )
}

describe("the Grid step panel", () => {
  it("shows the clean-run and grid settings without a direction choice", () => {
    const html = draw()

    expect(html).toContain("Clean hours")
    expect(html).toContain("EMA candles")
    expect(html).toContain("Range from the current price")
    expect(html).toContain("Share of wallet")
    expect(html).toContain("Follow price up")
    expect(html).toContain("Follow price down")
    expect(html).toContain("Set each rung by hand")
    expect(html).toContain(
      "Range and the number of rungs set how far apart the rung prices are"
    )
    expect(html).toContain("Use Add rung or the trash button")
    expect(html).toContain("percentages only divide the grid&#x27;s money")
    expect(html).toContain("Emergency stop past the losing edge")
    expect(html).toContain("Only Stop on the flow ends the EMA loop")
    expect(html).not.toContain("End Grid past the winning edge")
    expect(html).not.toContain("Buy the dips")
    expect(html).not.toContain("Sell the rallies")
  })

  it("starts with the agreed saved values", () => {
    const html = draw()

    expect(html).toContain('value="72"')
    expect(html).toContain('value="200"')
    expect(html).toContain('value="12"')
    expect(html).toContain('value="20"')
  })

  it("shows every custom rung and its saved share", () => {
    const settings = tradeGridSettingsSchema.parse(
      tradeGridNode.createSettings()
    )
    settings.grid = {
      ...settings.grid,
      levels: 4,
      manualSizing: true,
      manualRungPcts: [10, 20, 30, 40],
    }

    const html = draw(settings)

    expect(html).toContain("This grid has 4 custom rungs")
    expect(html).toContain("Rung 1")
    expect(html).toContain("Rung 4")
    expect(html).toContain('value="10"')
    expect(html).toContain('value="40"')
    expect(html).toContain("Adds up to")
    expect(html).toContain("100%")
  })

  it("saves clean hours, custom rungs, and both following switches", async () => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    const settings = tradeGridSettingsSchema.parse(
      tradeGridNode.createSettings()
    )
    settings.grid.levels = 4
    const first: AutomationNode = {
      id: "grid-1",
      kind: tradeGridNode.kind,
      x: 0,
      y: 0,
      settings,
    }
    let saved = first
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    function Panel() {
      const [node, setNode] = useState(first)
      return (
        <TooltipProvider>
          <TradeGridFields
            node={node}
            onChange={(next) => {
              saved = next
              setNode(next)
            }}
          />
        </TooltipProvider>
      )
    }

    await act(async () => root.render(<Panel />))
    const hours = host.querySelector<HTMLInputElement>("#grid-grid-1-hours")
    expect(hours).not.toBeNull()
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setValue?.call(hours, "8")
      hours?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>("#grid-grid-1-manual-rungs")
        ?.click()
    )

    expect(host.querySelector("#grid-grid-1-rung-1")).not.toBeNull()
    expect(host.querySelector("#grid-grid-1-rung-4")).not.toBeNull()
    expect(host.querySelector("#grid-grid-1-rung-5")).toBeNull()

    await act(async () =>
      host.querySelector<HTMLButtonElement>("#grid-grid-1-follow-up")?.click()
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#grid-grid-1-follow-down")?.click()
    )

    const parsed = tradeGridSettingsSchema.parse(saved.settings)
    expect(emaGridCleanHours(parsed)).toBe(8)
    expect(parsed.grid).toMatchObject({
      levels: 4,
      manualSizing: true,
      manualRungPcts: [25, 25, 25, 25],
      follow: true,
      followDown: true,
    })

    await act(async () => root.unmount())
    host.remove()
  })
})
