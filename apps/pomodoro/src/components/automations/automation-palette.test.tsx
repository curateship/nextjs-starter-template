import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { AutomationPalette } from "@/components/automations/automation-palette"

describe("the automation palette's panel gutter", () => {
  it("uses the same 12px gutter as its tab header", () => {
    const markup = renderToStaticMarkup(
      <AutomationPalette
        favoriteNodeKeys={[]}
        onSelect={() => {}}
        onAdd={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    )

    expect(markup).toContain("flex flex-col gap-4 p-3")
    expect(markup).not.toContain("p-4 sm:p-5")
  })
})
