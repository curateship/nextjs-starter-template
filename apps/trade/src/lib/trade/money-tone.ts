/**
 * The one green for money made, and the one red for money lost.
 *
 * Every panel on the workspace used to keep its own pairing — one was teal,
 * one was emerald, one had no dark-mode colour at all and stayed pale green on
 * a dark screen every night. Three shades of green on one screen read as three
 * different meanings, so there is one home for the pair and the call sites ask
 * for it by name.
 *
 * **Green matches the chart's rising candle.** `chart-theme.ts` reads
 * `text-emerald-600 dark:text-emerald-400` off the page and hands it to the
 * chart library, so a row that made money and a candle that went up are the
 * same green. Red is the theme's own `destructive` token, which the shell
 * already redefines for dark mode — one class instead of a light/dark pair a
 * call site could get half right.
 */

/** A figure that made money. */
export const MADE_MONEY = "text-emerald-600 dark:text-emerald-400"

/** A figure that lost money. */
export const LOST_MONEY = "text-destructive"

/** A warning that needs attention but does not mean money was lost. */
export const WARNING = "text-amber-700 dark:text-amber-400"

/** The quiet filled versions used by badges and headline figures. */
export const MADE_MONEY_SURFACE =
  "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
export const LOST_MONEY_SURFACE = "bg-destructive/10 text-destructive"
export const WARNING_SURFACE =
  "bg-amber-500/10 text-amber-700 dark:text-amber-400"
export const ALARM_SURFACE = "bg-destructive/20 text-destructive"

/** Filled trading actions. Text follows the active light or dark canvas. */
export const BUY_BUTTON =
  "bg-emerald-600 text-background hover:bg-emerald-600/90 dark:bg-emerald-400 dark:hover:bg-emerald-400/90"
export const SELL_BUTTON =
  "bg-destructive text-background hover:bg-destructive/90"

/**
 * What colour a figure of money is written in: green up, red down, and
 * nothing at all for a plain zero.
 *
 * **Zero keeps the colour of whatever it sits in.** Breaking exactly even is a
 * real answer, not a missing one, and greying it out is how this app says "the
 * exchange never told us" — a dash. Painting a real $0.00 the same way would
 * make the two impossible to tell apart.
 */
export function moneyTone(value: number): string | undefined {
  if (value > 0) return MADE_MONEY
  if (value < 0) return LOST_MONEY
  return undefined
}

/** The same money tone with a quiet background behind it. */
export function moneyToneSurface(value: number): string | undefined {
  if (value > 0) return MADE_MONEY_SURFACE
  if (value < 0) return LOST_MONEY_SURFACE
  return undefined
}
