import { describe, expect, it } from "vitest"

import type { AutomationConfig, AutomationNode } from "./automation"
import {
  AUTOMATION_PALETTE_GROUPS,
  AUTOMATION_PALETTE_ITEMS,
  AUTOMATION_PALETTE_KEYS,
  automationNodeAttachmentPorts,
  automationNodeDescription,
  automationNodeIcon,
  automationNodeInspector,
  automationNodeName,
  automationNodeOutputPorts,
  automationNodeSourcePortIsValid,
  automationPaletteKeyForRegisteredNode,
  configNodeOverlays,
  createAutomationNode,
  nodeTuneUpdate,
  orderLabelFor,
} from "./node-registry"

describe("Automation node registry", () => {
  it("creates every palette node from one complete, unique catalog", () => {
    expect(new Set(AUTOMATION_PALETTE_KEYS).size).toBe(
      AUTOMATION_PALETTE_KEYS.length
    )
    expect(AUTOMATION_PALETTE_ITEMS.map((item) => item.key)).toEqual(
      AUTOMATION_PALETTE_KEYS
    )
    expect(new Set(AUTOMATION_PALETTE_ITEMS.map((item) => item.group))).toEqual(
      new Set(AUTOMATION_PALETTE_GROUPS)
    )

    for (const item of AUTOMATION_PALETTE_ITEMS) {
      const node = createAutomationNode(item.key, { id: item.key, x: 4, y: 8 })
      expect(node).toMatchObject({ id: item.key, x: 4, y: 8 })
      expect(automationPaletteKeyForRegisteredNode(node)).toBe(item.key)
      expect(automationNodeName(node)).toBe(item.name)
      expect(automationNodeDescription(node).length).toBeGreaterThan(0)
      expect(automationNodeIcon(node)).toBe(item.icon)
      expect(automationNodeInspector(node)).toBeTruthy()

      for (const port of [
        ...automationNodeOutputPorts(node),
        ...automationNodeAttachmentPorts(node),
      ]) {
        expect(automationNodeSourcePortIsValid(node, port.id)).toBe(true)
      }
    }
  })

  it("keeps legacy nodes readable without putting them in the palette", () => {
    const legacy = {
      id: "legacy",
      kind: "logic",
      op: "and",
      x: 0,
      y: 0,
    } as const

    expect(automationPaletteKeyForRegisteredNode(legacy)).toBeNull()
    expect(automationNodeName(legacy)).toBe("AND")
    expect(automationNodeInspector(legacy)).toBe("legacy")
  })
})

describe("orderLabelFor", () => {
  it("decodes QFL purposes exactly as before (byte-identical)", () => {
    expect(orderLabelFor("qfl:b:3")).toBe("Buy 4")
    expect(orderLabelFor("qfl:tp:3")).toBe("TP 4")
    expect(orderLabelFor("qfl:b:0")).toBe("Buy 1")
  })
  it("now decodes DCA purposes with the same grammar", () => {
    expect(orderLabelFor("dca:b:2")).toBe("Buy 3")
    expect(orderLabelFor("dca:s:1")).toBe("Sell 2")
    expect(orderLabelFor("dca:s:all")).toBe("Sell all")
    expect(orderLabelFor("dca:s:cash")).toBe("Money back")
    expect(orderLabelFor("dca:s:free")).toBe("Free ride")
  })
  it("falls back to the cleaned purpose for anything else", () => {
    expect(orderLabelFor("auto:take-profit")).toBe("take profit")
    expect(orderLabelFor("dca:exit")).toBe("dca:exit")
  })
})

describe("configNodeOverlays", () => {
  it("now draws the DCA base overlay too (was hand-patched in the chart)", () => {
    const config = {
      dca: { nodeId: "d1", basePeriods: 20, pumpPeriods: 5 },
    } as unknown as AutomationConfig
    expect(configNodeOverlays(config)).toEqual([
      {
        id: "d1:base",
        type: "base",
        enabled: true,
        params: { basePeriods: 20, pumpPeriods: 5 },
      },
    ])
  })
  it("draws nothing when the config has no strategy node", () => {
    expect(configNodeOverlays({} as AutomationConfig)).toEqual([])
  })
})

describe("nodeTuneUpdate", () => {
  const tp: AutomationNode = { id: "tp1", kind: "takeProfit", pct: 2, x: 0, y: 0 }
  const sl: AutomationNode = { id: "sl1", kind: "stopLoss", pct: 1.5, x: 0, y: 0 }

  it("owns the take-profit % math (side-aware, off the entry anchor)", () => {
    expect(nodeTuneUpdate(tp, "tp", 105, 100, "long")).toEqual({ ...tp, pct: 5 })
    expect(nodeTuneUpdate(tp, "tp", 95, 100, "short")).toEqual({ ...tp, pct: 5 })
  })

  it("owns the stop-loss % math (side-aware, off the entry anchor)", () => {
    expect(nodeTuneUpdate(sl, "sl", 97, 100, "long")).toEqual({ ...sl, pct: 3 })
    expect(nodeTuneUpdate(sl, "sl", 103, 100, "short")).toEqual({ ...sl, pct: 3 })
  })

  it("returns null for a mismatched target, node, or non-positive price/ref", () => {
    expect(nodeTuneUpdate(tp, "sl", 97, 100, "long")).toBeNull()
    expect(nodeTuneUpdate(sl, "crack", 190, 200, "long")).toBeNull()
    expect(nodeTuneUpdate(tp, "tp", 0, 100, "long")).toBeNull()
    expect(nodeTuneUpdate(tp, "tp", 105, 0, "long")).toBeNull()
  })
})
