import { z } from "zod"

import { FLOW_BOXES_MAX } from "./node-kinds"

/**
 * What a run and its steps are, shared by the server and the steps page
 * (workspace/docs/flow.md, "How a run moves").
 */

/**
 * - `running`: a step is queued or being made.
 * - `waiting`: nothing can go on until the person does something.
 * - `done`: every step is done.
 * - `failed`: a step failed and waits for Try again.
 * - `stopped`: the person pressed Stop. Nothing more happens.
 */
export type FlowRunStatus = "running" | "waiting" | "done" | "failed" | "stopped"

/**
 * - `waiting`: a node feeding it is not done yet.
 * - `needs_input`: ready, waiting for its button and its boxes.
 * - `queued`: ready, for the worker to make.
 * - `working`: the worker is making it.
 * - `needs_ok`: made, and "Wait for my OK" is on.
 * - `done`, `failed`.
 */
export type FlowStepStatus = "waiting" | "needs_input" | "queued" | "working" | "needs_ok" | "done" | "failed"

export const FLOW_RUN_STATUS_LABELS: Record<FlowRunStatus, string> = {
  running: "Running",
  waiting: "Waiting on you",
  done: "Done",
  failed: "Failed",
  stopped: "Stopped",
}

export const FLOW_STEP_STATUS_LABELS: Record<FlowStepStatus, string> = {
  waiting: "Waiting",
  needs_input: "Needs you",
  queued: "Up next",
  working: "Working",
  needs_ok: "Needs your OK",
  done: "Done",
  failed: "Failed",
}

/** The voice a step picked or read with. */
export type FlowVoice = { voiceId: string; voiceName: string; speaker: string }

/**
 * What a step made, handed to every node with a line from it.
 *
 * - `text`: words, from Paste text, AI text, or what is said in a linked video.
 * - `mediaIds`: files in Media (an upload, a pick, a download, a picture, a
 *   reading, a track).
 * - `videoId`: the run's video, once AI video laid it.
 * - `thumbnailIds`: thumbnails on the project's board.
 * - `actorId`, `voice`: from Pick an actor or voice.
 * - `summary`: one line for the steps page.
 */
export type FlowStepOutput = {
  text?: string
  mediaIds?: string[]
  videoId?: string
  thumbnailIds?: string[]
  actorId?: string
  voice?: FlowVoice
  summary?: string
}

const idSchema = z.string().min(1).max(36)

export const FLOW_TEXT_INPUT_MAX = 100_000
const FLOW_LINK_MAX = 2000
const FLOW_MEDIA_PICK_MAX = 20

/** What the person puts in one of a step's boxes. The server checks each id is theirs. */
export const flowStepInputSchema = z
  .object({
    text: z.string().max(FLOW_TEXT_INPUT_MAX).optional(),
    link: z.string().trim().max(FLOW_LINK_MAX).optional(),
    mediaIds: z.array(idSchema).max(FLOW_MEDIA_PICK_MAX).optional(),
    actorId: idSchema.optional(),
    voiceId: z.string().min(1).max(120).optional(),
  })
  .strict()

export type FlowStepInput = z.infer<typeof flowStepInputSchema>

/** Every box of a step, by the box's id: no more than a node can ask for. */
export const flowStepInputsSchema = z
  .record(z.string().min(1).max(64), flowStepInputSchema)
  .refine((inputs) => Object.keys(inputs).length <= FLOW_BOXES_MAX, "A step has at most six boxes.")

/** What a step's boxes held when it was made; a picked voice is kept whole. */
export type FlowStepInputs = Record<string, FlowStepInput & { voice?: FlowVoice }>

/** A run still going: nothing done to it is final yet. */
export function flowRunIsLive(status: FlowRunStatus) {
  return status === "running" || status === "waiting" || status === "failed"
}

/** The run's state from its steps' states. Stopped is never worked out; it is set. */
export function flowRunStatusFrom(steps: readonly { status: FlowStepStatus }[]): Exclude<FlowRunStatus, "stopped"> {
  if (steps.length > 0 && steps.every((step) => step.status === "done")) return "done"
  if (steps.some((step) => step.status === "failed")) return "failed"
  if (steps.some((step) => step.status === "queued" || step.status === "working")) return "running"
  return "waiting"
}
