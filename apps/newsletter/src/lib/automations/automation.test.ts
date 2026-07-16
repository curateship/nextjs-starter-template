import { describe, expect, it } from "vitest"

import { compiledConfigSchema, nextNodeId } from "./compiled-config"
import {
  automationGraphSchema,
  compileAutomationGraph,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
} from "./automation"

const trigger = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "trigger" }>> = {}
): AutomationNode => ({
  id,
  kind: "trigger",
  x: 0,
  y: 0,
  source: "",
  tags: [],
  ...overrides,
})

const sendEmail = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "sendEmail" }>> = {}
): AutomationNode => ({
  id,
  kind: "sendEmail",
  x: 0,
  y: 0,
  subject: "Welcome!",
  body: "Hello {{firstName}}",
  preheader: "",
  ...overrides,
})

const delay = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "delay" }>> = {}
): AutomationNode => ({
  id,
  kind: "delay",
  x: 0,
  y: 0,
  amount: 2,
  unit: "hours",
  ...overrides,
})

const branch = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "branch" }>> = {}
): AutomationNode => ({
  id,
  kind: "branch",
  x: 0,
  y: 0,
  field: "tag",
  op: "has",
  value: "vip",
  ...overrides,
})

const tag = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "tag" }>> = {}
): AutomationNode => ({
  id,
  kind: "tag",
  x: 0,
  y: 0,
  mode: "add",
  tags: ["welcomed"],
  ...overrides,
})

const webhook = (
  id: string,
  overrides: Partial<Extract<AutomationNode, { kind: "webhook" }>> = {}
): AutomationNode => ({
  id,
  kind: "webhook",
  x: 0,
  y: 0,
  url: "https://example.com/hook",
  note: "",
  ...overrides,
})

const edge = (
  id: string,
  from: string,
  sourcePort: string,
  to: string
): AutomationEdge => ({ id, from, sourcePort, to })

const graph = (
  nodes: AutomationNode[],
  edges: AutomationEdge[]
): AutomationGraph => ({
  nodes,
  edges,
  viewport: { x: 0, y: 0, zoom: 1 },
})

const errorCodes = (result: ReturnType<typeof compileAutomationGraph>) =>
  result.errors.map((error) => error.code)

