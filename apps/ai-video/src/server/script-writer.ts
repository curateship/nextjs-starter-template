import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoProjects,
  aiVideoTemplates,
  aiVideoViralVideos,
} from "@/server/schema"
import { requireUser } from "@/server/security"
import { generateJson, type ViralVideoAnalysis } from "@/server/video-analysis"
import { getCurrentWorkspaceBrandKit } from "@/server/workspaces"

// One beat of the generated script. Role and timing come verbatim from the
// source reel's analyzed segments — only the line text is model-written, so
// the new script always matches the original's pacing exactly.
export type ScriptBeat = {
  role: string
  startMs: number
  endMs: number
  line: string
}

export type ProjectScriptResult = { beats: ScriptBeat[] }

// The model returns lines keyed by segment index; everything else is ours.
const scriptSchema = z.object({
  beats: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        line: z.string().max(500),
      })
    )
    .max(100),
})

const NOT_TEMPLATE_ERROR =
  "This project wasn't created from an analyzed template"

// Speaking pace used to budget words per beat (~2.8 words/second).
const WORDS_PER_SECOND = 2.8

function scriptPrompt(
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  // Describe each segment with its role, length, word budget, and what was
  // originally said during it.
  const beats = analysis.segments.map((segment, index) => {
    const durationS = (segment.endMs - segment.startMs) / 1000
    const maxWords = Math.max(2, Math.round(durationS * WORDS_PER_SECOND))
    const originalLines = analysis.transcript
      .filter((line) => line.startMs < segment.endMs && line.endMs > segment.startMs)
      .map((line) => line.text)
      .join(" ")
    return `${index}. role=${segment.role}, length=${durationS.toFixed(1)}s, max ${maxWords} words
   what it does: ${segment.summary}
   original line(s): ${originalLines || "(no speech)"}`
  })

  return `You are a short-form video scriptwriter. A viral reel was analyzed into narrative beats below. Write a NEW script about a different topic that copies the original's structure and pacing beat for beat.

New topic: ${topic}${notes ? `\nExtra notes from the creator: ${notes}` : ""}${ctaPhrases.length ? `\nSaved CTA phrases to use when they fit naturally:\n${ctaPhrases.map((phrase) => `- ${phrase}`).join("\n")}` : ""}

Original beats:
${beats.join("\n")}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "beats": [{ "index": 0, "line": "..." }] }

Rules:
- Exactly one entry per beat above, using the same "index".
- "line" is what the creator SAYS during that beat about the new topic — spoken words only, no camera directions.
- Match each beat's narrative role and stay within its word budget so the line fits the beat's length when spoken.
- If a saved CTA phrase fits a CTA beat naturally, use or adapt one.
- Write in the same energetic, hook-driven style as the original lines.`
}

// Generates a beat-matched script for the project's source template analysis.
export async function writeScriptForProjectForCurrentUser(
  projectId: string,
  data: { topic: string; notes?: string }
): Promise<ProjectScriptResult> {
  requireAppOrigin()
  const user = await requireUser()

  const [project] = await db
    .select()
    .from(aiVideoProjects)
    .where(
      and(eq(aiVideoProjects.id, projectId), eq(aiVideoProjects.userId, user.id))
    )
    .limit(1)
  if (!project) {
    throw new Error("Project not found")
  }
  if (!project.templateId) {
    throw new Error(NOT_TEMPLATE_ERROR)
  }

  // Follow project → template → source reel, all owner-scoped.
  const [template] = await db
    .select()
    .from(aiVideoTemplates)
    .where(
      and(
        eq(aiVideoTemplates.id, project.templateId),
        eq(aiVideoTemplates.userId, user.id)
      )
    )
    .limit(1)
  if (!template?.sourceViralVideoId) {
    throw new Error(NOT_TEMPLATE_ERROR)
  }

  const [viralVideo] = await db
    .select()
    .from(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.id, template.sourceViralVideoId),
        eq(aiVideoViralVideos.userId, user.id)
      )
    )
    .limit(1)
  const analysis = viralVideo?.analysis as ViralVideoAnalysis | null
  if (!analysis?.segments?.length) {
    throw new Error(NOT_TEMPLATE_ERROR)
  }

  const brandKit = await getCurrentWorkspaceBrandKit(user.id)
  const lines = await generateScriptLines(
    analysis,
    data.topic,
    data.notes,
    brandKit.ctaPhrases
  )

  // Zip the model's lines back onto the analyzed segments: timing and role
  // are never model-controlled.
  const lineByIndex = new Map(lines.map((beat) => [beat.index, beat.line]))
  const beats = analysis.segments
    .map((segment, index) => ({
      role: segment.role,
      startMs: segment.startMs,
      endMs: segment.endMs,
      line: (lineByIndex.get(index) ?? "").trim(),
    }))
    .filter((beat) => beat.line)

  if (beats.length === 0) {
    throw new Error("Script generation returned no result")
  }
  return { beats }
}

// Text-only generateContent call (no Files API — the analysis is already text).
async function generateScriptLines(
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  const result = await generateJson(
    [{ text: scriptPrompt(analysis, topic, notes, ctaPhrases) }],
    scriptSchema,
    "Script generation"
  )
  return result.beats
}
