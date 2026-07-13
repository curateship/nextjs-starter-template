import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { loadPnlCalendar, type PnlCalendarResponse } from "@/lib/api/pnl"
import type { WalletItem } from "@/lib/api/wallets"
import { cn } from "@/lib/utils"
import {
  aggFrom,
  buildDayIndex,
  buildMonthView,
  buildStreak,
  buildYearView,
  DOWN,
  DOWN_RGB,
  money,
  MONTHS,
  pctStr,
  SHORT,
  sideColor,
  tint,
  toneColor,
  UP,
  UP_RGB,
  weekTint,
  winRateOf,
  type DayAgg,
  type MonthView,
  type YearViewModel,
} from "@/components/pnl/pnl-calendar-model"

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// 7 equal day columns + a fixed week-summary column.
const GRID = "repeat(7, minmax(0, 1fr)) 54px"

export function PnlCalendarDashboard({
  wallets,
  initial,
}: {
  wallets: WalletItem[]
  initial: PnlCalendarResponse
}) {
  const today = React.useMemo(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() }
  }, [])

  const [data, setData] = React.useState(initial)
  const [loading, setLoading] = React.useState(false)
  const [view, setView] = React.useState<"month" | "year">("month")
  const [symbol, setSymbol] = React.useState("All")
  const [year, setYear] = React.useState(today.y)
  const [month, setMonth] = React.useState(today.m)
  const [selected, setSelected] = React.useState<{
    y: number
    m: number
    d: number
  } | null>(null)

  async function selectWallet(walletId: string) {
    setLoading(true)
    try {
      const next = await loadPnlCalendar(walletId)
      setData(next)
      setSymbol("All")
    } finally {
      setLoading(false)
    }
  }

  // Bucket realizing fills into local calendar days (honors the symbol filter).
  const index = React.useMemo(
    () => buildDayIndex(data.trades, symbol),
    [data.trades, symbol]
  )

  const monthVM = React.useMemo(
    () => buildMonthView(index, year, month, today),
    [index, year, month, today]
  )
  const streak = React.useMemo(() => buildStreak(index, today), [index, today])
  const yearVM = React.useMemo(
    () => (view === "year" ? buildYearView(index, year) : null),
    [index, year, view]
  )

  const modal = selected
    ? aggFrom(index, selected.y, selected.m, selected.d)
    : null

  function shiftMonth(delta: number) {
    const shifted = new Date(year, month + delta, 1)
    setYear(shifted.getFullYear())
    setMonth(shifted.getMonth())
  }
  function goToday() {
    setMonth(today.m)
    setYear(today.y)
    setView("month")
  }

  const symbolOptions = ["All", ...data.symbols]

  return (
    <div className="flex w-full flex-col gap-2 md:gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 md:gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">P&amp;L Calendar</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Daily net realized profit &amp; loss
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="Wallet">
            <Select
              value={data.walletId ?? ""}
              disabled={loading || wallets.length === 0}
              onValueChange={(value) => void selectWallet(value)}
            >
              <SelectTrigger className="min-w-40">
                <SelectValue
                  placeholder={
                    wallets.length === 0 ? "No wallets" : "Select wallet"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {wallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Symbol">
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="min-w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {symbolOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="View">
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as "month" | "year")}
            >
              <TabsList>
                <TabsTrigger value="month">Month</TabsTrigger>
                <TabsTrigger value="year">Year</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
        </div>
      </div>

      {view === "month" ? (
        <div className="grid items-start gap-2 md:gap-3 lg:grid-cols-[1fr_316px]">
          {/* Calendar */}
          <Card className="gap-0 p-4 sm:p-[18px]">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <div className="text-[17px] font-semibold tracking-tight">
                {MONTHS[month]} {year}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeftIcon />
                </Button>
                <Button variant="outline" size="sm" onClick={goToday}>
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRightIcon />
                </Button>
              </div>
            </div>

            <div
              className="mb-1.5 grid gap-1"
              style={{ gridTemplateColumns: GRID }}
            >
              {DOW.map((name) => (
                <HeadCell key={name}>{name}</HeadCell>
              ))}
              <HeadCell>Week</HeadCell>
            </div>

            <div className="flex flex-col gap-1.5">
              {monthVM.weeks.map((week, index) => (
                <div
                  key={index}
                  className="grid gap-1"
                  style={{ gridTemplateColumns: GRID }}
                >
                  {week.days.map((day, dayIndex) => (
                    <DayCell
                      key={dayIndex}
                      day={day}
                      maxAbs={monthVM.maxAbs}
                      accountValue={data.accountValue}
                      onOpen={() =>
                        setSelected({ y: year, m: month, d: day.dnum })
                      }
                    />
                  ))}
                  <WeekCell total={week.total} days={week.wDays} />
                </div>
              ))}
            </div>
          </Card>

          {/* Sidebar */}
          <div className="flex flex-col gap-2 md:gap-3">
            <Card className="gap-0 px-[18px] py-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Net P&amp;L — {SHORT[month]} {year}
              </div>
              <div
                className="mt-1.5 font-mono text-3xl font-semibold tracking-tight tabular-nums"
                style={{ color: toneColor(monthVM.monthTotal) }}
              >
                {money(monthVM.monthTotal)}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {monthVM.tradingDays} trading days · {monthVM.trades} trades ·
                avg {money(monthVM.avgDay)}/day
              </div>
              {data.trades.length === 0 && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  No realized trades in the last 365 days for this wallet.
                </div>
              )}
            </Card>

            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <StatCard
                label="Win rate"
                value={`${monthVM.winRate}%`}
                sub={`${monthVM.winDays}/${monthVM.tradingDays} green days`}
              />
              <StatCard
                label="Profit factor"
                value={monthVM.profitFactor}
                sub="gross W / gross L"
              />
              <StatCard
                label="Best day"
                value={monthVM.best.d ? money(monthVM.best.pnl) : "—"}
                valueColor={UP}
                sub={
                  monthVM.best.d ? `${SHORT[month]} ${monthVM.best.d}` : "—"
                }
              />
              <StatCard
                label="Worst day"
                value={monthVM.worst.d ? money(monthVM.worst.pnl) : "—"}
                valueColor={DOWN}
                sub={
                  monthVM.worst.d ? `${SHORT[month]} ${monthVM.worst.d}` : "—"
                }
              />
            </div>

            <Card className="flex-row items-center gap-3 px-4 py-3.5">
              <div
                className="flex size-[42px] items-center justify-center rounded-xl text-xl"
                style={{ background: streak.bg }}
              >
                {streak.icon}
              </div>
              <div>
                <div className="text-[15px] font-semibold">{streak.title}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {streak.detail}
                </div>
              </div>
            </Card>

            <Card className="gap-0 px-4 pt-4 pb-3">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cumulative equity
                </div>
                <div
                  className="font-mono text-xs font-medium tabular-nums"
                  style={{ color: toneColor(monthVM.monthTotal) }}
                >
                  {money(monthVM.monthTotal)}
                </div>
              </div>
              <EquityCurve vm={monthVM} />
            </Card>
          </div>
        </div>
      ) : (
        <YearView
          vm={yearVM!}
          year={year}
          onPrev={() => setYear((y) => y - 1)}
          onNext={() => setYear((y) => y + 1)}
          onPickMonth={(mo) => {
            setMonth(mo)
            setView("month")
          }}
        />
      )}

      <DayDetailDialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        selected={selected}
        agg={modal}
        accountValue={data.accountValue}
      />
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Presentational pieces
// ————————————————————————————————————————————————————————————————

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-0.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  )
}

