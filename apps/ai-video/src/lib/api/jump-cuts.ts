import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  JumpCutAnalysisResult,
  JumpCutSensitivity,
} from "@/server/jump-cuts"

export type {
  JumpCutAnalysisResult,
  JumpCutSensitivity,
  JumpCutSuggestion,
} from "@/server/jump-cuts"

const jumpCutSchema = z.object({
  projectId: z.string().min(1).max(36),
  clipId: z.string().min(1).max(64),
  sensitivity: z.enum(["conservative", "balanced", "tight"]),
})

const safeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Project not found",
  "Select a video or audio clip first",
  "A clip's media file no longer exists",
  "OpenAI key is not configured",
  "Clip is too large for jump-cut analysis",
  "Select a shorter clip for jump-cut analysis",
  "Unsupported media type",
  "Another jump-cut analysis is already in progress.",
  "Jump-cut analysis failed",
])

export function getJumpCutErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Jump-cut analysis failed."
  if (safeErrorMessages.has(error.message)) return error.message
  return "Jump-cut analysis failed."
}

const analyzeJumpCutsFn = createServerFn({ method: "POST" })
  .inputValidator(jumpCutSchema)
  .handler(async ({ data }): Promise<JumpCutAnalysisResult> => {
    const { analyzeJumpCutsForCurrentUser } = await import("@/server/jump-cuts")
    return analyzeJumpCutsForCurrentUser(data)
  })

export function analyzeJumpCuts(data: {
  projectId: string
  clipId: string
  sensitivity: JumpCutSensitivity
}) {
  return analyzeJumpCutsFn({ data })
}
