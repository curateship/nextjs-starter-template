import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { automationGraphSchema, type AutomationGraph } from "@/lib/automations/graph"
import { getAiToolErrorMessage } from "@/lib/api/video/ai-tools"
import {
  FLOW_INVALID_MESSAGE_PREFIX,
  FLOW_NAME_MAX,
  isFlowInputMessage,
  SAFE_FLOW_ERRORS,
  type FlowDetail,
  type FlowListItem,
  type FlowRunDetail,
  type FlowRunListItem,
} from "@/lib/video/flow/flows"
import { FLOW_PROMPT_MAX } from "@/lib/video/flow/node-kinds"
import { flowStepInputsSchema, type FlowStepInput } from "@/lib/video/flow/run-shape"
import { PICTURE_EDIT_WORDS_MAX } from "@/lib/video/picture-edits"
import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { userGet, userPost } from "@/server/guards"

export type { FlowDetail, FlowListItem, FlowRunDetail, FlowRunListItem }

const idSchema = z.string().min(1).max(36)
/** A step's prompt for this one video, as its Prompt card holds it. */
const promptSchema = z.string().max(FLOW_PROMPT_MAX).optional()

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
  .inputValidator(z.object({ name: z.string().max(FLOW_NAME_MAX) }))
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

const renameRunFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ runId: idSchema, name: z.string().max(FLOW_NAME_MAX) }))
  .handler(({ data, context }) => runsServer().then((m) => m.renameFlowRun(context.user.id, data)))

const deleteRunsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ runIds: z.array(idSchema).min(1).max(500) }))
  .handler(({ data, context }) => runsServer().then((m) => m.deleteFlowRuns(context.user.id, data)))

const startStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, inputs: flowStepInputsSchema.optional(), prompt: promptSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.startFlowStep(context.user.id, data)))

const approveFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, text: z.string().max(100_000).optional(), prompt: promptSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.approveFlowStep(context.user.id, data)))

const redoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, prompt: promptSchema }))
  .handler(({ data, context }) => runsServer().then((m) => m.redoFlowStep(context.user.id, data)))

const ideaFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, replace: z.boolean().optional() }))
  .handler(({ data, context }) =>
    import("@/server/video/flow/prompt-ideas").then((m) => m.suggestFlowPrompt(context.user.id, data))
  )

const changeStepFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, words: z.string().trim().min(1).max(PICTURE_EDIT_WORDS_MAX) }))
  .handler(({ data, context }) => runsServer().then((m) => m.changeFlowStep(context.user.id, data)))

const retryFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ stepId: idSchema, prompt: promptSchema }))
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

/** A new flow, a blank canvas. */
export function createFlow(name: string) {
  return createFlowFn({ data: { name } })
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

export function renameFlowRun(runId: string, name: string) {
  return renameRunFn({ data: { runId, name } })
}

/** Deletes these runs, all or none; one making something right now is refused. */
export function deleteFlowRuns(runIds: string[]) {
  return deleteRunsFn({ data: { runIds } })
}

/** A step's button: what is in its boxes, then the AI makes it. */
export function startFlowStep(stepId: string, inputs: Record<string, FlowStepInput> = {}, prompt?: string) {
  return startStepFn({ data: { stepId, inputs, prompt } })
}

/** OK: on words made, with any edit; on a price, with the Prompt card's words as they are now. */
export function approveFlowStep(stepId: string, text?: string, prompt?: string) {
  return approveFn({ data: { stepId, text, prompt } })
}

export function redoFlowStep(stepId: string, prompt?: string) {
  return redoFn({ data: { stepId, prompt } })
}

/** The AI's idea for this video's prompt at a step: the first one, or with `replace` a new one. */
export function suggestFlowPrompt(stepId: string, replace = false) {
  return ideaFn({ data: { stepId, replace } })
}

/** A made AI picture or clip made again with these words. */
export function changeFlowStep(stepId: string, words: string) {
  return changeStepFn({ data: { stepId, words } })
}

export function retryFlowStep(stepId: string, prompt?: string) {
  return retryFn({ data: { stepId, prompt } })
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
