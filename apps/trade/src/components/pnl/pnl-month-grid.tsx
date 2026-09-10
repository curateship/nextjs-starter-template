import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatMonthAndYear } from "@/lib/format/format-time"
import { monthTotal, type DayResult } from "@/lib/trade/pnl/day-buckets"
import {
  currentMonth,
  daysOfMonth,
  dayStart,
  earliestMonth,
  weekdayColumn,
  type DayKey,
} from "@/lib/trade/pnl/periods"
import { PnlAmount } from "@/components/trade/pnl-amount"
import { formatSignedUsd, formatWholeUsd } from "@/lib/trade/format"
import { moneyTone, moneyToneSurface } from "@/lib/trade/money-tone"
import { walletProfitWindowStart } from "@/lib/trade/wallets"
import { cn } from "@/lib/utils"

const WEEKDAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

type Month = { year: number; month: number }

function monthAfter({ year, month }: Month, step: 1 | -1): Month {
  const next = new Date(Date.UTC(year, month - 1 + step, 1))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 }
}

function sameMonth(left: Month, right: Month): boolean {
  return left.year === right.year && left.month === right.month
}

function monthPrefix({ year, month }: Month): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

/**
 * A month, one tile per day, each coloured by what that day settled: the one
 * green for money made, the one red for money lost, plain grey for a day with
 * no trades. Hover a tile for the dollars and the trade count.
 *
 * The arrows walk months from the current one back to August 2026, where the
 * records begin; days before 20 August are drawn faint, because there is
 * nothing to say about them rather than nothing having happened.
 */
export function PnlMonthGrid({
  days,
  month,
  onMonthChange,
  now,
}: {
  days: ReadonlyMap<DayKey, DayResult>
  month: Month
  onMonthChange: (month: Month) => void
  now: number
}) {
  const latest = currentMonth(now)
  const earliest = earliestMonth()
  const total = monthTotal(days, monthPrefix(month))
  const listed = daysOfMonth(month.year, month.month)
  const leading = weekdayColumn(listed[0])
  const since = walletProfitWindowStart()

  return (
    <>
      <DashboardCardTitleHeader
        icon={<CalendarDaysIcon />}
        title={formatMonthAndYear(month.year, month.month)}
        meta={
          total.trades === 0 && total.unpriced === 0 ? (
            "No trades"
          ) : (
            <>
              <PnlAmount>{formatSignedUsd(total.money)}</PnlAmount>
              {` across ${total.trades} ${total.trades === 1 ? "trade" : "trades"}${total.unpriced ? `, ${total.unpriced} unpriced` : ""}`}
            </>
          )
        }
        action={
          <span className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Earlier month"
              disabled={sameMonth(month, earliest)}
              onClick={() => onMonthChange(monthAfter(month, -1))}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Later month"
              disabled={sameMonth(month, latest)}
              onClick={() => onMonthChange(monthAfter(month, 1))}
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </span>
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {/* The viewport forces its first child to a plain block, so the grid
            sits one box in. */}
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_HEADS.map((head) => (
              <div
                key={head}
                className="pb-1 text-center text-xs font-medium text-muted-foreground"
              >
                {head}
              </div>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <div key={`lead-${index}`} aria-hidden />
            ))}
            {listed.map((day) => (
              <DayTile
                key={day}
                day={day}
                result={days.get(day) ?? null}
                beforeRecords={dayStart(day) < since}
                future={dayStart(day) > now}
              />
            ))}
          </div>
        </div>
      </ScrollArea>
    </>
  )
}

function DayTile({
  day,
  result,
  beforeRecords,
  future,
}: {
  day: DayKey
  result: DayResult | null
  beforeRecords: boolean
  future: boolean
}) {
  const number = Number(day.slice(-2))
  const quiet = beforeRecords || future
  const traded =
    result !== null &&
    (result.trades > 0 || result.unpriced > 0 || result.money !== 0)
  const words = beforeRecords
    ? "Before records begin on 20 August 2026."
    : future
      ? "Not yet."
      : !traded
        ? "No trades."
        : `${formatSignedUsd(result.money)} across ${result.trades} ${result.trades === 1 ? "trade" : "trades"}${result.unpriced ? `, plus ${result.unpriced} ${result.unpriced === 1 ? "fill" : "fills"} the exchange has not priced` : ""}.`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          aria-label={`${day}: ${words}`}
          className={cn(
            "flex aspect-square min-h-11 flex-col items-center justify-center rounded-md text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            quiet
              ? "text-muted-foreground/50"
              : traded
                ? (moneyToneSurface(result.money) ?? "bg-muted")
                : "bg-muted text-muted-foreground"
          )}
        >
          <span className="font-medium tabular-nums">{number}</span>
          {traded && !quiet ? (
            <PnlAmount className={cn("tabular-nums", moneyTone(result.money))}>
              {result.money === 0 && result.unpriced
                ? "—"
                : formatWholeUsd(result.money)}
            </PnlAmount>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent>{words}</TooltipContent>
    </Tooltip>
  )
}
