import {
  automationConnectionError,
  type AutomationNode,
  type AutomationSourcePort,
} from "@/lib/automations/automation"

// Registry the canvas components render from: one definition per node kind
// with palette copy, icon, ports, and connection rules. Ported contract from
// the trading automation canvas — same exports, AI-Video node library.

export type AutomationPaletteKey =
  | "trigger-manual"
  | "trigger-schedule"
  | "trigger-creator-posted"
  | "pipeline-find-new-videos"
  | "pipeline-ingest-videos"
  | "pipeline-create-template"
  | "pipeline-create-project"

export type AutomationNodeIconName =
  | "play"
  | "timer"
  | "userPlus"
  | "scanSearch"
  | "download"
  | "layoutTemplate"
  | "clapperboard"

export type AutomationPaletteGroup = "Triggers" | "Pipeline"

export type AutomationNodePort = {
  id: AutomationSourcePort
  label: string
}

type AutomationNodeDefinition = {
  key: AutomationPaletteKey
  kind: AutomationNode["kind"]
  group: AutomationPaletteGroup
  paletteDescription: string
  create: (position: { id: string; x: number; y: number }) => AutomationNode
  name: string
  description: (node: AutomationNode) => string
  icon: AutomationNodeIconName
  outputPorts: readonly AutomationNodePort[]
  // Triggers have no input port.
  inputMode: "flow" | "none"
}

const OUT_PORT: readonly AutomationNodePort[] = [{ id: "out", label: "Then" }]

const AUTOMATION_NODE_DEFINITIONS: readonly AutomationNodeDefinition[] = [
  {
    key: "trigger-manual",
    kind: "manualTrigger",
    group: "Triggers",
    paletteDescription: "Starts the automation when you press Run",
    create: ({ id, x, y }) => ({ id, kind: "manualTrigger", x, y }),
    name: "Manual",
    description: () => "Starts this automation when you press Run.",
    icon: "play",
    outputPorts: OUT_PORT,
    inputMode: "none",
  },
  {
    key: "trigger-schedule",
    kind: "scheduleTrigger",
    group: "Triggers",
    paletteDescription: "Runs the automation on a repeating interval",
    create: ({ id, x, y }) => ({
      id,
      kind: "scheduleTrigger",
      every: 6,
      unit: "hours",
      x,
      y,
    }),
    name: "Schedule",
    description: (node) =>
      node.kind === "scheduleTrigger"
        ? `Runs every ${node.every} ${node.every === 1 ? node.unit.slice(0, -1) : node.unit} while the automation is enabled.`
        : "",
    icon: "timer",
    outputPorts: OUT_PORT,
    inputMode: "none",
  },
  {
    key: "trigger-creator-posted",
    kind: "creatorPostedTrigger",
    group: "Triggers",
    paletteDescription:
      "Runs when the creator watcher ingests a new video from a watched creator",
    create: ({ id, x, y }) => ({
      id,
      kind: "creatorPostedTrigger",
      creatorId: "",
      x,
      y,
    }),
    name: "Creator Posts",
    description: (node) =>
      node.kind === "creatorPostedTrigger"
        ? node.creatorId
          ? "Runs when the watcher ingests a new video from the chosen creator."
          : "Runs when the watcher ingests a new video from any watched creator."
        : "",
    icon: "userPlus",
    outputPorts: OUT_PORT,
    inputMode: "none",
  },
  {
    key: "pipeline-find-new-videos",
    kind: "findNewVideos",
    group: "Pipeline",
    paletteDescription:
      "Checks a creator's profile for videos not in your archive yet",
    create: ({ id, x, y }) => ({
      id,
      kind: "findNewVideos",
      creatorId: "",
      maxVideos: 3,
      x,
      y,
    }),
    name: "Find New Videos",
    description: (node) =>
      node.kind === "findNewVideos"
        ? `Checks the creator's recent uploads and passes on up to ${node.maxVideos} new video${node.maxVideos === 1 ? "" : "s"}.`
        : "",
    icon: "scanSearch",
    outputPorts: OUT_PORT,
    inputMode: "flow",
  },
  {
    key: "pipeline-ingest-videos",
    kind: "ingestVideos",
    group: "Pipeline",
    paletteDescription:
      "Downloads incoming videos and runs the transcript + Gemini analysis",
    create: ({ id, x, y }) => ({
      id,
      kind: "ingestVideos",
      maxVideos: 3,
      x,
      y,
    }),
    name: "Download & Analyze",
    description: (node) =>
      node.kind === "ingestVideos"
        ? `Downloads up to ${node.maxVideos} incoming video${node.maxVideos === 1 ? "" : "s"} into the Viral Archive and waits for analysis.`
        : "",
    icon: "download",
    outputPorts: OUT_PORT,
    inputMode: "flow",
  },
  {
    key: "pipeline-create-template",
    kind: "createTemplate",
    group: "Pipeline",
    paletteDescription:
      "Turns each analyzed incoming video into a reusable template",
    create: ({ id, x, y }) => ({
      id,
      kind: "createTemplate",
      namePrefix: "",
      x,
      y,
    }),
    name: "Create Template",
    description: (node) =>
      node.kind === "createTemplate"
        ? node.namePrefix
          ? `Creates a template named “${node.namePrefix}” from each analyzed incoming video.`
          : "Creates a template from each analyzed incoming video, named after the video."
        : "",
    icon: "layoutTemplate",
    outputPorts: OUT_PORT,
    inputMode: "flow",
  },
  {
    key: "pipeline-create-project",
    kind: "createProject",
    group: "Pipeline",
    paletteDescription:
      "Creates an editable project from each incoming template",
    create: ({ id, x, y }) => ({
      id,
      kind: "createProject",
      namePrefix: "",
      x,
      y,
    }),
    name: "Create Project",
    description: (node) =>
      node.kind === "createProject"
        ? node.namePrefix
          ? `Creates a project named “${node.namePrefix}” from each incoming template.`
          : "Creates a project from each incoming template, named after the template."
        : "",
    icon: "clapperboard",
    outputPorts: [],
    inputMode: "flow",
  },
]

