import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ProjectReelBriefResult,
  ProjectScriptResult,
  ScriptBeat,
} from "@/server/script-writer"

export type { ProjectReelBriefResult, ProjectScriptResult, ScriptBeat }

const scriptSafeErrorMessages = new Set([
  "Project not found",
  "This project wasn't created from an analyzed template",
  "Video analysis is not configured",
  "Script generation returned no result",
  "Script generation returned invalid JSON",
  "Script generation returned an unexpected shape",
])
const briefSafeErrorMessages = new Set([
  "Project not found",
  "Template not found",
  "Brief to Reel needs a template-based project",
  "Brief to Reel needs an analyzed source reel",
  "The source reel has no analysis yet",
  "Brief generation is not configured",
  "Brief generation returned no result",
  "Brief generation returned invalid JSON",
  "Brief generation returned an unexpected shape",
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

export function getBriefErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Brief generation failed."
  if (briefSafeErrorMessages.has(error.message)) return error.message
  if (error.message.startsWith("Brief generation failed")) {
    return error.message
  }
  return "Brief generation failed."
}

const projectScriptInputSchema = z.object({
  projectId: z.string().min(1).max(36),
  topic: z.string().min(1).max(200),
  notes: z.string().max(500).optional(),
})

const writeScriptFn = createServerFn({ method: "POST" })
  .inputValidator(projectScriptInputSchema)
  .handler(async ({ data }): Promise<ProjectScriptResult> => {
    const { writeScriptForProjectForCurrentUser } = await import(
      "@/server/script-writer"
    )
    return writeScriptForProjectForCurrentUser(data.projectId, {
      topic: data.topic,
      notes: data.notes,
    })
  })

const writeBriefFn = createServerFn({ method: "POST" })
  .inputValidator(projectScriptInputSchema)
  .handler(async ({ data }): Promise<ProjectReelBriefResult> => {
    const { writeBriefForProjectForCurrentUser } = await import(
      "@/server/script-writer"
    )
    return writeBriefForProjectForCurrentUser(data.projectId, {
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

export function writeProjectBrief(
  projectId: string,
  topic: string,
  notes?: string
) {
  return writeBriefFn({
    data: { projectId, topic, notes: notes || undefined },
  })
}
