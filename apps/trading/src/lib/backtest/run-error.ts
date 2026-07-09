/**
 * Maps a backtest run failure to a short, user-safe message. Domain errors that
 * are safe to show verbatim pass through; upstream/internal text (rate limits,
 * stack traces) is genericized so it never leaks to the client or a stored row.
 */
export function runFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message.startsWith("No candle history") ||
      error.message.includes("can't be backtested")
    ) {
      return error.message
    }
    if (
      error.message.includes("429") ||
      error.message.includes("Too Many Requests")
    ) {
      return "The candle download was rate-limited. Wait a minute and re-run."
    }
  }
  return "Backtest failed — check the server logs."
}
