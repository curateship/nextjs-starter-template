import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { automationGraphSchema, type AutomationGraph } from "@/lib/automations/graph"
import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  FLOW_INVALID_MESSAGE_PREFIX,
  FLOW_NAME_MAX,
  FLOW_STARTS,
  isFlowInputMessage,
  SAFE_FLOW_ERRORS,
  type FlowDetail,
  type FlowListItem,
  type FlowRunDetail,
  type FlowRunListItem,
  type FlowStart,
} from "@/lib/video/flow/flows"
import { flowStepInputsSchema, type FlowStepInput } from "@/lib/video/flow/run-shape"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { userGet, userPost } from "@/server/guards"

export type { FlowDetail, FlowListItem, FlowRunDetail, FlowRunListItem }

const idSchema = z.string().min(1).max(36)

/** The flow's own refusals as they are; anything else as the AI tools say it. */
export function getFlowErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (SAFE_FLOW_ERRORS.has(message) || message === PROJECT_NOT_FOUND_MESSAGE) return message
  if (message.startsWith(FLOW_INVALID_MESSAGE_PREFIX) || isFlowInputMessage(message)) return message
  return getAiToolErrorMessage(error)
}

const server = () => import("@/server/video/flow/flows")
const runsServer = () => import("@/server/video/flow/runs")

const listFlowsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [{ listFlows }, { countFlowRuns }] = await Promise.all([server(), runsServer()])
    const [flows, runCount] = await Promise.all([listFlows(context.user.id), countFlowRuns(context.user.id)])
    return { flows, runCount }
  })

const getFlowFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ flowId: idSchema }))
  .handler(({ data, context }) => server().then((m) => m.getFlow(context.user.id, data.flowId)))

const createFlowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: z.string().max(FLOW_NAME_MAX), start: z.enum(FLOW_STARTS) }))
  .handler(({ data, context }) => server().then((m) => m.createFlow(context.user.id, data)))

const saveGraphFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ flowId: idSchema, graph: automationGraphSchema, version: z.number().int().min(1) }))
  .handler(({ data, context }) => server().then((m) => m.saveFlowGraph(context.user.id, data)))

const updateFlowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      flowId: idSchema,
      name: z.string().max(FLOW_NAME_MAX).optional(),
      description: z.string().max(2000).optional(),
    })
  )
  .handler(({ data, context }) => server().then((m) => m.updateFlowDetails(context.user.id, data)))

const duplicateFlowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ flowId: idSchema }))
  .handler(({ data, context }) => server().then((m) => m.duplicateFlow(context.user.id, data.flowId)))

const deleteFlowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ flowId: idSchema }))
  .handler(({ data, context }) => server().then((m) => m.deleteFlow(context.user.id, data.flowId)))

const listRunsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => runsServer().then((m) => m.listFlowRuns(context.user.id)))

const getRunFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ runId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.getFlowRun(context.user.id, data.runId)))

const getFilesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ mediaIds: z.array(idSchema).max(50) }))
  .handler(({ data, context }) => runsServer().then((m) => m.getFlowFiles(context.user.id, data.mediaIds)))

const listMediaFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      page: z.number().int().min(1).max(1000),
      pageSize: z.number().int().min(1).max(50),
      fileType: z.enum(["image", "video", "audio"]),
      search: z.string().trim().max(120).optional(),
    })
  )
  .handler(({ data, context }) => runsServer().then((m) => m.listFlowMedia(context.user.id, data)))

const startRunFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ flowId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.startFlowRun(context.user.id, data)))

const saveRunFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ runId: idSchema, projectId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.saveFlowRun(context.user.id, data)))

const stopRunFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ runId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.stopFlowRun(context.user.id, data.runId)))

const startStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, inputs: flowStepInputsSchema.optional() }))
  .handler(({ data, context }) => runsServer().then((m) => m.startFlowStep(context.user.id, data)))

const approveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, text: z.string().max(100_000).optional() }))
  .handler(({ data, context }) => runsServer().then((m) => m.approveFlowStep(context.user.id, data)))

const redoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.redoFlowStep(context.user.id, data)))

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.retryFlowStep(context.user.id, data)))

const kindPricesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(() => import("@/server/video/flow/prices").then((m) => m.flowKindPrices()))

/** Every flow of the person's, and how many runs they have. */
export function listFlows() {
  return listFlowsFn()
}

export function getFlow(flowId: string) {
  return getFlowFn({ data: { flowId } })
}

export function createFlow(name: string, start: FlowStart) {
  return createFlowFn({ data: { name, start } })
}

export function saveFlowGraph(flowId: string, graph: AutomationGraph, version: number) {
  return saveGraphFn({ data: { flowId, graph, version } })
}

export function updateFlowDetails(flowId: string, change: { name?: string; description?: string }) {
  return updateFlowFn({ data: { flowId, ...change } })
}

export function duplicateFlow(flowId: string) {
  return duplicateFlowFn({ data: { flowId } })
}

export function deleteFlow(flowId: string) {
  return deleteFlowFn({ data: { flowId } })
}

export function listFlowRuns() {
  return listRunsFn()
}

export function getFlowRun(runId: string) {
  return getRunFn({ data: { runId } })
}

/** Starts a run of the flow. It has no project until its last step saves it into one. */
export function startFlowRun(flowId: string) {
  return startRunFn({ data: { flowId } })
}

/** The guide's last step: the project the run's video and files go into. */
export function saveFlowRun(runId: string, projectId: string) {
  return saveRunFn({ data: { runId, projectId } })
}

export function stopFlowRun(runId: string) {
  return stopRunFn({ data: { runId } })
}

/** A step's button: what is in its boxes, then the AI makes it. */
export function startFlowStep(stepId: string, inputs: Record<string, FlowStepInput> = {}) {
  return startStepFn({ data: { stepId, inputs } })
}

export function approveFlowStep(stepId: string, text?: string) {
  return approveFn({ data: { stepId, text } })
}

export function redoFlowStep(stepId: string) {
  return redoFn({ data: { stepId } })
}

export function retryFlowStep(stepId: string) {
  return retryFn({ data: { stepId } })
}

/** "From about" each AI node costs, for the builder. */
export function loadFlowKindPrices() {
  return kindPricesFn()
}

/** Your own files among these, with where each plays from, for the guide's card. */
export function getFlowFiles(mediaIds: string[]) {
  return getFilesFn({ data: { mediaIds } })
}

/** A page of your Media of one kind for a Files box, read as the editor reads it. */
export function listFlowMedia(query: { page: number; pageSize: number; fileType: "image" | "video" | "audio"; search?: string }) {
  return listMediaFn({ data: query })
}