function DayCell({
  day,
  maxAbs,
  accountValue,
  onOpen,
}: {
  day: MonthView["weeks"][number]["days"][number]
  maxAbs: number
  accountValue: number
  onOpen: () => void
}) {
  if (!day.inMonth) {
    return <div className="min-h-[88px] rounded-[10px]" aria-hidden />
  }

  const { agg, hasData, isToday, dnum } = day
  const pct =
    accountValue > 0 ? (agg.pnl / accountValue) * 100 : null

  const cell = (
    <div
      onClick={hasData ? onOpen : undefined}
      className={cn(
        "flex min-h-[88px] flex-col justify-between overflow-hidden rounded-[10px] border p-1.5",
        hasData ? "cursor-pointer" : "cursor-default",
        isToday ? "border-foreground ring-1 ring-foreground" : "border-border"
      )}
      style={{ background: hasData ? tint(agg.pnl, maxAbs) : "transparent" }}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "text-xs font-semibold",
            isToday ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {dnum}
        </span>
        {hasData && (
          <span className="font-mono text-[9.5px] font-medium text-muted-foreground">
            {agg.trades.length}
          </span>
        )}
      </div>
      {hasData && (
        <div>
          <div
            className="whitespace-nowrap font-mono font-medium tracking-tight"
            style={{
              color: toneColor(agg.pnl),
              fontSize: "clamp(10.5px, 1.42vw, 15px)",
            }}
          >
            {money(agg.pnl)}
          </div>
          <div className="mt-px font-mono text-[10px] text-muted-foreground">
            {pct !== null ? `${pctStr(pct)} · ` : ""}
            {agg.wins}W·{agg.losses}L
          </div>
        </div>
      )}
    </div>
  )

  if (!hasData) return cell

  return (
    <Tooltip>
      <TooltipTrigger asChild>{cell}</TooltipTrigger>
      <TooltipContent className="w-48 p-3" sideOffset={6}>
        <DayTooltip agg={agg} dnum={dnum} />
      </TooltipContent>
    </Tooltip>
  )
}

