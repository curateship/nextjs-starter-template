import { describe, expect, it } from "vitest"

import {
  AUTOMATION_PALETTE_GROUPS,
  AUTOMATION_PALETTE_ITEMS,
  AUTOMATION_PALETTE_KEYS,
  automationNodeConnectionError,
  automationNodeDescription,
  automationNodeHasInput,
  automationNodeIcon,
  automationNodeInspector,
  automationNodeName,
  automationNodeOutputPorts,
  automationNodeSourcePortIsValid,
  automationPaletteKeyForRegisteredNode,
  canConnectAutomationNodes,
  createAutomationNode,
} from "./node-registry"

describe("Automation node registry", () => {
  it("creates every palette node from one complete, unique catalog", () => {
    expect(new Set(AUTOMATION_PALETTE_KEYS).size).toBe(
      AUTOMATION_PALETTE_KEYS.length
    )
    expect(AUTOMATION_PALETTE_KEYS.length).toBe(6)
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

      for (const port of automationNodeOutputPorts(node)) {
        expect(automationNodeSourcePortIsValid(node, port.id)).toBe(true)
      }
      expect(automationNodeSourcePortIsValid(node, "not-a-port")).toBe(false)
    }
  })

  it("only the trigger has no input port", () => {
    for (const item of AUTOMATION_PALETTE_ITEMS) {
      const node = createAutomationNode(item.key, { id: item.key, x: 0, y: 0 })
      expect(automationNodeHasInput(node)).toBe(node.kind !== "trigger")
    }
  })

  it("exposes the expected output ports per kind", () => {
    const portsOf = (key: (typeof AUTOMATION_PALETTE_KEYS)[number]) =>
      automationNodeOutputPorts(
        createAutomationNode(key, { id: key, x: 0, y: 0 })
      ).map((port) => port.id)

    expect(portsOf("trigger-contact-added")).toEqual(["contact"])
    expect(portsOf("flow-branch")).toEqual(["yes", "no"])
    expect(portsOf("action-send-email")).toEqual(["then"])
    expect(portsOf("flow-delay")).toEqual(["then"])
    expect(portsOf("action-tag")).toEqual(["then"])
    expect(portsOf("action-webhook")).toEqual(["then"])
  })

  it("rejects only connections INTO a trigger", () => {
    const trigger = createAutomationNode("trigger-contact-added", {
      id: "trigger",
      x: 0,
      y: 0,
    })
    const email = createAutomationNode("action-send-email", {
      id: "email",
      x: 0,
      y: 0,
    })
    const branch = createAutomationNode("flow-branch", {
      id: "branch",
      x: 0,
      y: 0,
    })

    expect(automationNodeConnectionError(email, "then", trigger)).toBeTruthy()
    expect(canConnectAutomationNodes(email, "then", trigger)).toBe(false)

    expect(automationNodeConnectionError(trigger, "contact", email)).toBeNull()
    expect(automationNodeConnectionError(branch, "yes", email)).toBeNull()
    expect(automationNodeConnectionError(branch, "no", email)).toBeNull()
    expect(automationNodeConnectionError(email, "then", branch)).toBeNull()

    // Invalid output ports are rejected before any target rule runs.
    expect(automationNodeConnectionError(email, "yes", branch)).toBe(
      "Connection uses an invalid output."
    )
    // Self connections are rejected by canConnectAutomationNodes.
    expect(canConnectAutomationNodes(email, "then", email)).toBe(false)
  })
})
