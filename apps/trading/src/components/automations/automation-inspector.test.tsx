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
})
