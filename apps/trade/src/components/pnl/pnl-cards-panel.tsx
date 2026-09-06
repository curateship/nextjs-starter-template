import { TrendingDownIcon, TrendingUpIcon, LayoutGridIcon } from "lucide-react"

import { PnlScoreCard } from "@/components/pnl/pnl-score-card"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatSignedUsd } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import type { PatternCards } from "@/lib/trade/pnl/patterns"
import {
  PNL_PERIOD_LABELS,
  PNL_PERIODS,
  isPnlPeriod,
  type PnlPeriod,
} from "@/lib/trade/pnl/periods"
import { cn } from "@/lib/utils"

/** How many groups of each grouping a card shows. */
const TOP = 3

/**
 * The three cards under the month grid, and the one period picker they
 * share: the AI score, the winning patterns, the losing patterns. Real money
 * on a real network only; practice and testnet trades are in the Journal and
 * nowhere here.
 */
export function PnlCardsPanel({
  period,
  onPeriodChange,
  made,
  lost,
  periodTrades,
}: {
  period: PnlPeriod
  onPeriodChange: (period: PnlPeriod) => void
  made: PatternCards
  lost: PatternCards
  /** Every closed real-money trade in the period, made, lost or even. */
  periodTrades: number
}) {
  return (
    <>
      <DashboardCardTitleHeader
        icon={<LayoutGridIcon />}
        title="Patterns"
        meta={`${periodTrades} ${periodTrades === 1 ? "trade" : "trades"}`}
        action={
          <Tabs
            value={period}
            onValueChange={(value) => {
              if (isPnlPeriod(value)) onPeriodChange(value)
            }}
          >
            <TabsList aria-label="Period">
              {PNL_PERIODS.map((one) => (
                <TabsTrigger key={one} value={one}>
                  {PNL_PERIOD_LABELS[one]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* The viewport forces its first child to a plain block, so the grid
            sits one box in. */}
        <div className="p-3">
          <div className="grid gap-3">
            <PnlScoreCard period={period} />
            <PatternCard
              title="Winning patterns"
              icon={<TrendingUpIcon className="size-4" />}
              cards={made}
              outcome="made"
            />
            <PatternCard
              title="Losing patterns"
              icon={<TrendingDownIcon className="size-4" />}
              cards={lost}
              outcome="lost"
            />
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

function PatternCard({
  title,
  icon,
  cards,
  outcome,
}: {
  title: string
  icon: React.ReactNode
  cards: PatternCards
  outcome: "made" | "lost"
}) {
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
          <span className={cn("ml-auto tabular-nums", moneyTone(cards.total))}>
            {cards.trades === 0 ? null : formatSignedUsd(cards.total)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {cards.trades === 0 ? (
          <p className="text-xs text-muted-foreground">
            {outcome === "made"
              ? "No trade made money in this period."
              : "No trade lost money in this period."}
          </p>
        ) : (
          cards.groupings.map((grouping) => (
            <div key={grouping.kind} className="grid gap-1">
              <div className="text-xs font-medium text-muted-foreground">
                {grouping.title}
              </div>
              {grouping.groups.slice(0, TOP).map((group) => (
                <div
                  key={group.label}
                  className="flex items-baseline gap-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {group.trades} {group.trades === 1 ? "trade" : "trades"}
                  </span>
                  <span
                    className={cn(
                      "w-20 text-right tabular-nums",
                      moneyTone(group.dollars)
                    )}
                  >
                    {formatSignedUsd(group.dollars)}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