describe("compileAutomationGraph", () => {
  it("compiles a full graph into a config that parses with compiledConfigSchema", () => {
    const result = compileAutomationGraph(
      graph(
        [
          trigger("start", { source: "ai-trading", tags: ["trading-signup"] }),
          delay("wait"),
          branch("split"),
          sendEmail("email"),
          tag("mark"),
          webhook("notify"),
        ],
        [
          edge("e1", "start", "contact", "wait"),
          edge("e2", "wait", "then", "split"),
          edge("e3", "split", "yes", "email"),
          edge("e4", "split", "no", "notify"),
          edge("e5", "email", "then", "mark"),
        ]
      )
    )

    expect(result.errors).toEqual([])
    expect(result.config).not.toBeNull()

    const parsed = compiledConfigSchema.parse(result.config)
    expect(parsed.v).toBe(1)
    expect(parsed.kind).toBe("newsletterAutomation")
    expect(parsed.entryNodeId).toBe("start")
    expect(Object.keys(parsed.nodes).sort()).toEqual([
      "email",
      "mark",
      "notify",
      "split",
      "start",
      "wait",
    ])
    // Settings are the strict-parsed values, stripped of canvas bookkeeping.
    expect(parsed.nodes.start).toEqual({
      kind: "trigger",
      settings: { source: "ai-trading", tags: ["trading-signup"] },
    })
    expect(parsed.nodes.start.settings).not.toHaveProperty("id")
    expect(parsed.nodes.start.settings).not.toHaveProperty("x")
    expect(parsed.nodes.start.settings).not.toHaveProperty("y")
    expect(parsed.nodes.wait).toEqual({
      kind: "delay",
      settings: { amount: 2, unit: "hours" },
    })
    // Branch edges carry their yes/no port through to the compiled edges.
    expect(parsed.edges).toContainEqual({
      from: "split",
      sourcePort: "yes",
      to: "email",
    })
    expect(parsed.edges).toContainEqual({
      from: "split",
      sourcePort: "no",
      to: "notify",
    })

    // The run engine can walk the compiled config.
    expect(nextNodeId(parsed, "start")).toBe("wait")
    expect(nextNodeId(parsed, "split", "yes")).toBe("email")
    expect(nextNodeId(parsed, "split", "no")).toBe("notify")
    expect(nextNodeId(parsed, "mark")).toBeNull()
  })

  it("strict-parses settings at compile time (trim + defaults applied)", () => {
    const result = compileAutomationGraph(
      graph(
        [
          trigger("start", { source: "  ai-trading  " }),
          sendEmail("email", { subject: "  Hi  ", preheader: "" }),
        ],
        [edge("e1", "start", "contact", "email")]
      )
    )

    expect(result.errors).toEqual([])
    expect(result.config?.nodes.start.settings).toEqual({
      source: "ai-trading",
      tags: [],
    })
    expect(result.config?.nodes.email.settings).toMatchObject({
      subject: "Hi",
      preheader: "",
    })
  })

  it("requires exactly one trigger", () => {
    const missing = compileAutomationGraph(
      graph(
        [sendEmail("email"), tag("mark")],
        [edge("e1", "email", "then", "mark")]
      )
    )
    expect(errorCodes(missing)).toContain("missing_trigger")
    expect(missing.config).toBeNull()

    const multiple = compileAutomationGraph(
      graph(
        [trigger("start"), trigger("start2"), sendEmail("email")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "start2", "contact", "email"),
        ]
      )
    )
    expect(errorCodes(multiple)).toContain("multiple_triggers")
    expect(
      multiple.errors.find((error) => error.code === "multiple_triggers")
        ?.nodeId
    ).toBe("start2")
  })

  it("rejects a trigger with no outgoing step as empty", () => {
    const result = compileAutomationGraph(graph([trigger("start")], []))
    expect(errorCodes(result)).toContain("empty")
    expect(result.config).toBeNull()
  })

  it("rejects connections into the trigger", () => {
    const result = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "then", "start"),
        ]
      )
    )
    expect(errorCodes(result)).toContain("invalid_edge")
    expect(errorCodes(result)).toContain("trigger_input")
    expect(result.config).toBeNull()
  })

  it("enforces the fan-out guard per (node, sourcePort)", () => {
    const fanOut = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email"), tag("mark"), webhook("notify")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "then", "mark"),
          edge("e3", "email", "then", "notify"),
        ]
      )
    )
    expect(errorCodes(fanOut)).toContain("fan_out")
    expect(
      fanOut.errors.find((error) => error.code === "fan_out")?.nodeId
    ).toBe("email")

    // A branch splitting over DIFFERENT ports is the one allowed split…
    const branchSplit = compileAutomationGraph(
      graph(
        [trigger("start"), branch("split"), tag("mark"), webhook("notify")],
        [
          edge("e1", "start", "contact", "split"),
          edge("e2", "split", "yes", "mark"),
          edge("e3", "split", "no", "notify"),
        ]
      )
    )
    expect(branchSplit.errors).toEqual([])

    // …but the same branch port still may not fan out.
    const branchFanOut = compileAutomationGraph(
      graph(
        [trigger("start"), branch("split"), tag("mark"), webhook("notify")],
        [
          edge("e1", "start", "contact", "split"),
          edge("e2", "split", "yes", "mark"),
          edge("e3", "split", "yes", "notify"),
        ]
      )
    )
    expect(errorCodes(branchFanOut)).toContain("fan_out")
  })

  it("reports strict settings failures attributed to the node", () => {
    const result = compileAutomationGraph(
      graph(
        [
          trigger("start"),
          sendEmail("email", { subject: "" }),
          delay("wait", { amount: 0 }),
          branch("split", { field: "tag", op: "is" }),
          tag("mark", { tags: [] }),
          webhook("notify", { url: "not-a-url" }),
        ],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "then", "wait"),
          edge("e3", "wait", "then", "split"),
          edge("e4", "split", "yes", "mark"),
          edge("e5", "split", "no", "notify"),
        ]
      )
    )

    const invalid = result.errors.filter(
      (error) => error.code === "invalid_settings"
    )
    expect(invalid.map((error) => error.nodeId).sort()).toEqual([
      "email",
      "mark",
      "notify",
      "split",
      "wait",
    ])
    for (const error of invalid) expect(error.message.length).toBeGreaterThan(0)
    expect(result.config).toBeNull()
  })

  it("rejects a delay longer than 180 days", () => {
    const result = compileAutomationGraph(
      graph(
        [trigger("start"), delay("wait", { amount: 200, unit: "days" })],
        [edge("e1", "start", "contact", "wait")]
      )
    )
    expect(errorCodes(result)).toContain("invalid_settings")
  })

  it("detects cycles", () => {
    const result = compileAutomationGraph(
      graph(
        [trigger("start"), delay("wait"), tag("mark")],
        [
          edge("e1", "start", "contact", "wait"),
          edge("e2", "wait", "then", "mark"),
          edge("e3", "mark", "then", "wait"),
        ]
      )
    )
    expect(errorCodes(result)).toContain("cycle")
    expect(result.config).toBeNull()
  })

  it("flags nodes unreachable from the trigger as dangling", () => {
    const result = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email"), tag("orphan")],
        [edge("e1", "start", "contact", "email")]
      )
    )
    expect(errorCodes(result)).toContain("dangling")
    expect(
      result.errors.find((error) => error.code === "dangling")?.nodeId
    ).toBe("orphan")
  })

  it("rejects duplicate node ids, duplicate edge ids, and duplicate connections", () => {
    const duplicateNodes = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("dup"), tag("dup")],
        [edge("e1", "start", "contact", "dup")]
      )
    )
    expect(errorCodes(duplicateNodes)).toContain("duplicate_id")

    const duplicateEdges = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email"), tag("mark")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e1", "email", "then", "mark"),
        ]
      )
    )
    expect(errorCodes(duplicateEdges)).toContain("duplicate_id")

    const duplicateConnection = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "start", "contact", "email"),
        ]
      )
    )
    expect(errorCodes(duplicateConnection)).toContain("invalid_edge")
  })

  it("rejects edges that reference missing nodes, invalid ports, or self", () => {
    const missingNode = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "then", "ghost"),
        ]
      )
    )
    expect(errorCodes(missingNode)).toContain("missing_node")

    const invalidPort = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email"), tag("mark")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "yes", "mark"),
        ]
      )
    )
    expect(errorCodes(invalidPort)).toContain("invalid_port")

    const selfEdge = compileAutomationGraph(
      graph(
        [trigger("start"), sendEmail("email")],
        [
          edge("e1", "start", "contact", "email"),
          edge("e2", "email", "then", "email"),
        ]
      )
    )
    expect(errorCodes(selfEdge)).toContain("invalid_edge")
  })

  it("enforces the node and edge limits", () => {
    const manyNodes: AutomationNode[] = [trigger("start")]
    for (let index = 0; index < 101; index += 1) {
      manyNodes.push(tag(`tag-${index}`))
    }
    const result = compileAutomationGraph(graph(manyNodes, []))
    expect(errorCodes(result)).toContain("limit")
  })
})

describe("automationGraphSchema", () => {
  it("accepts half-filled draft nodes (lenient draft, strict compile)", () => {
    const draft = graph(
      [
        trigger("start"),
        sendEmail("email", { subject: "", body: "" }),
        branch("split", { value: "" }),
        webhook("notify", { url: "" }),
        tag("mark", { tags: [] }),
      ],
      [edge("e1", "start", "contact", "email")]
    )
    expect(automationGraphSchema.safeParse(draft).success).toBe(true)

    // …but the same draft does not compile.
    const compiled = compileAutomationGraph(draft)
    expect(compiled.config).toBeNull()
  })

  it("rejects graphs past the schema limits", () => {
    const tooManyNodes = graph(
      Array.from({ length: 101 }, (_, index) => tag(`tag-${index}`)),
      []
    )
    expect(automationGraphSchema.safeParse(tooManyNodes).success).toBe(false)

    const badZoom = {
      ...graph([trigger("start")], []),
      viewport: { x: 0, y: 0, zoom: 9 },
    }
    expect(automationGraphSchema.safeParse(badZoom).success).toBe(false)
  })
})
