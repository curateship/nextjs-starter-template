import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"
import {
  DEFAULT_MARKET_SCANNER_SETTINGS,
} from "@/lib/automations/dca-ladder"
import { INDICATORS } from "@/lib/indicators/registry"

import { AutomationInspector } from "./automation-inspector"

const longNode: AutomationNode = {
  id: "long-1",
  kind: "action",
  action: "buy",
  targetEquityPct: 10,
  x: 0,
  y: 0,
}

describe("AutomationInspector", () => {
  it("shows the favorite control in the selected node settings header", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={longNode}
        errors={[]}
        favorite
        onNodeChange={vi.fn()}
        onToggleFavorite={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).toContain("Remove Long from favorites")
    expect(markup).toContain('aria-pressed="true"')
  })

  it("does not show a favorite control without a selected node", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={null}
        errors={[]}
        onNodeChange={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).not.toContain("favorites")
  })

  it("groups action settings in a card and keeps node actions side by side", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={longNode}
        errors={[]}
        onNodeChange={vi.fn()}
        onAddNode={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).toContain("Target account equity %")
    expect(markup.match(/data-slot="card"/g)).toHaveLength(1)
    expect(markup).toContain("bg-muted/40")
    expect(markup).toContain("grid-cols-2")
    expect(markup).toContain("Add node")
    expect(markup).toContain("Delete node")
    expect(markup).not.toContain("relative border-b px-4 py-3")
  })

  it("keeps market choice out of the Market Scanner node", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={{
          id: "scanner-1",
          kind: "marketScanner",
          ...DEFAULT_MARKET_SCANNER_SETTINGS,
          x: 0,
          y: 0,
        }}
        errors={[]}
        onNodeChange={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).toContain("Minimum daily volume (USD)")
    expect(markup).toContain("Require minimum market history")
    expect(markup).toContain("Markets are chosen when creating the bot")
    expect(markup).not.toContain("Choose markets")
    expect(markup).not.toContain("Excluded markets")
  })

  it("groups QQE settings into light gray cards", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={{
          id: "qqe-1",
          kind: "indicator",
          indicator: {
            type: "qqe",
            params: { ...INDICATORS.qqe.defaultParams },
          },
          x: 0,
          y: 0,
        }}
        errors={[]}
        onNodeChange={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).toContain("QQE")
    expect(markup).toContain("Consolidation")
    expect(markup).toContain("Swing levels")
    expect(markup).toContain("Consolidation filter")
    expect(markup.match(/data-slot="card"/g)).toHaveLength(3)
    expect(markup.match(/bg-muted\/40/g)).toHaveLength(3)
  })

  const stopNode = (
    overrides: Partial<Extract<AutomationNode, { kind: "stopLoss" }>> = {}
  ): AutomationNode => ({
    id: "sl-1",
    kind: "stopLoss",
    pct: 2,
    x: 0,
    y: 0,
    ...overrides,
  })

  const inspect = (node: AutomationNode) =>
    renderToStaticMarkup(
      <AutomationInspector
        selectedNode={node}
        errors={[]}
        onNodeChange={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

  // A Select's options only exist once its menu opens, so these assert the
  // controls and their labels rather than the option text.
  it("offers the stop a level control alongside the percent one", () => {
    const markup = inspect(stopNode())
    expect(markup).toContain("Stop sits at")
    expect(markup).toContain('id="stop-level-sl-1"')
    expect(markup).toContain("Stop behavior")
    expect(markup).toContain("Stop loss %")
  })

  it("a session-open stop drops the trailing controls and relabels the percent", () => {
    const markup = inspect(stopNode({ level: "sessionOpen" }))
    // Trailing is meaningless against one fixed price, so its control goes.
    expect(markup).not.toContain("Stop behavior")
    expect(markup).toContain("Stop loss % (outside the session)")
    expect(markup).toContain("Wire a Sessions node into this one")
    expect(markup).toContain("Sits at the opening price of the session wired")
  })

  it("offers the take profit an R&R ratio, and swaps the percent for it", () => {
    const percent = inspect({ id: "tp-1", kind: "takeProfit", pct: 3, x: 0, y: 0 })
    expect(percent).toContain("Take profit measured as")
    expect(percent).toContain("Take profit %")
    expect(percent).not.toContain("R&amp;R ratio (reward")

    const ratio = inspect({
      id: "tp-1",
      kind: "takeProfit",
      pct: 3,
      rrRatio: 2,
      x: 0,
      y: 0,
    })
    expect(ratio).toContain("R&amp;R ratio (reward")
    expect(ratio).toContain("2:1")
    // One target or the other — never both boxes at once.
    expect(ratio).not.toContain("Take profit %")
  })
})
