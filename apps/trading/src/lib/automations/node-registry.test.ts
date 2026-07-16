import { describe, expect, it } from "vitest"

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
  createAutomationNode,
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
