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
import { flowNodeMakingCents } from "./estimates"
import { buildFlowPrompt, withVideoPrompt } from "./prompt"
import { promptIdeaRequest } from "./prompt-ideas"
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
  it("is the scene, its clip, the music, the ambience, the study video and the thumbnail, one after another", () => {
    const graph = pomodoroFlowGraph()
    expect(validateFlow(graph)).toEqual([])
    expect(graph.nodes.map((node) => flowKindOf(node.kind))).toEqual(["ai-picture", "ai-clip", "ai-music", "ai-sound", "ai-video", "ai-thumbnail"])
    expect(flowStepOrder(graph)).toEqual(["scene", "clip", "music", "ambience", "study", "thumbnail"])
    const [, clip, music, ambience, editor] = graph.nodes.map((node) => readFlowNodeSettings(node.settings))
    expect(clip.clip).toEqual({ company: "seedance", size: "1080p", seconds: 8, loops: true, sound: false })
    expect(clip.asks).toEqual([{ id: "scene", kind: "media", label: "Your scene", optional: true }])
    expect(music.music).toEqual({ service: "elevenlabs", tracks: 6, seconds: 300 })
    expect(ambience.sound).toEqual({ seconds: 30, loops: true })
    for (const step of [clip, music, ambience, editor]) expect(step.waitForOk).toBe(true)
    expect(editor.asks).toEqual([])
    expect(editor.prompt).toContain("Round {n}/6")
    expect(editor.prompt).toContain("make nothing new")
    expect(FLOW_STARTERS.map((starter) => starter.key)).toEqual(["transcript", "pomodoro"])
  })

  it("says how every video is built and never names a scene, with the AI suggesting each video's prompts", () => {
    const graph = pomodoroFlowGraph()
    for (const node of graph.nodes) {
      const settings = readFlowNodeSettings(node.settings)
      // The study video only puts together what the steps before it made.
      expect(settings.suggestPrompt).toBe(node.id !== "study")
      for (const words of [settings.prompt, settings.title, settings.line, settings.explanation]) {
        expect(words).not.toMatch(/caf[eé]|coffee|lamp|mug|window/i)
      }
    }
  })
})

describe("each video's own prompt", () => {
  it("sends how every video is built, then this video, each under its heading", () => {
    expect(withVideoPrompt("A wide picture, no words.", "  A snowy cabin at dawn.  ")).toBe(
      "## How every video of this channel is built\nA wide picture, no words.\n\n## This video\nA snowy cabin at dawn."
    )
  })

  it("sends the flow's prompt alone, exactly as typed, when this video has no words", () => {
    expect(withVideoPrompt("A wide picture, no words.", "   ")).toBe("A wide picture, no words.")
    expect(withVideoPrompt("A wide picture, no words.", null)).toBe("A wide picture, no words.")
  })

  const base = {
    flowName: "Pomodoro study video",
    flowDescription: "Three hours of study.",
    stepTitle: "Scene picture",
    kindName: "AI picture",
    structure: "A wide photoreal picture, no people.",
  }

  it("asks the first step for something different from the channel's earlier videos", () => {
    const asked = promptIdeaRequest({ ...base, feeds: [], earlier: ["A café at night in the rain.", "A library\nat noon."] })
    expect(asked).toContain("A wide photoreal picture, no people.")
    expect(asked).toContain("- A café at night in the rain.")
    expect(asked).toContain("- A library at noon.")
    expect(asked).toContain("Pick something clearly different")
    expect(asked).toContain('{"prompt": "your words"}')
  })

  it("builds a later step on what the steps before it chose, including a change to the picture", () => {
    const asked = promptIdeaRequest({
      ...base,
      stepTitle: "Make the study video",
      kindName: "AI editor",
      feeds: [{ title: "Scene picture", videoPrompt: "A laptop and a candle by a snowy window.", changedWith: "make it dusk", text: null }],
      earlier: [],
    })
    expect(asked).toContain("This video's prompt: A laptop and a candle by a snowy window.")
    expect(asked).toContain("Changed afterwards: make it dusk")
    expect(asked).toContain("built on what the steps before it chose")
    expect(asked).not.toContain("Pick something clearly different")
  })
})

describe("the clip, music and sound nodes' settings", () => {
  it("reads each setting into its range, and falls back on the defaults", () => {
    const read = readFlowNodeSettings({
      clip: { company: "nobody", size: "4k", seconds: 7, loops: "yes" },
      music: { tracks: 40, seconds: 900, service: "suno" },
      sound: { seconds: 0.1, loops: false },
    })
    // An unknown size is the model's own default size.
    expect(read.clip).toEqual({ company: "seedance", size: "720p", seconds: 8, loops: true, sound: false })
    expect(readFlowNodeSettings({}).clip.size).toBe("1080p")
    expect(read.music).toEqual({ service: "elevenlabs", tracks: 12, seconds: 300 })
    expect(read.sound).toEqual({ seconds: 0.5, loops: false })
  })

  it("prices six 5-minute tracks as six, a sound by its length, and a clip by its model", () => {
    const settings = readFlowNodeSettings({ music: { tracks: 6, seconds: 300 }, sound: { seconds: 30 } })
    expect(flowNodeMakingCents("ai-music", settings)).toBe(6 * 150)
    expect(flowNodeMakingCents("ai-sound", settings)).toBe(6)
    expect(flowNodeMakingCents("ai-clip", settings)).toBeGreaterThan(0)
  })

  it("refuses a looping clip on Google, which can't end on its start", () => {
    const node = createFlowNode("ai-clip", { id: "clip", x: 0, y: 0 })
    node.settings = { ...node.settings, prompt: "Move gently.", clip: { company: "gemini", size: "720p", seconds: 8, loops: true, sound: false } }
    const errors = validateFlow({ nodes: [node], edges: [] })
    expect(errors.map((error) => error.message)).toEqual([
      "\"AI clip\" can't end on its start with Google Omni Flash. Pick Seedance or Wan, or switch \"Ends on its start\" off.",
    ])
  })
})
