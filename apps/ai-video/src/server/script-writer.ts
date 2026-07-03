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
import {
  ANALYSIS_MODEL,
  generateJson,
  type ViralVideoAnalysis,
} from "@/server/video-analysis"
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

export type ProjectBriefBeat = ScriptBeat & {
  summary: string
  visual: string
  asset: string
  caption: string
}

export type ProjectReelBriefResult = {
  source: {
    videoId: string
    title: string | null
    author: string | null
    platform: string
    durationMs: number | null
    segmentCount: number
    sceneCount: number
  }
  brief: {
    hook: string
    angle: string
    audience: string
    promise: string
    cta: string
  }
  beats: ProjectBriefBeat[]
  assetChecklist: string[]
  captionDraft: string
  voiceoverText: string
}

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

const briefText = (max: number) => z.string().trim().min(1).max(max)

const briefSchema = z.object({
  brief: z.object({
    hook: briefText(500),
    angle: briefText(500),
    audience: briefText(500),
    promise: briefText(500),
    cta: briefText(500),
  }),
  beats: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        line: briefText(500),
        visual: briefText(500),
        asset: briefText(300),
        caption: briefText(200),
      })
    )
    .min(1)
    .max(100),
  assetChecklist: z.array(briefText(300)).min(1).max(20),
  captionDraft: briefText(500),
  voiceoverText: briefText(5000),
})

const NOT_TEMPLATE_ERROR =
  "This project wasn't created from an analyzed template"
const BRIEF_REGULAR_PROJECT_ERROR =
  "Brief to Reel needs a template-based project"
const BRIEF_BLANK_TEMPLATE_ERROR =
  "Brief to Reel needs an analyzed source reel"
const BRIEF_MISSING_ANALYSIS_ERROR = "The source reel has no analysis yet"
const BRIEF_NOT_CONFIGURED_ERROR = "Brief generation is not configured"

// Speaking pace used to budget words per beat (~2.8 words/second).
const WORDS_PER_SECOND = 2.8

function scriptPrompt(
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  return `You are a short-form video scriptwriter. A viral reel was analyzed into narrative beats below. Write a NEW script about a different topic that copies the original's structure and pacing beat for beat.

New topic: ${topic}${creatorPromptContext(notes, ctaPhrases)}

Original beats:
${describeAnalysisBeats(analysis)}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{ "beats": [{ "index": 0, "line": "..." }] }

Rules:
- Exactly one entry per beat above, using the same "index".
- "line" is what the creator SAYS during that beat about the new topic — spoken words only, no camera directions.
- Match each beat's narrative role and stay within its word budget so the line fits the beat's length when spoken.
- If a saved CTA phrase fits a CTA beat naturally, use or adapt one.
- Write in the same energetic, hook-driven style as the original lines.`
}

function briefPrompt(
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  return `You are turning a proven short-form reel structure into a ready-to-record creator brief.

New reel topic: ${topic}${creatorPromptContext(notes, ctaPhrases)}

Source reel beats:
${describeAnalysisBeats(analysis)}

Return ONLY a JSON object with this exact shape (no markdown, no commentary):
{
  "brief": {
    "hook": "...",
    "angle": "...",
    "audience": "...",
    "promise": "...",
    "cta": "..."
  },
  "beats": [{
    "index": 0,
    "line": "...",
    "visual": "...",
    "asset": "...",
    "caption": "..."
  }],
  "assetChecklist": ["..."],
  "captionDraft": "...",
  "voiceoverText": "..."
}

Rules:
- Exactly one beat entry per source beat, using the same "index".
- "line" is the spoken voiceover for that beat, within its word budget.
- "visual" is the shot direction or on-screen action for that beat.
- "asset" is the asset needed for that beat.
- "caption" is a short overlay caption for that beat.
- "voiceoverText" should be the final spoken script only, joined naturally from the beat lines.
- Keep the voiceover hook-driven and matched to the source reel pacing.`
}

function creatorPromptContext(
  notes: string | undefined,
  ctaPhrases: string[]
) {
  const parts: string[] = []
  if (notes) {
    parts.push(`\nExtra notes from the creator: ${notes}`)
  }
  if (ctaPhrases.length) {
    parts.push(
      `\nSaved CTA phrases to use when they fit naturally:\n${ctaPhrases.map((phrase) => `- ${phrase}`).join("\n")}`
    )
  }
  return parts.join("")
}

