import { and, eq, sql } from "drizzle-orm"

import {
  KEYED_COMPANIES,
  sizeFor,
  VIDEO_COMPANIES,
  type KeyedCompany,
  type VideoCompany,
} from "@/lib/video/video-models"
import type { ShotLengthSeconds, VideoQuality } from "@/lib/video/asset-factories"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import {
  getAiDefaults,
  getVideoKeyStatus,
  type VideoKeyStatus,
} from "@/server/video/settings"

/**
 * Everything Settings → AI video shows (`workspace/docs/wan-and-seedance.md`):
 * the two keys as their last four characters, which company new shots start
 * on, Wan's and Seedance's starting size, length and sound, and this month's
 * AI shots by company.
 */
export type AiVideoSettings = {
  keys: Record<KeyedCompany, VideoKeyStatus>
  company: VideoCompany
  starts: Record<KeyedCompany, { size: VideoQuality; length: ShotLengthSeconds; sound: boolean }>
  spend: VideoSpend
}

/** This month's finished AI shot pieces and what they cost, by company, for the whole app. */
export type VideoSpend = Record<VideoCompany, { pieces: number; cents: number }>

const DEFAULT_START_LENGTH: ShotLengthSeconds = 8

export async function loadAiVideoSettings(): Promise<AiVideoSettings> {
  const [wan, seedance, defaults, spend] = await Promise.all([
    getVideoKeyStatus("wan"),
    getVideoKeyStatus("seedance"),
    getAiDefaults(),
    videoSpendThisMonth(),
  ])
  const start = (company: KeyedCompany) => {
    const saved = defaults.videoModelDefaults?.[company]
    return {
      size: sizeFor(company, saved?.size),
      length: saved?.length ?? DEFAULT_START_LENGTH,
      sound: saved?.sound ?? true,
    }
  }
  return {
    keys: { wan, seedance },
    company: defaults.videoModel ?? "gemini",
    starts: Object.fromEntries(
      KEYED_COMPANIES.map((company) => [company, start(company)])
    ) as AiVideoSettings["starts"],
    spend,
  }
}

/**
 * Read off the AI meter: every piece that arrived this UTC month, the same
 * month the allowance counts. Google's rows are written by the shell's
 * meter, Wan's and Seedance's by `video-meter.ts`, all as "video-generation".
 */
export async function videoSpendThisMonth(): Promise<VideoSpend> {
  const rows = await db
    .select({
      provider: customShellAiUsageEvents.provider,
      pieces: sql<number>`count(*)::int`,
      cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int`,
    })
    .from(customShellAiUsageEvents)
    .where(
      and(
        eq(customShellAiUsageEvents.feature, "video-generation"),
        eq(customShellAiUsageEvents.status, "success"),
        eq(customShellAiUsageEvents.monthStart, aiUsageMonthStart(now()))
      )
    )
    .groupBy(customShellAiUsageEvents.provider)
  const spend = Object.fromEntries(
    VIDEO_COMPANIES.map((company) => [company, { pieces: 0, cents: 0 }])
  ) as VideoSpend
  for (const row of rows) {
    if ((VIDEO_COMPANIES as readonly string[]).includes(row.provider)) {
      spend[row.provider as VideoCompany] = { pieces: row.pieces, cents: row.cents }
    }
  }
  return spend
}
