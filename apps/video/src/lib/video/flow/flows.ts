import type { AutomationGraph } from "@/lib/automations/graph"

import type { FlowBox } from "./node-kinds"
import type { FlowRunStatus, FlowStepInputs, FlowStepOutput, FlowStepStatus } from "./run-shape"

/** What the browser is told about flows and runs (workspace/docs/flow.md). */

export const FLOW_NAME_MAX = 120

export const FLOW_NOT_FOUND_MESSAGE = "Flow not found"
export const FLOW_RUN_NOT_FOUND_MESSAGE = "Run not found"
export const FLOW_STEP_NOT_FOUND_MESSAGE = "Step not found"
export const FLOW_CHANGED_MESSAGE = "This flow was changed in another window. Reload to see the newest copy."
export const FLOW_RUN_SAVED_MESSAGE = "This run is already saved into a project."
export const FLOW_RUN_STOPPED_MESSAGE = "This run was stopped, so nothing more can happen in it."
export const FLOW_STEP_NOT_READY_MESSAGE = "This step can't take that now. Reload to see where the run is."

/** New flow: an empty canvas, or a copy of the starter. */
export const FLOW_STARTS = ["blank", "starter"] as const
export type FlowStart = (typeof FLOW_STARTS)[number]

export type FlowListItem = {
  id: string
  name: string
  description: string
  nodeCount: number
  /** What stops it running (`validate.ts`). */
  problemCount: number
  runCount: number
  lastRunAt: string | null
  starter: boolean
  createdAt: string
  updatedAt: string
}

export type FlowDetail = FlowListItem & { graph: AutomationGraph; version: number }

export type FlowRunListItem = {
  id: string
  flowId: string | null
  flowName: string
  /** Empty until the run's last step saves it into a project. */
  projectId: string | null
  projectName: string | null
  videoId: string | null
  status: FlowRunStatus
  /** The steps done, and all of them. */
  stepsDone: number
  stepCount: number
  spentCents: number
  createdAt: string
  updatedAt: string
}

export type FlowRunStep = {
  id: string
  nodeId: string
  /** The stored node kind; `flowKindOf` reads it. */
  kind: string
  title: string
  position: number
  status: FlowStepStatus
  prompt: string
  waitForOk: boolean
  /** The titles of the nodes with a line into it, in order. */
  feedsFrom: string[]
  /** The same nodes' ids, in the same order. */
  feeds: string[]
  /** The boxes the step asks you for, each named (`flowBoxLabel`). */
  boxes: FlowBox[]
  /** The guide's words for the step (`readFlowNodeSettings`); the button already falls back to the kind's. */
  heading: string
  line: string
  explanation: string
  tip: string
  button: string
  /** What the boxes held when the step was made. */
  input: FlowStepInputs | null
  output: FlowStepOutput | null
  promptSent: string | null
  estimateCents: number | null
  costCents: number | null
  error: string | null
  note: string | null
  attempts: number
  startedAt: string | null
  finishedAt: string | null
}

export type FlowRunDetail = FlowRunListItem & {
  videoName: string | null
  /** AI video has made a cut that waits on the run to be saved. */
  hasCut: boolean
  error: string | null
  steps: FlowRunStep[]
}

/** Run's refusal for a flow that can't run, followed by the first reason (`validate.ts`). */
export const FLOW_INVALID_MESSAGE_PREFIX = "This flow can't run yet:"

/**
 * What a box was given that it can't use, said to the person after the box's
 * name: "Transcript: paste some text first."
 */
export const FLOW_INPUT_MESSAGES = {
  text: "paste some text first.",
  files: "pick at least one file first.",
  video: "upload a video first.",
  notYours: "one of those files isn't in your Media any more. Pick again.",
  notVideo: "pick a video. This box only takes videos.",
  link: "that isn't a YouTube, TikTok or Instagram video link.",
  actorOrVoice: "pick an actor or a voice first.",
  actor: "that actor isn't one of yours.",
  voice: "that voice isn't on the list any more. Pick another.",
} as const

/** One box's refusal, its name first. */
export function flowInputMessage(label: string, reason: keyof typeof FLOW_INPUT_MESSAGES) {
  return `${label}: ${FLOW_INPUT_MESSAGES[reason]}`
}

/** Whether a refusal is one of a box's, said as it is. */
export function isFlowInputMessage(message: string) {
  return Object.values(FLOW_INPUT_MESSAGES).some((reason) => message.endsWith(`: ${reason}`))
}

/** The refusals the flow server says as they are; anything else is said plainly. */
export const SAFE_FLOW_ERRORS = new Set<string>([
  FLOW_NOT_FOUND_MESSAGE,
  FLOW_RUN_NOT_FOUND_MESSAGE,
  FLOW_STEP_NOT_FOUND_MESSAGE,
  FLOW_CHANGED_MESSAGE,
  FLOW_RUN_STOPPED_MESSAGE,
  FLOW_RUN_SAVED_MESSAGE,
  FLOW_STEP_NOT_READY_MESSAGE,
])

/** A file a step's box holds, as the guide shows it: its name, its kind and where it plays from. */
export type FlowFile = { id: string; name: string; fileType: "image" | "video" | "audio"; url: string }
