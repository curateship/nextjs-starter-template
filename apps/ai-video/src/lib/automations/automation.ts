import { z } from "zod"

// The automation graph document stored verbatim in automations.graph (jsonb)
// and snapshotted onto every run so later edits never corrupt run history.
// Shape mirrors the trading app's canvas contract: nodes carry id/kind/x/y
// plus flat per-kind config, edges are from/sourcePort/to.

export type AutomationSourcePort = string

export type AutomationEdge = {
  id: string
  from: string
  sourcePort: AutomationSourcePort
  to: string
}

export type AutomationViewport = { x: number; y: number; zoom: number }

export type AutomationManualTriggerNode = {
  id: string
  kind: "manualTrigger"
  x: number
  y: number
}

export type AutomationScheduleUnit = "minutes" | "hours" | "days"

export type AutomationScheduleTriggerNode = {
  id: string
  kind: "scheduleTrigger"
  every: number
  unit: AutomationScheduleUnit
  x: number
  y: number
}

export type AutomationCreatorPostedTriggerNode = {
  id: string
  kind: "creatorPostedTrigger"
  // Empty string = any watched creator.
  creatorId: string
  x: number
  y: number
}

export type AutomationFindNewVideosNode = {
  id: string
  kind: "findNewVideos"
  creatorId: string
  maxVideos: number
  x: number
  y: number
}

export type AutomationIngestVideosNode = {
  id: string
  kind: "ingestVideos"
  maxVideos: number
  x: number
  y: number
}

export type AutomationCreateTemplateNode = {
  id: string
  kind: "createTemplate"
  namePrefix: string
  x: number
  y: number
}

export type AutomationCreateProjectNode = {
  id: string
  kind: "createProject"
  namePrefix: string
  x: number
  y: number
}

export type AutomationWaitForApprovalNode = {
  id: string
  kind: "waitForApproval"
  // Days to wait for a decision before the run auto-rejects itself.
  timeoutDays: number
  x: number
  y: number
}

export type AutomationNode =
  | AutomationManualTriggerNode
  | AutomationScheduleTriggerNode
  | AutomationCreatorPostedTriggerNode
  | AutomationFindNewVideosNode
  | AutomationIngestVideosNode
  | AutomationCreateTemplateNode
  | AutomationCreateProjectNode
  | AutomationWaitForApprovalNode

export type AutomationNodeKind = AutomationNode["kind"]

export type AutomationGraph = {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  viewport: AutomationViewport
}

export const TRIGGER_KINDS: readonly AutomationNodeKind[] = [
  "manualTrigger",
  "scheduleTrigger",
  "creatorPostedTrigger",
]

export function isTriggerNode(node: AutomationNode): boolean {
  return TRIGGER_KINDS.includes(node.kind)
}

export function emptyAutomationGraph(): AutomationGraph {
  return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
}

export const MAX_VIDEOS_PER_NODE = 5

// Approval checkpoints wait this many days by default, within these bounds.
export const DEFAULT_APPROVAL_TIMEOUT_DAYS = 3
export const MIN_APPROVAL_TIMEOUT_DAYS = 1
export const MAX_APPROVAL_TIMEOUT_DAYS = 30

const idSchema = z.string().min(1).max(64)
const coordinateSchema = z.number().finite()

const nodeBase = { id: idSchema, x: coordinateSchema, y: coordinateSchema }

export const automationNodeSchema = z.discriminatedUnion("kind", [
  z.object({ ...nodeBase, kind: z.literal("manualTrigger") }),
  z.object({
    ...nodeBase,
    kind: z.literal("scheduleTrigger"),
    every: z.number().int().min(1).max(10_000),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("creatorPostedTrigger"),
    creatorId: z.string().max(36),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("findNewVideos"),
    creatorId: z.string().max(36),
    maxVideos: z.number().int().min(1).max(MAX_VIDEOS_PER_NODE),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("ingestVideos"),
    maxVideos: z.number().int().min(1).max(MAX_VIDEOS_PER_NODE),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("createTemplate"),
    namePrefix: z.string().max(120),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("createProject"),
    namePrefix: z.string().max(120),
  }),
  z.object({
    ...nodeBase,
    kind: z.literal("waitForApproval"),
    timeoutDays: z
      .number()
      .int()
      .min(MIN_APPROVAL_TIMEOUT_DAYS)
      .max(MAX_APPROVAL_TIMEOUT_DAYS),
  }),
])

