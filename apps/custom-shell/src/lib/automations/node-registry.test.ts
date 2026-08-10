import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

import {
  defineNode,
  type AutomationNodeDescriptor,
} from "@/lib/automations/node-descriptor"

/**
 * An app built from this shell adds its own automation steps through
 * `src/app/options.ts`, because it can never edit the shell's own list. This is
 * that path: the app's steps land beside the shell's, and a step that tries to
 * take one of the shell's over is refused rather than quietly winning.
 *
 * The app's answers are stood in for here. Reading this app's real ones would
 * only ever assert that custom-shell adds nothing, which is true and says
 * nothing about an app that does.
 */

const appNodes = vi.hoisted(() => ({
  current: [] as readonly AutomationNodeDescriptor[],
  groups: [] as readonly string[],
}))

vi.mock("@/lib/app-options", () => ({
  appAutomationNodes: () => appNodes.current,
  appPaletteGroups: () => appNodes.groups,
}))

/** The least a node can be and still be one. */
function testNode(
  kind: string,
  overrides: Partial<AutomationNodeDescriptor> = {}
) {
  return defineNode({
    kind,
    palette: { key: kind, group: "Actions", description: "A test step" },
    createSettings: () => ({ note: "" }),
    settingsSchema: z.object({ note: z.string() }),
    name: () => "Send a text",
    description: () => "A test step",
    icon: () => null,
    outputPorts: [{ id: "then", label: "Then" }],
    hasInput: true,
    connectionError: () => null,
    ...overrides,
  })
}

/**
 * A registry that has not been asked anything yet. It works its list out once,
 * on first use, so each case needs its own copy of the module.
 */
async function freshRegistry() {
  vi.resetModules()
  return import("@/lib/automations/node-registry")
}

beforeEach(() => {
  appNodes.current = []
  appNodes.groups = []
})

describe("an app that adds nothing", () => {
  it("gets exactly the shell's own headings", async () => {
    const { automationPaletteGroups } = await freshRegistry()

    expect(automationPaletteGroups()).toEqual([
      "Triggers",
      "Actions",
      "Flow",
      "AI",
      "Steps",
    ])
  })

  it("gets exactly the shell's own steps", async () => {
    const { automationPaletteItems } = await freshRegistry()

    // Grouped, in the order the palette shows the groups: triggers first.
    expect(automationPaletteItems().map((item) => item.key)).toEqual([
      "trigger-billing-moment",
      "action-send-email",
      "flow-audience",
      "flow-approval",
      "step-ai",
      "step-placeholder",
    ])
  })
})

describe("an app that adds a step of its own", () => {
  it("puts it in the palette beside the shell's", async () => {
    appNodes.current = [testNode("sendSms")]
    const { automationPaletteItems, isAutomationPaletteKey } =
      await freshRegistry()

    const sms = automationPaletteItems().find((item) => item.key === "sendSms")
    expect(sms).toMatchObject({ group: "Actions", name: "Send a text" })
    expect(isAutomationPaletteKey("sendSms")).toBe(true)
  })

  it("builds one from the palette with its own default settings", async () => {
    appNodes.current = [testNode("sendSms")]
    const { createAutomationNode } = await freshRegistry()

    expect(
      createAutomationNode("sendSms", { id: "n1", x: 10, y: 20 })
    ).toEqual({
      id: "n1",
      kind: "sendSms",
      x: 10,
      y: 20,
      settings: { note: "" },
    })
  })

  it("draws its icon", async () => {
    const Icon = () => null
    appNodes.current = [testNode("sendSms", { icon: Icon })]
    const { automationNodeIcon } = await freshRegistry()

    const node = { id: "n1", kind: "sendSms", x: 0, y: 0, settings: {} }
    expect(automationNodeIcon(node)).toBe(Icon)
  })

  /**
   * The panel is a pointer to another file, and the engine must never follow
   * it: a panel with a dropdown in it imports `@/lib/api/*`, which builds a
   * server function as it loads and throws outside a request. Reading the
   * panel out of the registry must therefore not load it either — only drawing
   * it does, and that only happens in a browser.
   */
  it("does not open the panel's file just to be asked about it", async () => {
    let opened = false
    appNodes.current = [
      testNode("sendSms", {
        fields: async () => {
          opened = true
          return { default: () => null }
        },
      }),
    ]
    const { automationNodeFields } = await freshRegistry()

    const node = { id: "n1", kind: "sendSms", x: 0, y: 0, settings: {} }
    expect(automationNodeFields(node)).not.toBeNull()
    expect(opened).toBe(false)
  })

  it("hands back the same panel every time, so typing cannot restart it", async () => {
    appNodes.current = [
      testNode("sendSms", { fields: async () => ({ default: () => null }) }),
    ]
    const { automationNodeFields } = await freshRegistry()

    const node = { id: "n1", kind: "sendSms", x: 0, y: 0, settings: {} }
    expect(automationNodeFields(node)).toBe(automationNodeFields(node))
  })

  it("leaves a step with no panel of its own showing none", async () => {
    appNodes.current = [testNode("sendSms")]
    const { automationNodeFields } = await freshRegistry()

    expect(
      automationNodeFields({
        id: "n1",
        kind: "sendSms",
        x: 0,
        y: 0,
        settings: {},
      })
    ).toBeNull()
  })
})

describe("an app that adds a palette heading of its own", () => {
  it("puts it after the shell's, with its steps under it", async () => {
    appNodes.groups = ["Trading"]
    appNodes.current = [
      testNode("tradeWallet", {
        palette: { key: "trade-wallet", group: "Trading", description: "" },
      }),
    ]
    const { automationPaletteGroups, automationPaletteItems } =
      await freshRegistry()

    expect(automationPaletteGroups().at(-1)).toBe("Trading")
    // Last in the palette too, since items are sorted by their heading's place.
    expect(automationPaletteItems().at(-1)).toMatchObject({
      key: "trade-wallet",
      group: "Trading",
    })
  })

  it("refuses a heading the shell already uses", async () => {
    appNodes.groups = ["Actions"]
    const { automationPaletteItems } = await freshRegistry()

    expect(() => automationPaletteItems()).toThrow(/"Actions"/)
  })

  it("refuses a step under a heading nothing declares", async () => {
    // Otherwise the step is simply not drawn, which looks exactly like a step
    // that was never written.
    appNodes.current = [
      testNode("tradeWallet", {
        palette: { key: "trade-wallet", group: "Trading", description: "" },
      }),
    ]
    const { automationPaletteItems } = await freshRegistry()

    expect(() => automationPaletteItems()).toThrow(/"Trading"/)
  })
})

describe("an app cannot take over one of the shell's steps", () => {
  it("refuses a kind the shell already uses", async () => {
    appNodes.current = [testNode("audience", { palette: null })]
    const { automationPaletteItems } = await freshRegistry()

    expect(() => automationPaletteItems()).toThrow(/"audience"/)
  })

  it("refuses a palette key the shell already uses", async () => {
    appNodes.current = [
      testNode("sendSms", {
        palette: { key: "flow-audience", group: "Actions", description: "" },
      }),
    ]
    const { automationPaletteItems } = await freshRegistry()

    expect(() => automationPaletteItems()).toThrow(/"flow-audience"/)
  })
})
