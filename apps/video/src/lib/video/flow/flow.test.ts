import { describe, expect, it } from "vitest"

import type { AutomationGraph } from "@/lib/automations/graph"
import {
  automationNodeName,
  automationNodeOutputPorts,
  automationPaletteItems,
  canConnectAutomationNodes,
  isSupportedNode,
} from "@/lib/automations/node-registry"

import { flowFeeders, flowStepOrder, flowStepsAfter, readyFlowSteps } from "./advance"
import type { FlowRunStep } from "./flows"
import { waitsOn } from "./guide"
import { createFlowNode, FLOW_KINDS, flowBoxLabel, flowKindOf, readFlowNodeSettings, storedFlowKind } from "./node-kinds"
import { buildFlowPrompt } from "./prompt"
import { flowRunStatusFrom } from "./run-shape"
import { FLOW_STARTERS, pomodoroFlowGraph, starterFlowGraph } from "./starter"
import { validateFlow } from "./validate"

const at = (id: string, x: number, y = 0) => ({ id, x, y })

describe("Flow's nodes on the shell's canvas", () => {
  it("never shows a Flow node in the automations palette", () => {
    const flowKinds = new Set(FLOW_KINDS.map(storedFlowKind))
    expect(automationPaletteItems().length).toBeGreaterThan(0)
    expect(automationPaletteItems().some((item) => item.key.startsWith("video-flow-"))).toBe(false)
    // The palette keys are not kinds, so check the kinds behind them too.
    expect(automationPaletteItems().some((item) => flowKinds.has(item.key))).toBe(false)
  })

  it("draws every kind with its name, an output and a line into it", () => {
    const text = createFlowNode("ai-text", at("a", 0))
    const upload = createFlowNode("ai-video", at("b", 300))
    expect(isSupportedNode(text)).toBe(true)
    expect(automationNodeName(text)).toBe("AI text")
    expect(automationNodeOutputPorts(upload)).toHaveLength(1)
    expect(canConnectAutomationNodes(upload, "out", text)).toBe(true)
    expect(canConnectAutomationNodes(text, "out", upload)).toBe(true)
    expect(automationNodeName({ ...text, settings: { ...text.settings, title: "Plan a script" } })).toBe("Plan a script")
  })

  it("reads a stored kind back, and nothing else, an older Flow's input nodes included", () => {
    expect(flowKindOf(storedFlowKind("ai-video"))).toBe("ai-video")
    expect(flowKindOf("sendEmail")).toBeNull()
    expect(flowKindOf("video-flow-paste-text")).toBeNull()
  })

  it("keeps a node's boxes, and drops a box it can't read", () => {
    const node = createFlowNode("ai-text", at("a", 0))
    const settings = readFlowNodeSettings({
      ...node.settings,
      asks: [
        { id: "t", kind: "text", label: "Transcript" },
        { id: "x", kind: "nope", label: "Bad" },
        { id: "v", kind: "video", label: "" },
      ],
    })
    expect(settings.asks.map((box) => `${box.kind}:${flowBoxLabel(box)}`)).toEqual(["text:Transcript", "video:Video"])
  })
})

describe("the order a run goes in", () => {
  it("runs a node only after every node with a line into it", () => {
    const graph = starterFlowGraph()
    const order = flowStepOrder(graph)
    expect(order).toEqual(["script", "make-video", "thumbnail"])
    expect(flowFeeders(graph, "make-video", order)).toEqual(["script"])
  })

  it("opens the script first, and the video once the script is done", () => {
    const graph = starterFlowGraph()
    const order = flowStepOrder(graph)
    const steps = order.map((nodeId) => ({ nodeId, status: "waiting" as const }))
    expect(readyFlowSteps(graph, steps)).toEqual(["script"])
    const scripted = steps.map((step) => (step.nodeId === "script" ? { ...step, status: "done" as const } : step))
    expect(readyFlowSteps(graph, scripted)).toEqual(["make-video"])
  })

  it("finds every step a result reaches", () => {
    expect([...flowStepsAfter(starterFlowGraph(), "script")].sort()).toEqual(["make-video", "thumbnail"])
  })
})

