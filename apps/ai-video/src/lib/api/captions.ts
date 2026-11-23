import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_CONFLICT_MESSAGE } from "@/lib/timeline-schema"
import type {
  CaptionLine,
  CaptionProvider,
  ProjectCaptionsResult,
} from "@/server/captions"

export type { CaptionLine, CaptionProvider, ProjectCaptionsResult }

const captionSafeErrorMessages = new Set([
  "API usage limit reached. Try again next month.",
  "Project not found",
  "No audible clip to caption",
  "A clip's media file no longer exists",
  "Video analysis is not configured",
  "OpenAI key is not configured",
  "Caption generation returned no result",
  "Caption generation returned invalid JSON",
  "Caption generation returned an unexpected shape",
  // These flows flush the timeline first, so they surface a save conflict.
  PROJECT_CONFLICT_MESSAGE,
])

export function getCaptionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Caption generation failed."
  if (captionSafeErrorMessages.has(error.message)) return error.message
  // Provider HTTP failures carry a status suffix — keep those visible too.
  if (error.message.startsWith("Caption generation failed")) {
    return error.message
  }
  return "Caption generation failed."
}

const generateCaptionsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      provider: z.enum(["gemini", "openai"]),
    })
  )
  .handler(async ({ data }): Promise<ProjectCaptionsResult> => {
    const { generateProjectCaptionsForCurrentUser } =
      await import("@/server/captions")
    return generateProjectCaptionsForCurrentUser(data.projectId, data.provider)
  })

export function generateProjectCaptions(
  projectId: string,
  provider: CaptionProvider = "gemini"
) {
  return generateCaptionsFn({ data: { projectId, provider } })
}
