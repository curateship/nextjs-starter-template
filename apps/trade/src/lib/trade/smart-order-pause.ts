import { z } from "zod"

/** Pause bookkeeping shared by every smart-order plan stored in the one table. */
export const smartOrderPauseFields = {
  /** A paused plan sends nothing until a person resumes it. */
  paused: z.boolean().optional(),
  /** The last order-specific refusal, already translated into plain words. */
  pauseReason: z.string().max(500).nullable().optional(),
  /** Consecutive order-specific refusals from the live exchange. */
  refusalStreak: z.number().int().min(0).optional(),
}

export type PausableSmartPlan = {
  paused?: boolean
  pauseReason?: string | null
  refusalStreak?: number
}