export const automationEdgeSchema = z.object({
  id: idSchema,
  from: idSchema,
  sourcePort: z.string().min(1).max(32),
  to: idSchema,
})

export const automationGraphSchema = z.object({
  nodes: z.array(automationNodeSchema).max(100),
  edges: z.array(automationEdgeSchema).max(200),
  viewport: z.object({
    x: coordinateSchema,
    y: coordinateSchema,
    zoom: z.number().min(0.25).max(2),
  }),
})

export type AutomationValidationError = {
  nodeId?: string
  edgeId?: string
  message: string
}

// Which target kinds each source kind may feed. The grammar is strictly
// forward (trigger → find → ingest → template → project), so cycles are
// impossible by construction; validation still walks reachability so
// disconnected nodes surface as errors. Anything with an output may also feed
// a Wait for Approval checkpoint — see resolveAllowedTargets for why that node
// has no rules of its own.
const CONNECTION_RULES: Record<AutomationNodeKind, AutomationNodeKind[]> = {
  manualTrigger: ["findNewVideos", "waitForApproval"],
  scheduleTrigger: ["findNewVideos", "waitForApproval"],
  creatorPostedTrigger: ["createTemplate", "waitForApproval"],
  findNewVideos: ["ingestVideos", "waitForApproval"],
  ingestVideos: ["createTemplate", "waitForApproval"],
  createTemplate: ["createProject", "waitForApproval"],
  createProject: [],
  // Inherited from whatever feeds the checkpoint; never read directly.
  waitForApproval: [],
}

export const APPROVAL_NEEDS_INPUT_ERROR =
  "Connect this checkpoint's input first, then connect its output."
export const APPROVAL_CHAIN_ERROR =
  "A checkpoint cannot connect to another checkpoint."
const APPROVAL_TARGET_ERROR =
  "This checkpoint can only connect where the step feeding it could."

// A checkpoint is transparent: it passes its inputs straight through, so it
// inherits the rules of the steps feeding it. Dropping one into a chain
// therefore never changes which steps may follow. Two properties matter here:
// a checkpoint may never feed another checkpoint (that is what keeps the
// grammar strictly forward and cycles impossible), and with more than one
// upstream only targets *every* upstream allows are legal — so the answer can
// never depend on the order edges happen to sit in.
// Returns null when nothing feeds the checkpoint yet.
function resolveAllowedTargets(
  source: AutomationNode,
  graph: Pick<AutomationGraph, "nodes" | "edges"> | undefined
): AutomationNodeKind[] | null {
  if (source.kind !== "waitForApproval") return CONNECTION_RULES[source.kind]
  if (!graph) return null
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const upstreamKinds = graph.edges
    .filter((edge) => edge.to === source.id)
    .map((edge) => nodeById.get(edge.from)?.kind)
    .filter((kind): kind is AutomationNodeKind => Boolean(kind))
  if (upstreamKinds.length === 0) return null
  return upstreamKinds
    .map((kind) =>
      CONNECTION_RULES[kind].filter((target) => target !== "waitForApproval")
    )
    .reduce((left, right) => left.filter((kind) => right.includes(kind)))
}

// `graph` is only needed when the source is a checkpoint; the canvas and the
// validator both pass it, so the two agree on every edge.
export function automationConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode,
  graph?: Pick<AutomationGraph, "nodes" | "edges">
): string | null {
  if (sourcePort !== "out") return "Connection uses an invalid output."
  if (source.kind === "createProject") {
    return "This node has no output to connect."
  }
  if (isTriggerNode(target)) {
    return "Triggers cannot receive connections."
  }
  if (source.kind === "waitForApproval" && target.kind === "waitForApproval") {
    return APPROVAL_CHAIN_ERROR
  }
  const allowed = resolveAllowedTargets(source, graph)
  if (allowed === null) return APPROVAL_NEEDS_INPUT_ERROR
  if (!allowed.includes(target.kind)) {
    return source.kind === "waitForApproval"
      ? APPROVAL_TARGET_ERROR
      : connectionHint(source.kind)
  }
  return null
}

function connectionHint(kind: AutomationNodeKind): string {
  switch (kind) {
    case "manualTrigger":
    case "scheduleTrigger":
      return "This trigger can only connect to a Find New Videos node or a checkpoint."
    case "creatorPostedTrigger":
      return "Creator Posts can only connect to a Create Template node or a checkpoint."
    case "findNewVideos":
      return "Find New Videos can only connect to a Download & Analyze node or a checkpoint."
    case "ingestVideos":
      return "Download & Analyze can only connect to a Create Template node or a checkpoint."
    case "createTemplate":
      return "Create Template can only connect to a Create Project node or a checkpoint."
    default:
      return "This connection is not allowed."
  }
}

