import type { AutomationGraph, AutomationValidationError } from "@/lib/automations/graph"

import { VIDEO_MODELS } from "@/lib/video/video-models"

import { flowStepOrder } from "./advance"
import { flowKindOf, flowNodeName, readFlowNodeSettings } from "./node-kinds"

/**
 * What stops a flow from running, each with the node it is about so the
 * canvas marks it in red. Run refuses a flow with any of these and says the
 * first one.
 *
 * - **No nodes.**
 * - **A node Flow does not know**, such as an older Flow's Paste text or
 *   Upload node, from before a node held its own boxes.
 * - **An AI node with no prompt**: the AI does only what the prompt says, so
 *   an empty one would do nothing.
 * - **An AI clip that loops on a model that can't**: only a model that takes
 *   a last picture can end a clip on its start.
 * - **A loop**: a node that feeds itself through others would never be ready.
 */
export function validateFlow(graph: Pick<AutomationGraph, "nodes" | "edges">): AutomationValidationError[] {
  const errors: AutomationValidationError[] = []
  if (graph.nodes.length === 0) {
    errors.push({ code: "empty", message: "Add a node first. The flow has nothing to run." })
    return errors
  }
  for (const node of graph.nodes) {
    const kind = flowKindOf(node.kind)
    if (!kind) {
      errors.push({
        code: "unknown_node",
        nodeId: node.id,
        message: "This node is from an older Flow. Delete it, and add what it asked for as a box on the AI node it fed.",
      })
      continue
    }
    const settings = readFlowNodeSettings(node.settings)
    if (kind === "ai-clip" && settings.clip.loops && !VIDEO_MODELS[settings.clip.company].endFrame) {
      errors.push({
        code: "invalid_settings",
        nodeId: node.id,
        message: `"${flowNodeName(node)}" can't end on its start with ${VIDEO_MODELS[settings.clip.company].label}. Pick Seedance or Wan, or switch "Ends on its start" off.`,
      })
    }
    if (!settings.prompt.trim()) {
      errors.push({
        code: "invalid_settings",
        nodeId: node.id,
        message: `"${flowNodeName(node)}" has no prompt. Write what the AI should do.`,
      })
    }
  }
  const ordered = new Set(flowStepOrder(graph))
  const looped = graph.nodes.filter((node) => !ordered.has(node.id))
  for (const node of looped) {
    errors.push({
      code: "cycle",
      nodeId: node.id,
      message: `"${flowNodeName(node)}" is in a loop, so it would wait for itself. Take away one of the lines.`,
    })
  }
  for (const edge of graph.edges) {
    if (looped.some((node) => node.id === edge.to) && looped.some((node) => node.id === edge.from)) {
      errors.push({ code: "cycle", edgeId: edge.id, message: "This line makes a loop." })
    }
  }
  return errors
}
