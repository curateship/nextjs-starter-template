import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AUTOMATION_PALETTE_KEYS } from "@/lib/automations/palette"

import { AutomationPalette } from "./automation-palette"

describe("AutomationPalette", () => {
  it("renders every registered favorite with search below the node list", () => {
    const markup = renderToStaticMarkup(
      <AutomationPalette
        favoriteNodeKeys={[...AUTOMATION_PALETTE_KEYS]}
        onSelect={vi.fn()}
        onAdd={vi.fn()}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn()}
      />
    )

    expect(markup).toContain("Fav")
    expect(markup).toContain("All nodes")
    expect(markup).toContain("EMA Cross")
    expect(markup).toContain("Market Scanner")
    expect(markup).toContain("Whale Wall")
    expect(markup).toContain("QFL")
    expect(markup).toContain("Take Profit")
    expect(markup).not.toContain("favorites")
    expect(markup.match(/aria-label="Add [^"]+ node"/g)).toHaveLength(
      AUTOMATION_PALETTE_KEYS.length
    )
    expect(markup).toContain("Add EMA Cross node")
    expect(markup.indexOf("Search nodes…")).toBeGreaterThan(
      markup.indexOf("EMA Cross")
    )
  })
})