// Semantic validation shared by the editor (live feedback) and the server
// (save + run gate). Structural shape is zod's job; this checks the rules the
// schema can't express.
export function validateAutomationGraph(
  graph: AutomationGraph
): AutomationValidationError[] {
  const errors: AutomationValidationError[] = []
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))

  const triggers = graph.nodes.filter(isTriggerNode)
  if (triggers.length === 0) {
    errors.push({
      message: "Add a trigger node (Manual, Schedule, or Creator Posts).",
    })
  }
  const scheduleTriggers = graph.nodes.filter(
    (node) => node.kind === "scheduleTrigger"
  )
  for (const extra of scheduleTriggers.slice(1)) {
    errors.push({
      nodeId: extra.id,
      message: "Only one Schedule trigger is allowed per automation.",
    })
  }

  const seenEdges = new Set<string>()
  for (const edge of graph.edges) {
    const source = nodeById.get(edge.from)
    const target = nodeById.get(edge.to)
    if (!source || !target) {
      errors.push({
        edgeId: edge.id,
        message: "Connection points at a missing node.",
      })
      continue
    }
    const connectionError = automationConnectionError(
      source,
      edge.sourcePort,
      target,
      graph
    )
    if (connectionError) {
      errors.push({ edgeId: edge.id, message: connectionError })
    }
    const key = `${edge.from}:${edge.sourcePort}:${edge.to}`
    if (seenEdges.has(key)) {
      errors.push({ edgeId: edge.id, message: "Duplicate connection." })
    }
    seenEdges.add(key)
  }

  // Every non-trigger node must be reachable from some trigger.
  const reachable = reachableNodeIds(
    graph,
    triggers.map((node) => node.id)
  )
  for (const node of graph.nodes) {
    if (!isTriggerNode(node) && !reachable.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: "This node is not connected to a trigger.",
      })
    }
  }

  for (const node of graph.nodes) {
    if (node.kind === "findNewVideos" && !node.creatorId) {
      errors.push({
        nodeId: node.id,
        message: "Pick which creator to check for new videos.",
      })
    }
    if (node.kind === "scheduleTrigger" && node.every < 1) {
      errors.push({
        nodeId: node.id,
        message: "The schedule interval must be at least 1.",
      })
    }
  }

  return errors
}

// BFS over edges from the given start nodes; used for validation and for
// choosing which steps a run materializes (only nodes downstream of the
// trigger that actually fired).
export function reachableNodeIds(
  graph: Pick<AutomationGraph, "edges">,
  startIds: string[]
): Set<string> {
  const reachable = new Set(startIds)
  const queue = [...startIds]
  while (queue.length) {
    const id = queue.shift() as string
    for (const edge of graph.edges) {
      if (edge.from === id && !reachable.has(edge.to)) {
        reachable.add(edge.to)
        queue.push(edge.to)
      }
    }
  }
  return reachable
}

// When an unanswered checkpoint auto-rejects itself.
export function approvalDeadline(
  node: AutomationWaitForApprovalNode,
  from: Date
): Date {
  return new Date(from.getTime() + node.timeoutDays * 86_400_000)
}

export function scheduleIntervalMs(
  node: AutomationScheduleTriggerNode
): number {
  const unitMs =
    node.unit === "minutes" ? 60_000 : node.unit === "hours" ? 3_600_000 : 86_400_000
  return node.every * unitMs
}

// First (and only, per validation) schedule trigger in the graph.
export function automationScheduleTrigger(
  graph: AutomationGraph
): AutomationScheduleTriggerNode | null {
  return (
    graph.nodes.find(
      (node): node is AutomationScheduleTriggerNode =>
        node.kind === "scheduleTrigger"
    ) ?? null
  )
}

export function automationScheduleSummary(graph: AutomationGraph): string {
  const schedule = automationScheduleTrigger(graph)
  if (!schedule) {
    const hasCreatorTrigger = graph.nodes.some(
      (node) => node.kind === "creatorPostedTrigger"
    )
    return hasCreatorTrigger ? "When a creator posts" : "Manual only"
  }
  const unit =
    schedule.every === 1 ? schedule.unit.slice(0, -1) : schedule.unit
  return `Every ${schedule.every} ${unit}`
}
