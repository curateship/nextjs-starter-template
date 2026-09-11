import { z } from "zod"

import { formatWholeUsd } from "@/lib/trade/format"

/**
 * The daily goal: how much this account is trying to make in a day.
 *
 * Tyler, 11 Sep 2026: "I want to make .1 percent per day of my total wallets."
 * So the goal is written as a percent of what every live wallet is worth right
 * now, and the target moves with the wallets rather than being typed again
 * every time the account grows. A plain dollar figure is the other way of
 * saying it, for somebody who wants the same number every day.
 *
 * Nothing here stops an order. The goal is a figure to look at, in the same
 * family as the trading overview's Made or lost, and the engine never reads it.
 *
 * Never rename a field once saved: the column holds whatever was written, and
 * an older row is read through `readGoal` rather than migrated.
 */

/** How the target is written down. */
export const GOAL_MODES = ["percent", "dollars"] as const
export type GoalMode = (typeof GOAL_MODES)[number]

export const GOAL_MODE_LABELS: Record<GoalMode, string> = {
  percent: "A percent of all my wallets",
  dollars: "A fixed amount of money",
}

/**
 * The limits are wide on purpose. They exist so a typo cannot save a target of
 * a billion dollars or of nothing at all, not to tell somebody what a sensible
 * day looks like.
 */
export const goalSchema = z.object({
  on: z.boolean(),
  mode: z.enum(GOAL_MODES),
  /** Percent of the wallet total, so 0.1 means a tenth of one percent. */
  percent: z.number().min(0.01).max(100),
  /** The same target written as money instead. */
  dollars: z.number().min(0.01).max(1_000_000),
})

export type Goal = z.infer<typeof goalSchema>

export const DEFAULT_GOAL: Goal = {
  on: false,
  mode: "percent",
  percent: 0.1,
  dollars: 25,
}

/**
 * A stored goal, field by field. Anything unreadable is the default.
 *
 * One field at a time on purpose. A row written by an older build holds fewer
 * fields, and a row holding one impossible number still knows whether the goal
 * is on — reading the whole object or nothing would switch somebody's goal off
 * because a percent was out of range.
 */
export function readGoal(value: unknown): Goal {
  const saved =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  const field = <T>(schema: z.ZodType<T>, raw: unknown, fallback: T): T => {
    const parsed = schema.safeParse(raw)
    return parsed.success ? parsed.data : fallback
  }
  return {
    on: field(goalSchema.shape.on, saved.on, DEFAULT_GOAL.on),
    mode: field(goalSchema.shape.mode, saved.mode, DEFAULT_GOAL.mode),
    percent: field(
      goalSchema.shape.percent,
      saved.percent,
      DEFAULT_GOAL.percent
    ),
    dollars: field(
      goalSchema.shape.dollars,
      saved.dollars,
      DEFAULT_GOAL.dollars
    ),
  }
}

/**
 * Today's target in dollars, or null when it cannot be worked out.
 *
 * A percent of nothing is nothing, and a target of $0 would read as met the
 * moment the day starts. So a percent goal with no wallet total answers null,
 * which the header draws as a dash — the same way every other figure in this
 * app says "the exchange never told us".
 */
export function goalTarget(goal: Goal, walletsWorth: number | null): number | null {
  if (goal.mode === "dollars") return goal.dollars
  if (walletsWorth === null || walletsWorth <= 0) return null
  return (walletsWorth * goal.percent) / 100
}

/** How today is going against the goal. Every figure is dollars. */
export type GoalProgress = {
  /** Money banked today, from fills the exchange has priced. */
  made: number | null
  target: number | null
  /** What every live wallet that answered is worth right now. */
  walletsWorth: number | null
  /** What the open positions are up or down. Never inside `made`. */
  openProfit: number | null
  /** Exchanges that did not answer, so their money is in none of the above. */
  missingVenues: string[]
  /** Fills today the exchange has not priced, so they are in no figure yet. */
  unpricedFills: number
}

/**
 * What the button says: "$5/$25", made today over today's target, and
 * "—/—" when neither figure arrived.
 */
export function shortGoalLabel(progress: GoalProgress): string {
  return `${wholeOrDash(progress.made)}/${wholeOrDash(progress.target)}`
}

/** The same two figures in words, for somebody who cannot see the button. */
export function goalLabel(progress: GoalProgress): string {
  return `Goal: ${wholeOrDash(progress.made)} of ${wholeOrDash(progress.target)}`
}

function wholeOrDash(value: number | null): string {
  return value === null ? "—" : formatWholeUsd(value)
}

/** Money still to make today, or null while either figure is unknown. */
export function goalRemaining(progress: GoalProgress): number | null {
  if (progress.made === null || progress.target === null) return null
  return Math.max(progress.target - progress.made, 0)
}

/**
 * What colour the button's figures are: "made" once the target is reached,
 * "lost" on a day that is down, and null for everything in between.
 *
 * **It follows the figures as printed, not the figures as held.** The button
 * says whole dollars, and a day that has paid four tenths of a cent in fees
 * and settled nothing prints "$0" while holding -0.004. Colouring that red
 * put a red $0 in the header on a day nothing had happened, which reads as a
 * loss and breaks the rule that a real zero keeps the colour around it.
 */
export function goalTone(progress: GoalProgress): "made" | "lost" | null {
  const made = progress.made === null ? null : Math.round(progress.made)
  const target = progress.target === null ? null : Math.round(progress.target)
  if (made === null || target === null) return null
  if (made >= target) return "made"
  if (made < 0) return "lost"
  return null
}

/** How the target was worked out, in the panel's own words. */
export function goalSource(goal: Goal, walletsWorth: number | null): string {
  if (goal.mode === "dollars") {
    return `${formatWholeUsd(goal.dollars)} a day, the amount you set.`
  }
  if (walletsWorth === null) {
    return `${goal.percent}% of all your wallets. No wallet answered, so today's target is unknown.`
  }
  return `${goal.percent}% of ${formatWholeUsd(walletsWorth)}, what your wallets are worth now.`
}
