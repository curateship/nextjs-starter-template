import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { CaptionLine, ProjectCaptionsResult } from "@/server/captions"

export type { CaptionLine, ProjectCaptionsResult }

const captionSafeErrorMessages = new Set([
  "Project not found",
  "No audible clip to caption",
  "A clip's media file no longer exists",
  "Video analysis is not configured",
  "Caption generation returned no result",
  "Caption generation returned invalid JSON",
  "Caption generation returned an unexpected shape",
])

export function getCaptionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Caption generation failed."
  if (captionSafeErrorMessages.has(error.message)) return error.message
  // Gemini HTTP failures carry a status suffix — keep those visible too.
  if (error.message.startsWith("Caption generation failed")) {
    return error.message
  }
  return "Caption generation failed."
}

const generateCaptionsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data }): Promise<ProjectCaptionsResult> => {
    const { generateProjectCaptionsForCurrentUser } = await import(
      "@/server/captions"
    )
    return generateProjectCaptionsForCurrentUser(data.projectId)
  })

export function generateProjectCaptions(projectId: string) {
  return generateCaptionsFn({ data: { projectId } })
}
