import { plural } from "@/lib/format/plural"
import type { BacktestListRow } from "@/lib/trade/backtest/result"

/** An unnamed run says what it was, which is more use than "Untitled". */
export function backtestName(run: Pick<BacktestListRow, "name" | "coinsTotal" | "spec">): string {
  return (
    run.name ??
    `${run.coinsTotal} ${plural(run.coinsTotal, "market", "markets")}, ${run.spec.days} ${plural(run.spec.days, "day", "days")}`
  )
}

