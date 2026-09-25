import type { AutomationNodeSettings } from "@/lib/automations/node-descriptor"
import { describe, expect, it } from "vitest"

import { compileAutomationGraph } from "./compile"
import {
  automationGraphSchema,
  EMPTY_AUTOMATION_GRAPH,
  type AutomationGraph,
} from "./graph"

const viewport = { x: 0, y: 0, zoom: 1 }

function placeholder(id: string, note = "") {
  return { id, kind: "placeholder", x: 0, y: 0, settings: { note } }
}

function aiStep(id: string, settings: AutomationNodeSettings = {}) {
  return {
    id,
    kind: "aiStep",
    x: 0,
    y: 0,
    settings: {
      provider: "anthropic",
      model: "claude-opus-5",
      instructions: "Summarise the feedback in two sentences.",
      ...settings,
    },
  }
}

function sendEmail(id: string, settings: AutomationNodeSettings = {}) {
  const blocks = [
    {
      id: "message",
      kind: "richText",
      content: {
        htmlContent: "<p>Hello there.</p>",
        backgroundColor: "#ffffff",
        padding: 20,
      },
    },
  ]
  return {
    id,
    kind: "sendEmail",
    x: 0,
    y: 0,
    settings: {
      subject: "A small update",
      preheader: "",
      fromName: "",
      blocks,
      ...settings,
    },
  }
}

function webhook(id: string, settings: AutomationNodeSettings = {}) {
  return {
    id,
    kind: "webhook",
    x: 0,
    y: 0,
    settings: {
      url: "https://hooks.example.com/automation",
      secret: "shared-secret",
      ...settings,
    },
  }
}

function edge(id: string, from: string, to: string, sourcePort = "then") {
  return { id, from, sourcePort, to }
}

