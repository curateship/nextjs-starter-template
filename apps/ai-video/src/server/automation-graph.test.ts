import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  automationConnectionError,
  automationGraphSchema,
  automationScheduleSummary,
  reachableNodeIds,
  scheduleIntervalMs,
  validateAutomationGraph,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
} from "../lib/automations/automation.ts"

const VIEWPORT = { x: 0, y: 0, zoom: 1 }

function node(partial: Partial<AutomationNode> & { id: string; kind: AutomationNode["kind"] }): AutomationNode {
  const base = { x: 0, y: 0 }
  switch (partial.kind) {
    case "manualTrigger":
      return { ...base, ...partial, kind: "manualTrigger" }
    case "scheduleTrigger":
      return { every: 6, unit: "hours", ...base, ...partial, kind: "scheduleTrigger" } as AutomationNode
    case "creatorPostedTrigger":
      return { creatorId: "", ...base, ...partial, kind: "creatorPostedTrigger" } as AutomationNode
    case "findNewVideos":
      return { creatorId: "creator-1", maxVideos: 3, ...base, ...partial, kind: "findNewVideos" } as AutomationNode
    case "ingestVideos":
      return { maxVideos: 3, ...base, ...partial, kind: "ingestVideos" } as AutomationNode
    case "createTemplate":
      return { namePrefix: "", ...base, ...partial, kind: "createTemplate" } as AutomationNode
    case "createProject":
      return { namePrefix: "", ...base, ...partial, kind: "createProject" } as AutomationNode
  }
}

function edge(from: string, to: string, id = `${from}-${to}`): AutomationEdge {
  return { id, from, sourcePort: "out", to }
}

function graph(nodes: AutomationNode[], edges: AutomationEdge[]): AutomationGraph {
  return { nodes, edges, viewport: VIEWPORT }
}

describe("automation graph validation", () => {
  it("accepts the canonical pipeline", () => {
    const pipeline = graph(
      [
        node({ id: "t", kind: "scheduleTrigger" }),
        node({ id: "f", kind: "findNewVideos" }),
        node({ id: "i", kind: "ingestVideos" }),
        node({ id: "c", kind: "createTemplate" }),
        node({ id: "p", kind: "createProject" }),
      ],
      [edge("t", "f"), edge("f", "i"), edge("i", "c"), edge("c", "p")]
    )
    assert.deepEqual(validateAutomationGraph(pipeline), [])
    assert.ok(automationGraphSchema.safeParse(pipeline).success)
  })

  it("requires a trigger node", () => {
    const errors = validateAutomationGraph(
      graph([node({ id: "f", kind: "findNewVideos" })], [])
    )
    assert.ok(errors.some((error) => error.message.includes("trigger")))
  })

  it("rejects a second schedule trigger", () => {
    const errors = validateAutomationGraph(
      graph(
        [
          node({ id: "s1", kind: "scheduleTrigger" }),
          node({ id: "s2", kind: "scheduleTrigger" }),
        ],
        []
      )
    )
    assert.ok(
      errors.some(
        (error) =>
          error.nodeId === "s2" && error.message.includes("one Schedule")
      )
    )
  })

  it("flags nodes not reachable from a trigger", () => {
    const errors = validateAutomationGraph(
      graph(
        [
          node({ id: "t", kind: "manualTrigger" }),
          node({ id: "i", kind: "ingestVideos" }),
        ],
        []
      )
    )
    assert.ok(
      errors.some(
        (error) =>
          error.nodeId === "i" && error.message.includes("not connected")
      )
    )
  })

  it("flags edges that break the pipeline grammar", () => {
    const errors = validateAutomationGraph(
      graph(
        [
          node({ id: "t", kind: "manualTrigger" }),
          node({ id: "c", kind: "createTemplate" }),
        ],
        [edge("t", "c")]
      )
    )
    assert.ok(errors.some((error) => error.edgeId === "t-c"))
  })

  it("requires a creator on Find New Videos", () => {
    const errors = validateAutomationGraph(
      graph(
        [
          node({ id: "t", kind: "manualTrigger" }),
          node({ id: "f", kind: "findNewVideos", creatorId: "" } as never),
        ],
        [edge("t", "f")]
      )
    )
    assert.ok(
      errors.some(
        (error) => error.nodeId === "f" && error.message.includes("creator")
      )
    )
  })

  it("rejects duplicate and dangling edges", () => {
    const errors = validateAutomationGraph(
      graph(
        [
          node({ id: "t", kind: "manualTrigger" }),
          node({ id: "f", kind: "findNewVideos" }),
        ],
        [edge("t", "f", "e1"), edge("t", "f", "e2"), edge("t", "ghost", "e3")]
      )
    )
    assert.ok(errors.some((error) => error.edgeId === "e2"))
    assert.ok(errors.some((error) => error.edgeId === "e3"))
  })
})

describe("connection rules", () => {
  it("allows triggers only into Find New Videos", () => {
    const trigger = node({ id: "t", kind: "manualTrigger" })
    assert.equal(
      automationConnectionError(trigger, "out", node({ id: "f", kind: "findNewVideos" })),
      null
    )
    assert.notEqual(
      automationConnectionError(trigger, "out", node({ id: "i", kind: "ingestVideos" })),
      null
    )
  })

  it("routes Creator Posts straight to Create Template", () => {
    const trigger = node({ id: "t", kind: "creatorPostedTrigger" })
    assert.equal(
      automationConnectionError(trigger, "out", node({ id: "c", kind: "createTemplate" })),
      null
    )
    assert.notEqual(
      automationConnectionError(trigger, "out", node({ id: "i", kind: "ingestVideos" })),
      null
    )
  })

  it("never lets edges enter a trigger and gives terminal nodes no output", () => {
    const source = node({ id: "c", kind: "createTemplate" })
    assert.notEqual(
      automationConnectionError(source, "out", node({ id: "t", kind: "manualTrigger" })),
      null
    )
    const terminal = node({ id: "p", kind: "createProject" })
    assert.notEqual(
      automationConnectionError(terminal, "out", node({ id: "c2", kind: "createTemplate" })),
      null
    )
  })
})

describe("reachability and scheduling", () => {
  it("walks only downstream of the fired trigger", () => {
    const edges = [edge("t1", "f"), edge("f", "i"), edge("t2", "c")]
    const reachable = reachableNodeIds({ edges }, ["t1"])
    assert.deepEqual([...reachable].sort(), ["f", "i", "t1"])
  })

  it("computes interval milliseconds", () => {
    assert.equal(
      scheduleIntervalMs({ id: "s", kind: "scheduleTrigger", every: 30, unit: "minutes", x: 0, y: 0 }),
      30 * 60_000
    )
    assert.equal(
      scheduleIntervalMs({ id: "s", kind: "scheduleTrigger", every: 2, unit: "days", x: 0, y: 0 }),
      2 * 86_400_000
    )
  })

  it("summarizes the trigger for the dashboard", () => {
    assert.equal(
      automationScheduleSummary(
        graph([node({ id: "s", kind: "scheduleTrigger", every: 1, unit: "hours" } as never)], [])
      ),
      "Every 1 hour"
    )
    assert.equal(
      automationScheduleSummary(
        graph([node({ id: "c", kind: "creatorPostedTrigger" })], [])
      ),
      "When a creator posts"
    )
    assert.equal(
      automationScheduleSummary(
        graph([node({ id: "m", kind: "manualTrigger" })], [])
      ),
      "Manual only"
    )
  })
})
