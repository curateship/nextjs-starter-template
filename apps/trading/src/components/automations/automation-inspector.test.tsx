import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { AutomationNode } from "@/lib/automations/automation"

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
})