describe("compileAutomationGraph", () => {
  it("compiles a clean chain and strips canvas bookkeeping", () => {
    const graph: AutomationGraph = {
      nodes: [placeholder("a", "first"), placeholder("b")],
      edges: [edge("e1", "a", "b")],
      viewport,
    }
    const result = compileAutomationGraph(graph)
    expect(result.errors).toEqual([])
    expect(result.config).not.toBeNull()
    expect(result.config?.nodes.a).toEqual({
      kind: "placeholder",
      settings: { note: "first" },
    })
    expect(result.config?.edges).toEqual([
      { from: "a", sourcePort: "then", to: "b" },
    ])
  })

  it("reports an empty graph instead of compiling nothing", () => {
    const result = compileAutomationGraph(EMPTY_AUTOMATION_GRAPH)
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("empty")
  })

  it("reports duplicate node ids", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), placeholder("a")],
      edges: [],
      viewport,
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain("duplicate_id")
  })

  it("reports an unknown node kind without throwing, and the draft still parses", () => {
    const graph = {
      nodes: [
        placeholder("a"),
        { id: "mystery", kind: "time-machine", x: 10, y: 10, settings: {} },
      ],
      edges: [],
      viewport,
    }
    // The saved draft must stay readable even though the kind is unknown.
    expect(automationGraphSchema.safeParse(graph).success).toBe(true)

    const result = compileAutomationGraph(graph)
    expect(result.config).toBeNull()
    const unknown = result.errors.find((error) => error.code === "unknown_node")
    expect(unknown?.nodeId).toBe("mystery")
  })

  it("rejects invalid settings via the descriptor schema", () => {
    const result = compileAutomationGraph({
      nodes: [
        { id: "a", kind: "placeholder", x: 0, y: 0, settings: { note: 42 } },
      ],
      edges: [],
      viewport,
    })
    expect(result.config).toBeNull()
    const settingsError = result.errors.find(
      (error) => error.code === "invalid_settings"
    )
    expect(settingsError?.nodeId).toBe("a")
  })

  it("compiles an AI step and keeps its settings in the config", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), aiStep("b")],
      edges: [edge("e1", "a", "b")],
      viewport,
    })
    expect(result.errors).toEqual([])
    expect(result.config?.nodes.b).toEqual({
      kind: "aiStep",
      settings: {
        provider: "anthropic",
        model: "claude-opus-5",
        instructions: "Summarise the feedback in two sentences.",
      },
    })
  })

  it("refuses to compile an AI step with no instructions", () => {
    const result = compileAutomationGraph({
      nodes: [aiStep("a", { instructions: "   " })],
      edges: [],
      viewport,
    })
    expect(result.config).toBeNull()
    const settingsError = result.errors.find(
      (error) => error.code === "invalid_settings"
    )
    expect(settingsError?.nodeId).toBe("a")
    expect(settingsError?.message).toContain("instructions")
  })

  it("refuses to compile an AI step with an unknown provider", () => {
    const result = compileAutomationGraph({
      nodes: [aiStep("a", { provider: "acme-ai" })],
      edges: [],
      viewport,
    })
    expect(result.config).toBeNull()
    expect(result.errors.map((error) => error.code)).toContain(
      "invalid_settings"
    )
  })

  it("compiles a Send Email step with its finished wording", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), sendEmail("b")],
      edges: [edge("e1", "a", "b")],
      viewport,
    })

    expect(result.errors).toEqual([])
    expect(result.config?.nodes.b.settings).toEqual({
      subject: "A small update",
      preheader: "",
      fromName: "",
      blocks: [
        {
          id: "message",
          kind: "richText",
          content: {
            htmlContent: "<p>Hello there.</p>",
            backgroundColor: "#ffffff",
            padding: 20,
          },
        },
      ],
    })
  })

  it("refuses to compile a Send Email step with no blocks", () => {
    const result = compileAutomationGraph({
      nodes: [sendEmail("email", { blocks: [] })],
      edges: [],
      viewport,
    })

    expect(result.config).toBeNull()
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_settings", nodeId: "email" }),
      ])
    )
  })

  it("compiles a webhook and refuses an internal address", () => {
    const clean = compileAutomationGraph({
      nodes: [webhook("hook")],
      edges: [],
      viewport,
    })
    expect(clean.errors).toEqual([])
    expect(clean.config?.nodes.hook.settings).toEqual({
      url: "https://hooks.example.com/automation",
      secret: "shared-secret",
    })

    const blocked = compileAutomationGraph({
      nodes: [webhook("hook", { url: "https://localhost/hook" })],
      edges: [],
      viewport,
    })
    expect(blocked.config).toBeNull()
    expect(blocked.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid_settings", nodeId: "hook" }),
      ])
    )
  })

  it("rejects self connections, missing endpoints, and invalid ports", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), placeholder("b")],
      edges: [
        edge("self", "a", "a"),
        edge("gone", "a", "nope"),
        edge("badport", "a", "b", "sideways"),
      ],
      viewport,
    })
    const codes = result.errors.map((error) => error.code)
    expect(codes).toContain("invalid_edge")
    expect(codes).toContain("missing_node")
    expect(codes).toContain("invalid_port")
    expect(result.config).toBeNull()
  })

  it("rejects cycles", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), placeholder("b")],
      edges: [edge("e1", "a", "b"), edge("e2", "b", "a")],
      viewport,
    })
    expect(result.errors.map((error) => error.code)).toContain("cycle")
    expect(result.config).toBeNull()
  })

  it("rejects two connections leaving one output", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), placeholder("b"), placeholder("c")],
      edges: [edge("e1", "a", "b"), edge("e2", "a", "c")],
      viewport,
    })
    expect(result.errors.map((error) => error.code)).toContain("fan_out")
    expect(result.config).toBeNull()
  })

  it("rejects duplicate connections between the same pair", () => {
    const result = compileAutomationGraph({
      nodes: [placeholder("a"), placeholder("b")],
      edges: [edge("e1", "a", "b"), edge("e2", "a", "b")],
      viewport,
    })
    const duplicates = result.errors.filter(
      (error) => error.code === "invalid_edge" || error.code === "fan_out"
    )
    expect(duplicates.length).toBeGreaterThan(0)
    expect(result.config).toBeNull()
  })
})