describe("what stops a flow from running", () => {
  it("passes the starter", () => {
    expect(validateFlow(starterFlowGraph())).toEqual([])
  })

  it("refuses an empty flow, an AI node with no prompt, and a loop", () => {
    expect(validateFlow({ nodes: [], edges: [] })[0]?.code).toBe("empty")
    const a = createFlowNode("ai-text", at("a", 0))
    const b = createFlowNode("ai-video", at("b", 300))
    const looped: Pick<AutomationGraph, "nodes" | "edges"> = {
      nodes: [a, b],
      edges: [
        { id: "ab", from: "a", sourcePort: "out", to: "b" },
        { id: "ba", from: "b", sourcePort: "out", to: "a" },
      ],
    }
    const codes = validateFlow(looped).map((error) => `${error.code}:${error.nodeId ?? error.edgeId}`)
    expect(codes).toContain("invalid_settings:a")
    expect(codes).toContain("cycle:a")
    expect(codes).toContain("cycle:b")
  })
})

describe("what an AI node is sent", () => {
  it("is the prompt as typed, then each connected node by name, then the answer's format", () => {
    const prompt = buildFlowPrompt(
      "Plan a script.",
      [{ title: "Paste a transcript", output: { text: "Hello there." } }],
      'Reply as JSON: {"text": string}'
    )
    expect(prompt.startsWith("Plan a script.")).toBe(true)
    expect(prompt).toContain("### Paste a transcript\nHello there.")
    expect(prompt.endsWith('Reply as JSON: {"text": string}')).toBe(true)
  })
})

describe("a run's state", () => {
  it("is done only when every step is", () => {
    expect(flowRunStatusFrom([{ status: "done" }, { status: "done" }])).toBe("done")
    expect(flowRunStatusFrom([{ status: "done" }, { status: "needs_input" }])).toBe("waiting")
    expect(flowRunStatusFrom([{ status: "queued" }, { status: "needs_input" }])).toBe("running")
    expect(flowRunStatusFrom([{ status: "failed" }, { status: "queued" }])).toBe("failed")
  })
})

describe("the starter", () => {
  it("is three nodes, the transcript and the raw video boxes inside the nodes that use them", () => {
    const graph = starterFlowGraph()
    expect(graph.nodes.map((node) => flowKindOf(node.kind))).toEqual(["ai-text", "ai-video", "ai-thumbnail"])
    const boxes = graph.nodes.map((node) => readFlowNodeSettings(node.settings).asks.map((box) => `${box.kind}:${box.label}`))
    expect(boxes).toEqual([["text:Transcript"], ["video:Raw video"], []])
  })
})

describe("what a step waits on", () => {
  it("is the steps with a line into it that are not done", () => {
    const steps = [
      { nodeId: "script", status: "needs_ok", feeds: [] },
      { nodeId: "make-video", status: "waiting", feeds: ["script"] },
    ] as unknown as FlowRunStep[]
    expect(waitsOn(steps[1], steps).map((step) => step.nodeId)).toEqual(["script"])
  })
})

describe("the Pomodoro starter", () => {
  it("is three nodes that run, its details all in the prompts", () => {
    const graph = pomodoroFlowGraph()
    expect(validateFlow(graph)).toEqual([])
    expect(graph.nodes.map((node) => flowKindOf(node.kind))).toEqual(["ai-picture", "ai-video", "ai-thumbnail"])
    const editor = readFlowNodeSettings(graph.nodes[1].settings)
    expect(editor.waitForOk).toBe(true)
    expect(editor.asks).toEqual([{ id: "scene", kind: "media", label: "Your scene", optional: true }])
    expect(editor.prompt).toContain("Round {n}/6")
    expect(FLOW_STARTERS.map((starter) => starter.key)).toEqual(["transcript", "pomodoro"])
  })
})
