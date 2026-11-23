import { CheckIcon, CircleHelpIcon, XIcon } from "lucide-react"

import { LOST_MONEY, MADE_MONEY } from "@/lib/trade/money-tone"
import type { CardResult } from "@/lib/trade/trading-rules"
import { cn } from "@/lib/utils"

const STATE_WORDS: Record<CardResult["state"], string> = {
  yes: "Met",
  no: "Not met",
  unknown: "Can't tell yet",
}

/**
 * One condition as a line, with no prices: a green tick when it holds now, a
 * red cross when it does not, and a question mark, with the reason, when it
 * cannot tell yet. Tyler, 15 Oct 2026: it "should read (checkedmark) EMA 50
 * on 1week timeframe is above", and, of a tick beside 18 grids under a limit
 * of 5, "this should be an x".
 */
export function RuleConditionLine({
  card,
  className,
}: {
  card: CardResult
  className?: string
}) {
  const Icon =
    card.state === "yes"
      ? CheckIcon
      : card.state === "unknown"
        ? CircleHelpIcon
        : XIcon
  return (
    <span className={cn("flex items-start gap-1.5", className)}>
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          card.state === "yes"
            ? MADE_MONEY
            : card.state === "no"
              ? LOST_MONEY
              : "text-muted-foreground"
        )}
      />
      <span className="min-w-0">
        <span className="sr-only">{STATE_WORDS[card.state]}: </span>
        {card.label}
        {card.state === "unknown" ? (
          <span className="text-muted-foreground">. {card.now}</span>
        ) : null}
      </span>
    </span>
  )
}
