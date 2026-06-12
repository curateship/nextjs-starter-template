import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoProjects,
  aiVideoTemplates,
  aiVideoViralVideos,
} from "@/server/schema"
import { findCurrentUser } from "@/server/security"
import {
  ANALYSIS_MODEL,
  GEMINI_BASE_URL,
  requireGeminiKey,
  safeBody,
  type ViralVideoAnalysis,
} from "@/server/video-analysis"

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

type GeminiGenerateResponse = {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

const NOT_TEMPLATE_ERROR =
  "This project wasn't created from an analyzed template"

// Speaking pace used to budget words per beat (~2.8 words/second).
const WORDS_PER_SECOND = 2.8

function scriptPrompt(
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined
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

New topic: ${topic}${notes ? `\nExtra notes from the creator: ${notes}` : ""}

Original beats:
${beats.join("\n")}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "beats": [{ "index": 0, "line": "..." }] }

Rules:
- Exactly one entry per beat above, using the same "index".
- "line" is what the creator SAYS during that beat about the new topic — spoken words only, no camera directions.
- Match each beat's narrative role and stay within its word budget so the line fits the beat's length when spoken.
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

  const lines = await generateScriptLines(analysis, data.topic, data.notes)

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
  notes: string | undefined
) {
  const apiKey = requireGeminiKey()
  const response = await fetch(
    `${GEMINI_BASE_URL}/v1beta/models/${ANALYSIS_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: scriptPrompt(analysis, topic, notes) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  )

  if (!response.ok) {
    console.error("Gemini script generation failed", await safeBody(response))
    throw new Error(`Script generation failed (HTTP ${response.status})`)
  }

  const payload = (await response.json()) as GeminiGenerateResponse
  const text = (payload.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
  if (!text) {
    throw new Error("Script generation returned no result")
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    throw new Error("Script generation returned invalid JSON")
  }

  const parsed = scriptSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error("Script generation returned an unexpected shape")
  }
  return parsed.data.beats
}