function describeAnalysisBeats(analysis: ViralVideoAnalysis) {
  return analysis.segments
    .map((segment, index) => {
      const durationS = (segment.endMs - segment.startMs) / 1000
      const maxWords = Math.max(2, Math.round(durationS * WORDS_PER_SECOND))
      const originalLines = analysis.transcript
        .filter(
          (line) => line.startMs < segment.endMs && line.endMs > segment.startMs
        )
        .map((line) => line.text)
        .join(" ")
      return `${index}. role=${segment.role}, length=${durationS.toFixed(1)}s, max ${maxWords} words
   what it does: ${segment.summary}
   original line(s): ${originalLines || "(no speech)"}`
    })
    .join("\n")
}

async function getProjectSourceAnalysis(
  projectId: string,
  errors: {
    regularProject: string
    blankTemplate: string
    missingAnalysis: string
  }
) {
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
    throw new Error(errors.regularProject)
  }

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
  if (!template) {
    throw new Error("Template not found")
  }
  if (!template.sourceViralVideoId) {
    throw new Error(errors.blankTemplate)
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
  if (!viralVideo || !analysis?.segments?.length) {
    throw new Error(errors.missingAnalysis)
  }

  return { userId: user.id, analysis, viralVideo }
}

// Generates a beat-matched script for the project's source template analysis.
export async function writeScriptForProjectForCurrentUser(
  projectId: string,
  data: { topic: string; notes?: string }
): Promise<ProjectScriptResult> {
  const { userId, analysis } = await getProjectSourceAnalysis(projectId, {
    regularProject: NOT_TEMPLATE_ERROR,
    blankTemplate: NOT_TEMPLATE_ERROR,
    missingAnalysis: NOT_TEMPLATE_ERROR,
  })
  const brandKit = await getCurrentWorkspaceBrandKit(userId)
  const lines = await generateScriptLines(
    userId,
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

export async function writeBriefForProjectForCurrentUser(
  projectId: string,
  data: { topic: string; notes?: string }
): Promise<ProjectReelBriefResult> {
  const { userId, analysis, viralVideo } = await getProjectSourceAnalysis(
    projectId,
    {
      regularProject: BRIEF_REGULAR_PROJECT_ERROR,
      blankTemplate: BRIEF_BLANK_TEMPLATE_ERROR,
      missingAnalysis: BRIEF_MISSING_ANALYSIS_ERROR,
    }
  )
  const brandKit = await getCurrentWorkspaceBrandKit(userId)
  const result = await generateBrief(
    userId,
    analysis,
    data.topic,
    data.notes,
    brandKit.ctaPhrases
  )
  const beatByIndex = new Map(result.beats.map((beat) => [beat.index, beat]))
  const hasExactBeatPlan =
    result.beats.length === analysis.segments.length &&
    analysis.segments.every((_, index) => beatByIndex.has(index))
  if (!hasExactBeatPlan) {
    throw new Error("Brief generation returned an unexpected shape")
  }

  const beats = analysis.segments
    .map((segment, index) => {
      const beat = beatByIndex.get(index)!
      return {
        role: segment.role,
        startMs: segment.startMs,
        endMs: segment.endMs,
        summary: segment.summary,
        line: beat.line,
        visual: beat.visual,
        asset: beat.asset,
        caption: beat.caption,
      }
    })

  return {
    source: {
      videoId: viralVideo.id,
      title: viralVideo.title,
      author: viralVideo.author,
      platform: viralVideo.platform,
      durationMs: viralVideo.durationMs,
      segmentCount: analysis.segments.length,
      sceneCount: analysis.scenes.length,
    },
    brief: result.brief,
    beats,
    assetChecklist: result.assetChecklist,
    captionDraft: result.captionDraft,
    voiceoverText: result.voiceoverText,
  }
}

// Text-only generateContent call (no Files API — the analysis is already text).
async function generateScriptLines(
  userId: string,
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  const result = await generateJson(
    [{ text: scriptPrompt(analysis, topic, notes, ctaPhrases) }],
    scriptSchema,
    "Script generation",
    {
      userId,
      action: {
        provider: "gemini",
        feature: "script_generation",
        model: ANALYSIS_MODEL,
      },
    }
  )
  return result.beats
}

async function generateBrief(
  userId: string,
  analysis: ViralVideoAnalysis,
  topic: string,
  notes: string | undefined,
  ctaPhrases: string[]
) {
  try {
    return await generateJson(
      [{ text: briefPrompt(analysis, topic, notes, ctaPhrases) }],
      briefSchema,
      "Brief generation",
      {
        userId,
        action: {
          provider: "gemini",
          feature: "script_generation",
          model: ANALYSIS_MODEL,
        },
      }
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Video analysis is not configured"
    ) {
      throw new Error(BRIEF_NOT_CONFIGURED_ERROR)
    }
    throw error
  }
}