function DayTooltip({ agg, dnum }: { agg: DayAgg; dnum: number }) {
  const bySym = new Map<string, number>()
  for (const trade of agg.trades) {
    bySym.set(trade.coin, (bySym.get(trade.coin) ?? 0) + trade.pnl)
  }
  const top = [...bySym.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
  const winRate = winRateOf(agg)

  return (
    <div>
      <div className="text-[11px] text-muted-foreground">Day {dnum}</div>
      <div
        className="mt-0.5 font-mono text-base font-semibold tabular-nums"
        style={{ color: toneColor(agg.pnl) }}
      >
        {money(agg.pnl)}
      </div>
      <div className="mt-1 flex gap-3 text-[11px]">
        <span>
          <span className="text-muted-foreground">Trades </span>
          {agg.trades.length}
        </span>
        <span>
          <span className="text-muted-foreground">Win </span>
          {winRate}%
        </span>
      </div>
      {top.length > 0 && (
        <>
          <div className="my-1.5 h-px bg-border" />
          <div className="mb-1 text-[10px] text-muted-foreground">
            Top symbols
          </div>
          {top.map(([sym, pnl]) => (
            <div
              key={sym}
              className="flex justify-between font-mono text-[11px]"
            >
              <span>{sym}</span>
              <span style={{ color: toneColor(pnl) }}>{money(pnl)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function WeekCell({ total, days }: { total: number; days: number }) {
  return (
    <div
      className="flex min-h-[88px] flex-col items-center justify-center gap-0.5 rounded-[10px] border border-dashed p-1.5"
      style={{ background: weekTint(total, days) }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        Net
      </span>
      <span
        className="font-mono text-[13px] font-medium tabular-nums"
        style={{ color: days ? toneColor(total) : "var(--muted-foreground)" }}
      >
        {days ? money(total) : "—"}
      </span>
      <span className="text-[9.5px] text-muted-foreground">
        {days ? `${days}d` : ""}
      </span>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string
  value: string
  sub: string
  valueColor?: string
}) {
  return (
    <Card className="gap-0 px-[15px] py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-xl font-semibold tabular-nums"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10.5px] text-muted-foreground">{sub}</div>
    </Card>
  )
}

function EquityCurve({ vm }: { vm: MonthView }) {
  const up = vm.monthTotal >= 0
  const stroke = up ? UP : DOWN
  const fill = `rgba(${up ? UP_RGB : DOWN_RGB}, 0.1)`

  if (!vm.eqPath) {
    return (
      <div className="flex h-[72px] items-center justify-center text-[11px] text-muted-foreground">
        Not enough trading days yet.
      </div>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${vm.W} ${vm.H}`}
      className="block h-auto w-full"
      preserveAspectRatio="none"
    >
      <line
        x1="0"
        y1={vm.eqZeroY}
        x2={vm.W}
        y2={vm.eqZeroY}
        className="stroke-border"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <path d={vm.eqArea} fill={fill} />
      <path
        d={vm.eqPath}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function YearView({
  vm,
  year,
  onPrev,
  onNext,
  onPickMonth,
}: {
  vm: YearViewModel
  year: number
  onPrev: () => void
  onNext: () => void
  onPickMonth: (month: number) => void
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[17px] font-semibold">
          {year} · annual net{" "}
          <span
            className="font-mono tabular-nums"
            style={{ color: toneColor(vm.yearTotal) }}
          >
            {money(vm.yearTotal)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onPrev}
            aria-label="Previous year"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={onNext}
            aria-label="Next year"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-3 lg:grid-cols-4">
        {vm.months.map((m) => (
          <Card
            key={m.mo}
            className="cursor-pointer gap-0 px-[15px] py-3.5 transition-colors hover:bg-muted/40"
            onClick={() => onPickMonth(m.mo)}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[13.5px] font-semibold">{m.name}</span>
              <span
                className="font-mono text-[13px] font-medium tabular-nums"
                style={{
                  color: m.tradingDays ? toneColor(m.total) : "var(--muted-foreground)",
                }}
              >
                {m.tradingDays ? money(m.total) : "—"}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-[3px]">
              {m.cells.map((bg, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[3px]"
                  style={{ background: bg }}
                />
              ))}
            </div>
            <div className="mt-2 text-[10.5px] text-muted-foreground">
              {m.tradingDays
                ? `${m.tradingDays} days · ${Math.round(
                    (m.winDays / m.tradingDays) * 100
                  )}% win`
                : "no trades"}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function DayDetailDialog({
  open,
  onClose,
  selected,
  agg,
  accountValue,
}: {
  open: boolean
  onClose: () => void
  selected: { y: number; m: number; d: number } | null
  agg: DayAgg | null
  accountValue: number
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent variant="admin" className="sm:max-w-xl">
        {selected && agg && (
          <>
            <DialogHeader>
              <div className="text-xs font-medium text-muted-foreground">
                {new Date(selected.y, selected.m, selected.d).toLocaleDateString(
                  "en-US",
                  { weekday: "short", month: "long", day: "numeric", year: "numeric" }
                )}
              </div>
              <DialogTitle
                className="font-mono text-2xl font-semibold tracking-tight tabular-nums"
                style={{ color: toneColor(agg.pnl) }}
              >
                {money(agg.pnl, true)}
              </DialogTitle>
              <DialogDescription>
                {agg.trades.length} trades · {winRateOf(agg)}% win rate
                {accountValue > 0
                  ? ` · ${pctStr((agg.pnl / accountValue) * 100)} return`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">P&amp;L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...agg.trades]
                    .sort((a, b) => a.time - b.time)
                    .map((trade, index) => (
                      <TableRow key={`${trade.time}-${index}`}>
                        <TableCell className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                          {new Date(trade.time).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {trade.coin}
                        </TableCell>
                        <TableCell
                          className="text-[10.5px] font-semibold uppercase"
                          style={{ color: sideColor(trade) }}
                        >
                          {trade.dir}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {trade.sz.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}
                        </TableCell>
                        <TableCell
                          className="text-right font-mono font-medium tabular-nums"
                          style={{ color: toneColor(trade.pnl) }}
                        >
                          {money(trade.pnl, true)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
