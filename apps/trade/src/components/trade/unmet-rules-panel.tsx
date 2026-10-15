import { RuleConditionLine } from "@/components/trade/rule-condition-line"
import { LOST_MONEY } from "@/lib/trade/money-tone"
import {
  blockedHeading,
  unmetRulesHeading,
  type RuleResult,
} from "@/lib/trade/trading-rules"
import { cn } from "@/lib/utils"

/**
 * The person's own rules an entry runs into, one block per rule: its name,
 * then every condition with a tick when it holds and a cross when it does
 * not, with no prices. A condition that cannot tell yet has a question mark
 * and says why. Sits
 * inside the window that asks "anyway?" or, for a rule set to Block, the
 * window that only goes back. Renders nothing when no rule counts.
 */
export function UnmetRulesPanel({
  id,
  results,
  className,
}: {
  id?: string
  results: readonly RuleResult[]
  className?: string
}) {
  if (results.length === 0) return null
  const blocked = results.some((result) => result.blocks)
  return (
    <div
      id={id}
      role="status"
      className={cn(
        "overflow-hidden rounded-lg border bg-destructive/5 text-sm",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold tracking-wide uppercase",
          LOST_MONEY
        )}
      >
        <span aria-hidden className="size-2 rounded-full bg-current" />
        {blocked ? blockedHeading(results) : unmetRulesHeading(results.length)}
      </div>
      <div className="divide-y">
        {results.map((result) => (
          <div key={result.rule.id} className="grid gap-2 px-3 py-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{result.rule.name}</span>
              <span className="text-xs text-muted-foreground">
                {result.blocks
                  ? "Blocks"
                  : result.rule.then === "block"
                    ? "Warns until it can tell"
                    : "Warns"}
              </span>
            </div>
            {result.allCards.map((card, index) => (
              <RuleConditionLine key={index} card={card} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
