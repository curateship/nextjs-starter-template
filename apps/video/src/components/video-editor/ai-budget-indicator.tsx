import * as React from "react"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { loadMyAiUsage, type MyAiUsage } from "@/lib/api/ai"
import { formatMoney } from "@/lib/format/money"
import {
  budgetHeadline,
  budgetState,
  featureLabel,
} from "@/lib/video/ai-budget"

/**
 * How much of this month's AI budget is left, sat in the studio's top bar.
 *
 * It reads the app's one meter — the same numbers the usage screen shows and
 * the same ceiling that stops a call going through — so what it says and what
 * happens when a button is pressed can never disagree.
 *
 * Nothing is drawn at all when there is no ceiling, and nothing is said when
 * the reading cannot be fetched: there is no budget to report on in the first
 * case, and in the second the ceiling still does its job whether or not this
 * corner of the screen managed to show it.
 */
export function AiBudgetIndicator() {
  const [usage, setUsage] = React.useState<MyAiUsage | null>(null)

  React.useEffect(() => {
    let active = true
    loadMyAiUsage()
      .then((loaded) => {
        if (active) setUsage(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  if (!usage || usage.allowanceCents === null) return null

  const allowance = usage.allowanceCents
  const leftCents = Math.max(0, allowance - usage.spentCents)
  const state = budgetState(usage.spentCents, allowance)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost">
          <SparklesIcon />
          {state === "none" ? "AI budget used up" : `${formatMoney(leftCents)} of AI left`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="grid gap-3">
          <div className="grid gap-1">
            <p className="font-medium">{budgetHeadline(state)}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(usage.spentCents)} of {formatMoney(allowance)} spent
              this month. It starts again on the first of next month.
            </p>
          </div>
          {usage.recent.length ? (
            <div className="grid gap-1">
              <p className="text-sm font-medium">Last few</p>
              <ul className="grid gap-1">
                {usage.recent.slice(0, 5).map((call) => (
                  <li
                    key={call.id}
                    className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground"
                  >
                    <span className="truncate">{featureLabel(call.feature)}</span>
                    <span className="tabular-nums">
                      {call.status === "blocked"
                        ? "refused"
                        : formatMoney(call.costCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing has been spent yet this month.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
