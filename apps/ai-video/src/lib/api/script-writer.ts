import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProjectScriptResult, ScriptBeat } from "@/server/script-writer"

export type { ProjectScriptResult, ScriptBeat }

const scriptSafeErrorMessages = new Set([
  "Project not found",
  "This project wasn't created from an analyzed template",
  "Video analysis is not configured",
  "Script generation returned no result",
  "Script generation returned invalid JSON",
  "Script generation returned an unexpected shape",
])

export function getScriptErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Script generation failed."
  if (scriptSafeErrorMessages.has(error.message)) return error.message
  // Gemini HTTP failures carry a status suffix — keep those visible too.
  if (error.message.startsWith("Script generation failed")) {
    return error.message
  }
  return "Script generation failed."
}

const writeScriptFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string().min(1).max(36),
      topic: z.string().min(1).max(200),
      notes: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data }): Promise<ProjectScriptResult> => {
    const { writeScriptForProjectForCurrentUser } = await import(
      "@/server/script-writer"
    )
    return writeScriptForProjectForCurrentUser(data.projectId, {
      topic: data.topic,
      notes: data.notes,
    })
  })

export function writeProjectScript(
  projectId: string,
  topic: string,
  notes?: string
) {
  return writeScriptFn({
    data: { projectId, topic, notes: notes || undefined },
  })
}
