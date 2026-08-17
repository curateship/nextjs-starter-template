import { describe, expect, it } from "vitest"

import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import type { AutomationNode } from "@/lib/automations/graph"

/**
 * The one line the ladder step puts on the canvas.
 *
 * It is read at a glance, next to every other step, by somebody deciding
 * whether to press Run — so anything that changes what the rest of the numbers
 * on it mean has to appear there rather than one click deeper.
 */

function card(params: Record<string, unknown> = {}): string {
  const base = tradeDcaNode.createSettings() as {
    params: Record<string, unknown>
  }
  return tradeDcaNode.description({
    ...base,
    params: { ...base.params, ...params },
  } as AutomationNode["settings"])
}

describe("what the ladder's card says about borrowing", () => {
  it("stays quiet while the ladder buys with cash", () => {
    const line = card()
    expect(line).not.toContain("Borrows")
    // Still says the things it always said.
    expect(line).toContain("rungs")
    expect(line).toContain("of the pot per coin")
  })

  it("says so on the card once it borrows", () => {
    // On the card and not only in the panel: a ladder that can be sold out
    // from under itself must not look like one that cannot.
    expect(card({ leverage: 2 })).toContain("Borrows 2×.")
  })

  it("still describes a step whose settings will not parse", () => {
    expect(tradeDcaNode.description({ params: "nonsense" })).toContain("ladder")
  })
})
