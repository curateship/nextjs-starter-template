import type { BacktestGroupRun } from "@/lib/api/backtests"

export type BacktestGroupProgress = {
  /** Runs that finished, whether they succeeded or errored. */
  done: number
  /** Runs that finished with an error. */
  failed: number
  total: number
  /** True once every run in the group reached done or error. */
  allTerminal: boolean
}

export function summarizeGroupProgress(
  runs: Pick<BacktestGroupRun, "status">[]
): BacktestGroupProgress {
  const failed = runs.filter((run) => run.status === "error").length
  const done =
    runs.filter((run) => run.status === "done").length + failed
  return {
    done,
    failed,
    total: runs.length,
    allTerminal: runs.length > 0 && done === runs.length,
  }
}
