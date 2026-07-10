import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { idSchema, makeSafeErrorMessage, nameSchema } from "@/lib/api/shared"
import {
  catalog,
  typeDef,
  type FlowEdge,
  type FlowNode,
} from "@/components/automation/catalog"

import type {
  WorkflowDetail,
  WorkflowEditorData,
  WorkflowItem,
  WorkflowListResponse,
  WorkflowRunDetail,
  WorkflowRunStepItem,
} from "@/server/workflows"

export type {
  WorkflowDetail,
  WorkflowEditorData,
  WorkflowItem,
  WorkflowListResponse,
  WorkflowRunDetail,
  WorkflowRunStepItem,
}

const KNOWN_NODE_TYPES = new Set(
  catalog.flatMap((group) => group.items.map((item) => item.type))
)

const flowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z
    .string()
    .refine((type) => KNOWN_NODE_TYPES.has(type), "Unknown node type"),
  x: z.number().finite(),
  y: z.number().finite(),
  name: nameSchema,
  config: z
    .record(z.string().max(64), z.union([z.string().max(4000), z.number().finite()]))
    .refine(
      (config) => Object.keys(config).length <= 32,
      "Too many config fields"
    ),
})

const flowEdgeSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  port: z.number().int().min(0).max(1),
  to: z.string().min(1).max(64),
})

// Structural checks the DB can't express: edges must connect real nodes on
// real ports, and triggers only emit. Exported for tests.
export const graphSchema = z
  .object({
    nodes: z.array(flowNodeSchema).max(100),
    edges: z.array(flowEdgeSchema).max(200),
  })
  .superRefine((graph, ctx) => {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    if (nodeById.size !== graph.nodes.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate node ids" })
      return
    }
    for (const edge of graph.edges) {
      const source = nodeById.get(edge.from)
      const target = nodeById.get(edge.to)
      if (!source || !target) {
        ctx.addIssue({ code: "custom", message: "Edge references a missing node" })
        return
      }
      if (edge.port >= (typeDef(source.type).outputs ?? 1)) {
        ctx.addIssue({ code: "custom", message: "Edge uses an invalid output port" })
        return
      }
      if (typeDef(target.type).cat === "trigger") {
        ctx.addIssue({ code: "custom", message: "Triggers cannot have inputs" })
        return
      }
    }
  })

const workflowIdSchema = z.object({ workflowId: idSchema })
const runIdSchema = z.object({ runId: idSchema })

export const getWorkflowErrorMessage = makeSafeErrorMessage(
  "Workflow request failed.",
  new Set([
    "Workflow not found",
    "Run not found",
    "Workflow has no trigger node",
    "A run is already in progress",
    "Select a contact for this run",
    "Cancel the active run before deleting",
    "Voice provider not configured",
    "Agent not found",
    "Phone number not found",
    "Contact not found",
  ])
)

const listWorkflowsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkflowListResponse> => {
    const { listWorkflowsForCurrentUser } = await import("@/server/workflows")
    return listWorkflowsForCurrentUser()
  }
)

const getWorkflowEditorDataFn = createServerFn({ method: "GET" })
  .inputValidator(workflowIdSchema)
  .handler(async ({ data }): Promise<WorkflowEditorData> => {
    const { getWorkflowEditorDataForCurrentUser } = await import(
      "@/server/workflows"
    )
    return getWorkflowEditorDataForCurrentUser(data.workflowId)
  })

const createWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: nameSchema }))
  .handler(async ({ data }): Promise<WorkflowDetail> => {
    const { createWorkflowForCurrentUser } = await import("@/server/workflows")
    return createWorkflowForCurrentUser(data.name)
  })

const updateWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.intersection(workflowIdSchema.extend({ name: nameSchema }), graphSchema)
  )
  .handler(async ({ data }): Promise<WorkflowDetail> => {
    const { updateWorkflowForCurrentUser } = await import("@/server/workflows")
    return updateWorkflowForCurrentUser(data)
  })

const duplicateWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(workflowIdSchema)
  .handler(async ({ data }): Promise<WorkflowDetail> => {
    const { duplicateWorkflowForCurrentUser } = await import("@/server/workflows")
    return duplicateWorkflowForCurrentUser(data.workflowId)
  })

const deleteWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator(workflowIdSchema)
  .handler(async ({ data }): Promise<void> => {
    const { deleteWorkflowForCurrentUser } = await import("@/server/workflows")
    return deleteWorkflowForCurrentUser(data.workflowId)
  })

const startWorkflowRunFn = createServerFn({ method: "POST" })
  .inputValidator(workflowIdSchema.extend({ contactId: idSchema.optional() }))
  .handler(async ({ data }): Promise<WorkflowRunDetail> => {
    const { startWorkflowRunForCurrentUser } = await import("@/server/workflows")
    return startWorkflowRunForCurrentUser(data)
  })

const tickWorkflowRunFn = createServerFn({ method: "POST" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<WorkflowRunDetail> => {
    const { tickWorkflowRunForCurrentUser } = await import("@/server/workflows")
    return tickWorkflowRunForCurrentUser(data.runId)
  })

const cancelWorkflowRunFn = createServerFn({ method: "POST" })
  .inputValidator(runIdSchema)
  .handler(async ({ data }): Promise<WorkflowRunDetail> => {
    const { cancelWorkflowRunForCurrentUser } = await import("@/server/workflows")
    return cancelWorkflowRunForCurrentUser(data.runId)
  })

export function listWorkflows() {
  return listWorkflowsFn()
}

export function getWorkflowEditorData(workflowId: string) {
  return getWorkflowEditorDataFn({ data: { workflowId } })
}

export function createWorkflow(name: string) {
  return createWorkflowFn({ data: { name } })
}

export function updateWorkflow(input: {
  workflowId: string
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}) {
  return updateWorkflowFn({ data: input })
}

export function duplicateWorkflow(workflowId: string) {
  return duplicateWorkflowFn({ data: { workflowId } })
}

export function deleteWorkflow(workflowId: string) {
  return deleteWorkflowFn({ data: { workflowId } })
}

export function startWorkflowRun(workflowId: string, contactId?: string) {
  return startWorkflowRunFn({ data: { workflowId, contactId } })
}

export function tickWorkflowRun(runId: string) {
  return tickWorkflowRunFn({ data: { runId } })
}

export function cancelWorkflowRun(runId: string) {
  return cancelWorkflowRunFn({ data: { runId } })
}
