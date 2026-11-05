import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { ANALYSIS_NOTES_MAX, ANALYSIS_TOPIC_MAX, type ViralAnalysis } from "@/lib/viral/analysis"
import { adminGet, adminPost } from "@/server/guards"
import {
  analyseVideo,
  analysisPrice,
  listAnalyses,
  saveAnalysisNotes,
  type AnalyseResult,
  type AnalysisPrice,
} from "@/server/viral/ai-analysis"

/**
 * Analyse with AI on the right panel (`workspace/docs/ai-analysis.md`). Admin
 * only, like every Viral door. The owner comes from the session, never from
 * the request.
 */

export type { AnalyseResult, AnalysisPrice, ViralAnalysis }

const id = z.string().min(1).max(36)

const analyseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: id, url: z.string().min(1).max(2048), topic: z.string().max(ANALYSIS_TOPIC_MAX) }))
  .handler(async ({ data, context }): Promise<AnalyseResult> => analyseVideo(context.user.id, data))

/**
 * Analyse with AI. A video already broken down is written about at once
 * ("written"). Any other is downloaded and watched in the background
 * ("waiting"), and the analysis appears in `loadAnalyses` when it is done.
 */
export function analyseViralVideo(input: { projectId: string; url: string; topic: string }) {
  return analyseFn({ data: input })
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ savedVideoId: id }))
  .handler(async ({ data, context }) => listAnalyses(context.user.id, data.savedVideoId))

/** Every analysis of one saved video, newest first, the topic still waiting, and the last failure. */
export function loadAnalyses(savedVideoId: string) {
  return listFn({ data: { savedVideoId } })
}

const notesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ analysisId: id, notes: z.string().max(ANALYSIS_NOTES_MAX) }))
  .handler(async ({ data, context }) => {
    await saveAnalysisNotes(context.user.id, data.analysisId, data.notes)
  })

/** The Notes box under an analysis, saved as you type. */
export function saveAnalysisNotesFn(analysisId: string, notes: string) {
  return notesFn({ data: { analysisId, notes } })
}

const priceFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ durationSeconds: z.number().min(0).max(36_000).nullable(), breakdownReady: z.boolean() }))
  .handler(async ({ data }): Promise<AnalysisPrice> => analysisPrice(data.durationSeconds, data.breakdownReady))

/** What Analyse will roughly cost, shown in the Analyse box before it runs. */
export function loadAnalysisPrice(durationSeconds: number | null, breakdownReady: boolean) {
  return priceFn({ data: { durationSeconds, breakdownReady } })
}
