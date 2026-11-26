import { describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH, type AutomationGraph } from "@/lib/automations/graph"
import { DEFAULT_DRIP_CONFIG } from "@/lib/broadcasts/drip"

import { dripNode, dripStepSettings, NEEDS_DRIP_MESSAGE, readDripStep, segmentStartMissingDrip } from "./drip"

/** A chain of steps, each feeding the next. */
function chain(...kinds: string[]): AutomationGraph {
  const settings: Record<string, Record<string, unknown>> = {
    segmentDrip: { segmentId: "seg", segmentName: "List" },
    drip: dripNode.createSettings(),
    audience: {},
    sendEmail: {},
    wait: { amount: 2, unit: "days", stopOnClick: true },
  }
  return {
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: kinds.map((kind, index) => ({ id: `n${index}`, kind, x: index * 200, y: 0, settings: (settings[kind] ?? {}) as never })),
    edges: kinds.slice(1).map((_, index) => ({ id: `e${index}`, from: `n${index}`, sourcePort: "then", to: `n${index + 1}` })),
  }
}

const shape = (graph: AutomationGraph) => ({
  nodes: Object.fromEntries(graph.nodes.map((node) => [node.id, node])),
  edges: graph.edges,
})

describe("segmentStartMissingDrip", () => {
  it("flags a Segment start that reaches a sending step before any Drip", () => {
    expect(segmentStartMissingDrip(shape(chain("segmentDrip", "sendEmail")))).toBe("n0")
    expect(segmentStartMissingDrip(shape(chain("segmentDrip", "wait", "sendEmail")))).toBe("n0")
  })

  it("is satisfied by a Drip before the first step that does anything", () => {
    expect(segmentStartMissingDrip(shape(chain("segmentDrip", "drip", "sendEmail")))).toBeNull()
    expect(segmentStartMissingDrip(shape(chain("segmentDrip", "wait", "drip", "sendEmail")))).toBeNull()
  })

  it("leaves every other start alone", () => {
    expect(segmentStartMissingDrip(shape(chain("joinedSegment", "sendEmail")))).toBeNull()
  })
})

describe("compiling a Segment start", () => {
  it("refuses a flow with no Drip, naming the start and saying what to add", () => {
    const compiled = compileAutomationGraph(chain("segmentDrip", "drip", "wait"))
    expect(compiled.errors).toEqual([])

    const missing = compileAutomationGraph(chain("segmentDrip", "wait", "placeholder", "sendEmail"))
    expect(missing.errors).toContainEqual({ code: "needs_drip", nodeId: "n0", message: NEEDS_DRIP_MESSAGE })
  })
})

describe("Drip step settings", () => {
  it("start from the default pace, with no on/off of their own", () => {
    expect(dripNode.createSettings()).toEqual(dripStepSettings(DEFAULT_DRIP_CONFIG))
    expect(dripNode.createSettings()).not.toHaveProperty("enabled")
  })

  it("refuse a fewest above the most", () => {
    const parsed = dripNode.settingsSchema.safeParse({ ...dripNode.createSettings(), batchSizeMin: 600, batchSizeMax: 500 })
    expect(parsed.success).toBe(false)
  })

  it("stay a pace, never all at once, while a value is half typed", () => {
    const halfTyped = { ...dripNode.createSettings(), batchSizeMin: 0, batchSizeMax: 450 }
    expect(readDripStep(halfTyped).enabled).toBe(true)
    expect(dripNode.description(halfTyped)).toBe("0–450 people at a time, 30–60 minutes apart, any time of day. Then carries on.")
  })
})
