import { LOST_MONEY } from "@/lib/trade/money-tone"
import { unmetRulesHeading, type UnmetRule } from "@/lib/trade/trading-rules"
import { cn } from "@/lib/utils"

/**
 * The person's own rules an entry does not meet, one block each: the rule's
 * name, what was asked for, and in red what is true right now. Sits inside the
 * warning window that asks "anyway?". Renders nothing when every rule is met.
 */
export function UnmetRulesPanel({
  id,
  rules,
  className,
}: {
  id?: string
  rules: readonly UnmetRule[]
  className?: string
}) {
  if (rules.length === 0) return null
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
        {unmetRulesHeading(rules.length)}
      </div>
      <div className="divide-y">
        {rules.map((rule) => (
          <div key={rule.kind} className="grid gap-1 px-3 py-2">
            <div className="font-medium">{rule.title}</div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="text-muted-foreground">Asked</span>
              <span>{rule.asked}</span>
              <span className="text-muted-foreground">Now</span>
              <span className={LOST_MONEY}>{rule.now}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
