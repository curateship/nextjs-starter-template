import type { KeyedCompany } from "@/lib/video/video-models"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"

/**
 * The AI meter rows for Wan and Seedance shots.
 *
 * The shell's meter prices only the shell's own models, and Tyler chose on
 * 29 Oct 2026 to keep Wan and Seedance out of the shell. So Video writes
 * these rows itself, in the same table and the same shape: they count
 * against the monthly allowance and the project's spend limit like any
 * other. What the shell's writer also does, and this one cannot, is send the
 * 80% and 100% allowance emails, because that sender is private to the shell.
 */
export type VideoCharge = {
  userId: string
  company: KeyedCompany
  /** The model id the company was sent. */
  model: string
  status: "success" | "failed"
  cents: number
  /** Seedance bills tokens of video, kept as output tokens. */
  tokens?: number
  /** Wan bills seconds, kept beside the row like the shell keeps units. */
  seconds?: number
  metadata: Record<string, unknown>
}

/** Writes one row. Never throws, like the shell's writer: the shot comes first. */
export async function recordVideoCharge(charge: VideoCharge): Promise<void> {
  try {
    const at = now()
    await db.insert(customShellAiUsageEvents).values({
      id: uuid(),
      userId: charge.userId,
      provider: charge.company,
      model: charge.model,
      feature: "video-generation",
      inputTokens: 0,
      outputTokens: charge.tokens ?? 0,
      costCents: charge.status === "success" ? Math.max(0, Math.round(charge.cents)) : 0,
      status: charge.status,
      monthStart: aiUsageMonthStart(at),
      metadata:
        charge.seconds === undefined
          ? charge.metadata
          : { ...charge.metadata, units: charge.seconds },
      createdAt: at,
    })
  } catch (error) {
    console.error("Video AI usage row was not recorded", charge.company, error)
  }
}
