/**
 * Bot guardian math shared by the worker's monitor, the settings card, and
 * the bots-page banner. Pure functions so the safety rule that pauses real
 * money is unit-testable without a database or an exchange.
 *
 * The guardian watches the combined equity of the account's active exchange
 * wallets (the same readings the snapshot poller writes every minute). That
 * total includes manual positions by design — a manual trade that drains the
 * account is exactly the kind of day the guardian should end early.
 */

export type GuardianAction = "pause_all" | "flatten_all"

export type GuardianLimits = {
  /** Stop when today's loss reaches this many dollars. Null = off. */
  dailyLossLimitUsd: number | null
  /** Stop when today's loss reaches this percent of the day's starting value. Null = off. */
  dailyLossLimitPct: number | null
  /** Stop when the account falls this percent below its watched peak. Null = off. */
  maxDrawdownPct: number | null
}

export type GuardianConfig = GuardianLimits & {
  enabled: boolean
  action: GuardianAction
}

/**
 * The worker's persisted between-tick memory. `dayDate`/`dayStartEquity`
 * reset at UTC midnight; `peakEquity` only ratchets up; `breachStreak`
 * counts consecutive breaching readings. All null/zero after a save or
 * re-arm so watching restarts from the next clean reading.
 */
export type GuardianWatch = {
  dayDate: string | null
  dayStartEquity: number | null
  peakEquity: number | null
  breachStreak: number
}

/**
 * Readings arrive once a minute, so three consecutive breaches ≈ three
 * minutes of sustained loss before the guardian acts. One bad mark price or
 * a single spiky reading can never trip it; a real bleed only waits ~3
 * minutes longer. Deliberate middle ground — documented in the settings UI.
 */
export const GUARDIAN_TRIP_STREAK = 3

export type GuardianTickResult = {
  watch: GuardianWatch
  /** Plain-English descriptions of every limit currently crossed. */
  breaches: string[]
  /** Non-null when this reading trips the guardian (streak reached). */
  trip: string | null
}

export function createEmptyGuardianWatch(): GuardianWatch {
  return {
    dayDate: null,
    dayStartEquity: null,
    peakEquity: null,
    breachStreak: 0,
  }
}

/** YYYY-MM-DD in UTC — the guardian's trading "day" matches bot daily P&L. */
export function guardianUtcDate(at: Date): string {
  return at.toISOString().slice(0, 10)
}

const usd = (value: number) =>
  `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
const pct = (value: number) =>
  `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`

/**
 * One guardian check against one fresh equity reading. Pure: the caller owns
 * the clock, persistence, and the tripped latch (a tripped guardian must not
 * be evaluated again until re-armed).
 */
export function evaluateGuardianTick(input: {
  limits: GuardianLimits
  watch: GuardianWatch
  equity: number
  utcDate: string
}): GuardianTickResult {
  const { limits, watch, equity, utcDate } = input

  // A new UTC day (or a fresh watch) re-baselines the daily loss from this
  // reading. The peak deliberately survives midnight — drawdown is "from the
  // watched peak", not "from today's peak".
  const dayStartEquity =
    watch.dayDate === utcDate && watch.dayStartEquity !== null
      ? watch.dayStartEquity
      : equity
  const peakEquity = Math.max(watch.peakEquity ?? equity, equity)

  // A limit only counts when it is a positive number. The UI can't save
  // zero, but a hand-edited row must read as "off" — a 0 limit would
  // otherwise trip on a flat account (loss 0 >= limit 0).
  const breaches: string[] = []
  const dailyLoss = dayStartEquity - equity
  if (
    limits.dailyLossLimitUsd !== null &&
    limits.dailyLossLimitUsd > 0 &&
    dailyLoss >= limits.dailyLossLimitUsd
  ) {
    breaches.push(
      `today's loss is ${usd(dailyLoss)} (limit ${usd(limits.dailyLossLimitUsd)})`
    )
  }
  if (
    limits.dailyLossLimitPct !== null &&
    limits.dailyLossLimitPct > 0 &&
    dayStartEquity > 0
  ) {
    const dailyLossPct = (dailyLoss / dayStartEquity) * 100
    if (dailyLossPct >= limits.dailyLossLimitPct) {
      breaches.push(
        `today's loss is ${pct(dailyLossPct)} of the day's starting value (limit ${pct(limits.dailyLossLimitPct)})`
      )
    }
  }
  if (
    limits.maxDrawdownPct !== null &&
    limits.maxDrawdownPct > 0 &&
    peakEquity > 0
  ) {
    const drawdownPct = ((peakEquity - equity) / peakEquity) * 100
    if (drawdownPct >= limits.maxDrawdownPct) {
      breaches.push(
        `the account is ${pct(drawdownPct)} below its watched peak of ${usd(peakEquity)} (limit ${pct(limits.maxDrawdownPct)})`
      )
    }
  }

  const breachStreak = breaches.length > 0 ? watch.breachStreak + 1 : 0
  const trip =
    breachStreak >= GUARDIAN_TRIP_STREAK
      ? `${joinBreaches(breaches)} for ${breachStreak} checks in a row`
      : null

  return {
    watch: { dayDate: utcDate, dayStartEquity, peakEquity, breachStreak },
    breaches,
    trip,
  }
}

function joinBreaches(breaches: string[]): string {
  if (breaches.length <= 1) return breaches[0] ?? ""
  return `${breaches.slice(0, -1).join(", ")} and ${breaches[breaches.length - 1]}`
}

/** True when at least one limit is set — an enabled guardian needs one. */
export function guardianHasLimit(limits: GuardianLimits): boolean {
  return (
    limits.dailyLossLimitUsd !== null ||
    limits.dailyLossLimitPct !== null ||
    limits.maxDrawdownPct !== null
  )
}

/**
 * "today's loss reaches $500 or 2% of the day's start, or the account drops
 * 10% from its peak" — shared by the banner and the settings status line.
 */
export function describeGuardianLimits(limits: GuardianLimits): string {
  const daily: string[] = []
  if (limits.dailyLossLimitUsd !== null) daily.push(usd(limits.dailyLossLimitUsd))
  if (limits.dailyLossLimitPct !== null) {
    daily.push(`${pct(limits.dailyLossLimitPct)} of the day's start`)
  }
  const parts: string[] = []
  if (daily.length > 0) parts.push(`today's loss reaches ${daily.join(" or ")}`)
  if (limits.maxDrawdownPct !== null) {
    parts.push(`the account drops ${pct(limits.maxDrawdownPct)} from its peak`)
  }
  return parts.join(", or ")
}

export function describeGuardianAction(action: GuardianAction): string {
  return action === "flatten_all"
    ? "close every bot position and pause all bots"
    : "pause all bots"
}

/**
 * The Bots table's toolbar chip for the quiet "watching" state; null hides
 * it when the guardian is off or already tripped (the tripped state gets a
 * loud banner with the re-arm button instead).
 */
export function guardianTableStatus(
  guardian: GuardianConfig & { trippedAt: string | null }
) {
  if (!guardian.enabled || guardian.trippedAt) return null
  return {
    tone: "neutral" as const,
    text: `Guardian armed — will ${describeGuardianAction(guardian.action)} if ${describeGuardianLimits(guardian)}`,
  }
}

/**
 * The reason a global pause/flatten command carries, surfaced verbatim in
 * each affected bot's event history and status. Kept lenient: a payload
 * written by an older web build simply has no reason.
 */
export function globalCommandReason(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null
  }
  const reason = (payload as { reason?: unknown }).reason
  return typeof reason === "string" && reason.trim() ? reason : null
}