export const AUTOMATION_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  "Triggers",
  "Pipeline",
]

export const AUTOMATION_PALETTE_ITEMS = AUTOMATION_NODE_DEFINITIONS.map(
  (definition) => ({
    key: definition.key,
    group: definition.group,
    description: definition.paletteDescription,
    name: definition.name,
    icon: definition.icon,
  })
)

function definitionForNode(node: AutomationNode): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find(
    (item) => item.kind === node.kind
  )
  if (!definition) throw new Error(`Unknown Automation node: ${node.kind}`)
  return definition
}

function definitionForPaletteKey(
  key: AutomationPaletteKey
): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find(
    (item) => item.key === key
  )
  if (!definition) throw new Error(`Unknown Automation node key: ${key}`)
  return definition
}

export function createAutomationNode(
  key: AutomationPaletteKey,
  position: { id: string; x: number; y: number }
): AutomationNode {
  return definitionForPaletteKey(key).create(position)
}

export function automationNodeName(node: AutomationNode): string {
  return definitionForNode(node).name
}

// Accepts plain strings so run history stays renderable even if a stored
// step's kind predates the current registry.
export function automationNodeKindName(kind: string): string {
  const definition = AUTOMATION_NODE_DEFINITIONS.find(
    (item) => item.kind === kind
  )
  return definition?.name ?? kind
}

export function automationNodeDescription(node: AutomationNode): string {
  return definitionForNode(node).description(node)
}

export function automationNodeIcon(
  node: AutomationNode
): AutomationNodeIconName {
  return definitionForNode(node).icon
}

export function automationNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return definitionForNode(node).outputPorts
}

export function automationNodeInputMode(node: AutomationNode): "flow" | "none" {
  return definitionForNode(node).inputMode
}

export function automationNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  return definitionForNode(node)
    .outputPorts.map((port) => port.id)
    .includes(sourcePort)
}

export function automationNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  if (!automationNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  return automationConnectionError(source, sourcePort, target)
}

export function canConnectAutomationNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return (
    source.id !== target.id &&
    automationNodeConnectionError(source, sourcePort, target) === null &&
    automationNodeInputMode(target) === "flow"
  )
}
