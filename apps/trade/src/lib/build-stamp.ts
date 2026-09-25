/**
 * When this copy of the program was built, and from which commit.
 *
 * The build writes it in as a constant: `vite.config.ts` for the website and
 * `scripts/build-worker.mjs` for the engine and the shell worker. A dev
 * server and a test run have no stamp and answer null.
 *
 * Why it exists: the engine says its build on every heartbeat, and the
 * Workers card shows it, so a container left on an old build is found by
 * reading the card instead of guessed at.
 */

declare const __TRADE_BUILD_STAMP__: string | undefined

export type BuildStamp = {
  /** Milliseconds since the epoch, taken when the build ran. */
  builtAt: number
  /** The git commit the build was made from, when the builder knew it. */
  commit: string | null
}

export function buildStamp(): BuildStamp | null {
  if (typeof __TRADE_BUILD_STAMP__ !== "string") return null
  try {
    const parsed: unknown = JSON.parse(__TRADE_BUILD_STAMP__)
    if (typeof parsed !== "object" || parsed === null) return null
    const { builtAt, commit } = parsed as Partial<BuildStamp>
    if (typeof builtAt !== "number" || !Number.isFinite(builtAt)) return null
    return { builtAt, commit: typeof commit === "string" ? commit : null }
  } catch {
    return null
  }
}

/** "built 4 Sep 2026 12:55 UTC (abc1234)" for a console line or a screen. */
export function describeBuild(stamp: BuildStamp | null): string {
  if (!stamp) return "an unstamped build (dev or test)"
  const when = new Date(stamp.builtAt).toISOString().replace("T", " ").slice(0, 16)
  return stamp.commit
    ? `built ${when} UTC (${stamp.commit.slice(0, 7)})`
    : `built ${when} UTC`
}
