import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"
import {
  DEFAULT_MARKET_SCANNER_SETTINGS,
  DEFAULT_QFL_SETTINGS,
} from "@/lib/automations/qfl"
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

  it("shows QFL ladder, exposure, and recovery controls", () => {
    const markup = renderToStaticMarkup(
      <AutomationInspector
        selectedNode={{
          id: "qfl-1",
          kind: "qfl",
          ...DEFAULT_QFL_SETTINGS,
          x: 0,
          y: 0,
        }}
        errors={[]}
        onNodeChange={vi.fn()}
        onDeleteNode={vi.fn()}
      />
    )

    expect(markup).toContain("Panic setup")
    expect(markup).toContain("Maximum across QFL (%)")
    expect(markup).toContain("Past base quality")
    expect(markup).toContain("h-full min-h-0 flex-1")
    expect(markup).toContain('data-slot="scroll-area"')
    expect(markup.match(/data-slot="card"/g)).toHaveLength(4)
    expect(markup.match(/bg-muted\/40/g)).toHaveLength(4)
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
