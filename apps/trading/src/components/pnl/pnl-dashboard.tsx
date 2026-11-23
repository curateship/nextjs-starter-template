import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
  TableSortButton,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PnlOverviewResponse } from "@/lib/api/pnl"
import { cn } from "@/lib/utils"
import {
  barsGeom,
  buildDayIndex,
  calGeom,
  compute,
  computeCosts,
  DOWN,
  DOWN_RGB,
  ddStr,
  donutGeom,
  dstr,
  eqGeom,
  mergeWallets,
  monthlyGeom,
  MUTED,
  RANGES,
  rangeStart,
  sparkGeom,
  streakOf,
  tone,
  UP,
  UP_RGB,
  yearGeom,
  type BarsGeom,
  type CalView,
  type CalView2,
  type EqGeom,
  type Metrics,
  type RangeKey,
  type SparkGeom,
  type Today,
} from "@/components/pnl/pnl-dashboard-model"
import {
  num,
  pct,
  profitFactor,
  signedCompactUsd,
  signedPct,
  signedUsd,
} from "@/lib/format"

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
// 7 equal day columns + a fixed week-summary column.
const CAL_GRID = "repeat(7, minmax(0, 1fr)) 48px"
// Stable identity palette for the wallet dots (mirrors the design intent).
const DOT_PALETTE = ["#089981", "#2563eb", "#7c3aed", "#e8833a", "#0ea5e9", "#db2777"]

type SortKey = "name" | "pnl" | "roi" | "win" | "pf" | "dd" | "trades"
type CostSortKey = "name" | "gross" | "fees" | "funding" | "net"

function metricVal(m: Metrics, key: SortKey) {
  switch (key) {
    case "pnl":
      return m.total
    case "roi":
      return m.roi
    case "win":
      return m.winRate
    case "pf":
      return m.pf === Infinity ? 1e9 : m.pf
    case "dd":
      return m.maxDD
    case "trades":
      return m.trades
    default:
      return 0
  }
}

export function PnlDashboard({ initial }: { initial: PnlOverviewResponse }) {
  const now = React.useMemo(() => Date.now(), [])
  const today = React.useMemo<Today>(() => {
    const d = new Date(now)
    return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }
  }, [now])

  const wallets = initial.wallets
  const allWallet = React.useMemo(() => mergeWallets(wallets), [wallets])
  const walletsWithAll = React.useMemo(
    () => [allWallet, ...wallets],
    [allWallet, wallets]
  )

  const [walletId, setWalletId] = React.useState("all")
  const [symbol, setSymbol] = React.useState("All")
  const [range, setRange] = React.useState<RangeKey>("90D")
  const [calYear, setCalYear] = React.useState(today.y)
  const [calMonth, setCalMonth] = React.useState(today.m)
  const [calView, setCalView] = React.useState<CalView>("days")
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc")
  const [costSortKey, setCostSortKey] = React.useState<CostSortKey | null>(null)
  const [costSortDir, setCostSortDir] = React.useState<"asc" | "desc">("desc")
  const [hoverEq, setHoverEq] = React.useState<number | null>(null)
  const [hoverBar, setHoverBar] = React.useState<number | null>(null)

  const selected = React.useMemo(
    () => walletsWithAll.find((w) => w.id === walletId) ?? allWallet,
    [walletsWithAll, walletId, allWallet]
  )
  const rangeLabel = range === "ALL" ? "All time" : range
  const symbolOptions = React.useMemo(
    () => ["All", ...selected.symbols],
    [selected]
  )

  const index = React.useMemo(
    () => buildDayIndex(selected, symbol),
    [selected, symbol]
  )
  const metrics = React.useMemo(
    () => compute(index, range, selected.accountValue, now),
    [index, range, selected, now]
  )

  const eq = React.useMemo(() => eqGeom(metrics.eqPts), [metrics])
  const bars = React.useMemo(() => barsGeom(metrics.eqPts), [metrics])
  const donut = React.useMemo(() => donutGeom(metrics), [metrics])
  const streak = React.useMemo(() => streakOf(index), [index])
  const cal = React.useMemo(
    () => calGeom(index, calYear, calMonth, today),
    [index, calYear, calMonth, today]
  )
  const monthly = React.useMemo(
    () => monthlyGeom(index, calYear, today),
    [index, calYear, today]
  )
  const year = React.useMemo(() => yearGeom(index, calYear), [index, calYear])

  // Per-wallet scores for the table. Only recomputed when the underlying data
  // or range changes — re-sorting below reuses these instead of rebuilding.
  const walletStats = React.useMemo(
    () =>
      walletsWithAll.map((w, i) => {
        const idx = buildDayIndex(w, "All")
        const m = compute(idx, range, w.accountValue, now)
        const dot =
          w.id === "all"
            ? "var(--foreground)"
            : DOT_PALETTE[(i - 1) % DOT_PALETTE.length]
        return { wallet: w, m, spark: sparkGeom(m.eqPts), dot }
      }),
    [walletsWithAll, range, now]
  )

  // Per-wallet cost breakdowns. Unlike the performance table these honor the
  // symbol filter, so the figures tie back to the headline tiles.
  const costStats = React.useMemo(
    () =>
      walletsWithAll.map((w, i) => ({
        wallet: w,
        costs: computeCosts(w, symbol, range, now),
        dot:
          w.id === "all"
            ? "var(--foreground)"
            : DOT_PALETTE[(i - 1) % DOT_PALETTE.length],
      })),
    [walletsWithAll, symbol, range, now]
  )

  const costRows = React.useMemo(() => {
    if (!costSortKey) return costStats
    const dir = costSortDir === "asc" ? 1 : -1
    const pinned = costStats.filter((r) => r.wallet.id === "all")
    const rest = costStats.filter((r) => r.wallet.id !== "all")
    rest.sort((a, b) =>
      costSortKey === "name"
        ? dir * a.wallet.label.localeCompare(b.wallet.label)
        : dir * (a.costs[costSortKey] - b.costs[costSortKey])
    )
    return [...pinned, ...rest]
  }, [costStats, costSortKey, costSortDir])

  // Honest-labeling notes for the cost card: wallets whose funding refresh
  // failed, wallets with no funding stored at all, and how far back the
  // recorded funding actually reaches.
  const fundingNotes = React.useMemo(() => {
    const stale = wallets
      .filter((w) => w.fundingStale && w.funding.length > 0)
      .map((w) => w.label)
    const unknown = wallets
      .filter((w) => w.fundingStale && w.funding.length === 0)
      .map((w) => w.label)
    const since = allWallet.fundingSince
    const start = rangeStart(range, now)
    const partialSince =
      since !== null && start < since && allWallet.trades.length > 0
        ? since
        : null
    return { stale, unknown, partialSince }
  }, [wallets, allWallet, range, now])

  const rows = React.useMemo(() => {
    if (!sortKey) return walletStats
    const dir = sortDir === "asc" ? 1 : -1
    // "All wallets" always pins to the top, regardless of sort.
    const pinned = walletStats.filter((r) => r.wallet.id === "all")
    const rest = walletStats.filter((r) => r.wallet.id !== "all")
    rest.sort((a, b) =>
      sortKey === "name"
        ? dir * a.wallet.label.localeCompare(b.wallet.label)
        : dir * (metricVal(a.m, sortKey) - metricVal(b.m, sortKey))
    )
    return [...pinned, ...rest]
  }, [walletStats, sortKey, sortDir])

  function selectWallet(id: string) {
    const next = walletsWithAll.find((w) => w.id === id)
    setWalletId(id)
    if (symbol !== "All" && !next?.symbols.includes(symbol)) setSymbol("All")
  }
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "name" ? "asc" : "desc")
    }
  }
  function toggleCostSort(key: CostSortKey) {
    if (costSortKey === key) {
      setCostSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setCostSortKey(key)
      setCostSortDir(key === "name" ? "asc" : "desc")
    }
  }
  function calNav(delta: number) {
    if (calView === "days") {
      const d = new Date(calYear, calMonth + delta, 1)
      setCalYear(d.getFullYear())
      setCalMonth(d.getMonth())
    } else {
      setCalYear((y) => y + delta)
    }
  }
  function goToday() {
    setCalYear(today.y)
    setCalMonth(today.m)
    setCalView("days")
  }
  function pickMonth(mo: number) {
    setCalMonth(mo)
    setCalView("days")
  }

  if (wallets.length === 0) {
    return (
      <div className="flex w-full flex-col gap-[var(--shell-gutter,0.75rem)]">
        <PageHeader />
        <Card className="items-center justify-center py-16 text-sm text-muted-foreground">
          No trading wallets yet. Add a wallet to see your performance here.
        </Card>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-[var(--shell-gutter,0.75rem)]">
      {/* Top card: heading, filters, and headline stats all on one surface */}
      <Card className="gap-0 p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <PageHeader />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Wallet">
              <Select value={walletId} onValueChange={selectWallet}>
                <SelectTrigger className="h-8 min-w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {walletsWithAll.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Symbol">
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger className="h-8 min-w-[92px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {symbolOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Range">
              <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                <TabsList className="[&>button]:text-xs">
                  {RANGES.map((r) => (
                    <TabsTrigger key={r} value={r}>
                      {r === "ALL" ? "All" : r}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </Field>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <KpiTile
            label={`Net P&L · ${rangeLabel}`}
            value={signedUsd(metrics.total, 0)}
            tone={metrics.total}
            sub={`${metrics.tradingDays} days · ${num(metrics.trades, 0)} trades`}
          />
          <KpiTile
            label="Return"
            value={signedPct(metrics.roi, 1)}
            tone={metrics.roi}
            sub={metrics.acct > 0 ? `on $${num(metrics.acct, 0)}` : "equity unknown"}
          />
          <KpiTile
            label="Win rate"
            value={pct(metrics.winRate, 0)}
            sub={`${metrics.greenDays}/${metrics.tradingDays} green days`}
          />
          <KpiTile label="Profit factor" value={profitFactor(metrics.pf)} sub="gross W / gross L" />
          <KpiTile
            label="Max drawdown"
            value={ddStr(metrics.maxDD)}
            tone={-metrics.maxDD}
            sub="peak to trough"
          />
        </div>
      </Card>

      {/* Charts */}
      <div className="grid gap-[var(--shell-gutter,0.75rem)] lg:grid-cols-[1fr_384px]">
        <Card className="gap-0 p-4 sm:p-[18px]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold">Cumulative equity</div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {selected.label} · {rangeLabel}
              </div>
            </div>
            <div className="text-right">
              <div
                className="font-mono text-sm font-semibold tabular-nums"
                style={{ color: tone(metrics.total) }}
              >
                {signedUsd(metrics.total, 0)}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                peak {eq.mxStr}
              </div>
            </div>
          </div>
          <EquityChart eq={eq} hover={hoverEq} setHover={setHoverEq} />
        </Card>

        <div className="flex flex-col gap-[var(--shell-gutter,0.75rem)]">
          <Card className="gap-0 p-4 sm:p-[18px]">
            <div className="text-[13px] font-semibold">Daily net P&L</div>
            <DailyBars bars={bars} hover={hoverBar} setHover={setHoverBar} />
          </Card>
          <Card className="gap-0 p-4 sm:p-[18px]">
            <div className="text-[13px] font-semibold">Win / loss</div>
            <WinLoss donut={donut} streak={streak} />
          </Card>
        </div>
      </div>

      {/* Wallet performance table */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="px-6 pt-4 pb-2 text-[13px] font-semibold">
          Wallet performance
        </div>
        <Table className="[&_tbody_tr:first-child_td]:pt-2">
          <TableHeader>
            <TableRow>
              <TableHead column="main" className="min-w-[150px]">
                <SortHead
                  label="Wallet"
                  k="name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
              </TableHead>
              {(
                [
                  ["pnl", "Net P&L"],
                  ["roi", "ROI"],
                  ["win", "Win"],
                  ["pf", "PF"],
                  ["dd", "Max DD"],
                  ["trades", "Trades"],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <TableHead key={k} className="text-right">
                  <SortHead
                    label={label}
                    k={k}
                    align="right"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={toggleSort}
                  />
                </TableHead>
              ))}
              <TableHead className="text-right text-xs font-medium text-muted-foreground">
                Equity
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const selected = r.wallet.id === walletId
              return (
              <TableRow
                key={r.wallet.id}
                onClick={() => selectWallet(r.wallet.id)}
                data-state={selected ? "selected" : undefined}
              >
                <TableCell
                  column="main"
                  style={
                    selected ? { boxShadow: `inset 3px 0 0 ${r.dot}` } : undefined
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: r.dot }}
                    />
                    <span className="font-medium">{r.wallet.label}</span>
                    {r.wallet.id !== "all" && (
                      <Badge
                        variant={
                          r.wallet.network === "mainnet" ? "default" : "secondary"
                        }
                        className="h-4 px-1.5 text-[9px] uppercase"
                      >
                        {r.wallet.network}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <NumCell
                  value={signedUsd(r.m.total)}
                  color={tone(r.m.total)}
                  strong
                />
                <NumCell value={signedPct(r.m.roi, 1)} color={tone(r.m.roi)} />
                <NumCell value={pct(r.m.winRate, 0)} />
                <NumCell value={profitFactor(r.m.pf)} />
                <NumCell value={ddStr(r.m.maxDD)} />
                <NumCell value={num(r.m.trades, 0)} />
                <TableCell className="text-right">
                  <MiniSpark spark={r.spark} up={r.m.total >= 0} />
                </TableCell>
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {/* True cost breakdown */}
      <Card className="gap-0 overflow-hidden p-0">
        <div className="px-6 pt-4 pb-2">
          <div className="text-[13px] font-semibold">True cost of trading</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            What the trades made before costs, what fees and funding took ·{" "}
            {rangeLabel}
            {symbol !== "All" ? ` · ${symbol}` : ""}
          </div>
        </div>
        <Table className="[&_tbody_tr:first-child_td]:pt-2">
          <TableHeader>
            <TableRow>
              <TableHead column="main" className="min-w-[150px]">
                <SortHead
                  label="Wallet"
                  k="name"
                  sortKey={costSortKey}
                  sortDir={costSortDir}
                  onSort={toggleCostSort}
                />
              </TableHead>
              {(
                [
                  ["gross", "Gross result"],
                  ["fees", "Fees"],
                  ["funding", "Funding"],
                  ["net", "Net after costs"],
                ] as [CostSortKey, string][]
              ).map(([k, label]) => (
                <TableHead key={k} className="text-right">
                  <SortHead
                    label={label}
                    k={k}
                    align="right"
                    sortKey={costSortKey}
                    sortDir={costSortDir}
                    onSort={toggleCostSort}
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {costRows.map((r) => {
              const isSelected = r.wallet.id === walletId
              const { costs } = r
              return (
                <TableRow
                  key={r.wallet.id}
                  onClick={() => selectWallet(r.wallet.id)}
                  data-state={isSelected ? "selected" : undefined}
                >
                  <TableCell
                    column="main"
                    style={
                      isSelected
                        ? { boxShadow: `inset 3px 0 0 ${r.dot}` }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: r.dot }}
                      />
                      <span className="font-medium">{r.wallet.label}</span>
                      {r.wallet.id !== "all" && (
                        <Badge
                          variant={
                            r.wallet.network === "mainnet"
                              ? "default"
                              : "secondary"
                          }
                          className="h-4 px-1.5 text-[9px] uppercase"
                        >
                          {r.wallet.network}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <NumCell
                    value={signedUsd(costs.gross)}
                    color={tone(costs.gross)}
                  />
                  {/* Fees are a cost, so they read as the money they took. */}
                  <NumCell
                    value={signedUsd(-costs.fees)}
                    color={tone(-costs.fees)}
                  />
                  {costs.fundingUnknown ? (
                    <NumCell value="unavailable" />
                  ) : (
                    <NumCell
                      value={signedUsd(costs.funding)}
                      color={tone(costs.funding)}
                    />
                  )}
                  {costs.fundingUnknown ? (
                    <NumCell value="—" />
                  ) : (
                    <NumCell
                      value={signedUsd(costs.net)}
                      color={tone(costs.net)}
                      strong
                    />
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-1 px-6 pt-2 pb-4 text-[11px] text-muted-foreground">
          <p>
            Net after costs = gross − fees + funding. Fees count every fill,
            entry and exit, and every figure on this page uses the same
            arithmetic — the tiles just round to whole dollars.
          </p>
          {fundingNotes.partialSince !== null && (
            <p>
              Funding is recorded since {dstr(fundingNotes.partialSince)} — the
              exchange doesn&apos;t serve older payments, so earlier trades
              show fees but no funding.
            </p>
          )}
          {fundingNotes.stale.length > 0 && (
            <p role="alert" className="text-destructive">
              Couldn&apos;t refresh funding for {fundingNotes.stale.join(", ")}
              — recent payments may be missing. Reload the page to retry.
            </p>
          )}
          {fundingNotes.unknown.length > 0 && (
            <p role="alert" className="text-destructive">
              Funding for {fundingNotes.unknown.join(", ")} couldn&apos;t be
              fetched and none is stored yet, so its net after costs
              can&apos;t be shown. Reload the page to retry.
            </p>
          )}
        </div>
      </Card>

      {/* Calendar */}
      <div className="grid gap-[var(--shell-gutter,0.75rem)] lg:grid-cols-[1fr_296px]">
        <Card className="gap-0 p-4 sm:p-[18px]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-semibold">P&L calendar</span>
              <Tabs
                value={calView}
                onValueChange={(v) => setCalView(v as CalView)}
              >
                <TabsList className="[&>button]:text-xs">
                  <TabsTrigger value="days">Days</TabsTrigger>
                  <TabsTrigger value="months">Months</TabsTrigger>
                  <TabsTrigger value="year">Year</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-[11px] text-muted-foreground">
                {calView === "days" ? cal.label : calYear}
              </span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => calNav(-1)}
                aria-label="Previous"
              >
                <ChevronLeftIcon />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => calNav(1)}
                aria-label="Next"
              >
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
          {calView === "days" && <CalDays cal={cal} />}
          {calView === "months" && (
            <CalMonths monthly={monthly} onPick={pickMonth} />
          )}
          {calView === "year" && <CalYear year={year} onPick={pickMonth} />}
        </Card>

        <div className="flex flex-col gap-[var(--shell-gutter,0.75rem)]">
          <StatTile
            label="Best day"
            value={metrics.best.t ? signedUsd(metrics.best.pnl, 0) : "—"}
            tone={metrics.best.t ? 1 : 0}
            sub={metrics.best.t ? dstr(metrics.best.t) : "—"}
          />
          <StatTile
            label="Worst day"
            value={metrics.worst.t ? signedUsd(metrics.worst.pnl, 0) : "—"}
            tone={metrics.worst.t ? -1 : 0}
            sub={metrics.worst.t ? dstr(metrics.worst.t) : "—"}
          />
          <StatTile
            label="Avg / trading day"
            value={metrics.tradingDays ? signedUsd(metrics.avgDay, 0) : "—"}
            tone={metrics.avgDay}
            sub={`across ${rangeLabel}`}
          />
        </div>
      </div>
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Presentational pieces
// ————————————————————————————————————————————————————————————————

function PageHeader() {
  return (
    <div>
      <h1 className="text-[19px] leading-tight font-bold tracking-tight">
        Performance
      </h1>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        Realized profit &amp; loss after all fees and funding, across your
        trading wallets
      </p>
    </div>
  )
}

type StatProps = { label: string; value: string; sub: string; tone?: number }

/** Shared label / value / sub-line for the headline tiles and the day cards. */
function StatBody({ label, value, sub, tone: t }: StatProps) {
  const color = t === undefined ? undefined : t > 0 ? UP : t < 0 ? DOWN : MUTED
  return (
    <>
      <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="mt-1.5 font-mono text-[22px] leading-none font-bold tracking-tight tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </>
  )
}

/** Inset headline stat, sitting on the top card's surface (not its own card). */
function KpiTile(props: StatProps) {
  return (
    <div className="rounded-[10px] bg-muted/50 p-3">
      <StatBody {...props} />
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

/** Standalone headline stat card (Best / Worst / Avg column). */
function StatTile(props: StatProps) {
  return (
    <Card size="sm" className="gap-0 p-3.5">
      <StatBody {...props} />
    </Card>
  )
}

function SortHead<K extends string>({
  label,
  k,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string
  k: K
  align?: "right"
  sortKey: K | null
  sortDir: "asc" | "desc"
  onSort: (key: K) => void
}) {
  const active = sortKey === k
  const button = (
    <TableSortButton
      active={active}
      direction={active ? sortDir : "desc"}
      onClick={() => onSort(k)}
    >
      {label}
    </TableSortButton>
  )
  return align === "right" ? (
    <div className="flex justify-end">{button}</div>
  ) : (
    button
  )
}

function NumCell({
  value,
  color,
  strong,
}: {
  value: string
  color?: string
  strong?: boolean
}) {
  return (
    <TableCell
      className={cn(
        "text-right font-mono tabular-nums",
        color ? undefined : "text-muted-foreground",
        strong && "font-semibold"
      )}
      style={color ? { color } : undefined}
    >
      {value}
    </TableCell>
  )
}

function EmptyChart({ height, label }: { height: number; label: string }) {
  return (
    <div
      className="mt-3 flex items-center justify-center text-[11px] text-muted-foreground"
      style={{ height: `${height}px` }}
    >
      {label}
    </div>
  )
}

function clampPct(v: number) {
  return Math.max(6, Math.min(94, v))
}

function ChartTip({
  xPct,
  topPx,
  children,
}: {
  xPct: number
  topPx: number
  children: React.ReactNode
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2 py-1.5 text-[11px] leading-snug text-popover-foreground shadow-md"
      style={{ left: `${clampPct(xPct)}%`, top: topPx - 8 }}
    >
      {children}
    </div>
  )
}

function EquityChart({
  eq,
  hover,
  setHover,
}: {
  eq: EqGeom
  hover: number | null
  setHover: (i: number | null) => void
}) {
  if (eq.empty) {
    return <EmptyChart height={236} label="Not enough trading days yet." />
  }
  const dot = hover != null ? eq.pts[hover] : null
  return (
    <div className="mt-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${eq.W} ${eq.H}`}
          preserveAspectRatio="none"
          className="block h-[236px] w-full"
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1="0"
            y1={eq.zeroY}
            x2={eq.W}
            y2={eq.zeroY}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <defs>
            <clipPath id="pnl-eq-up">
              <rect x="0" y="0" width={eq.W} height={eq.zeroY} />
            </clipPath>
            <clipPath id="pnl-eq-dn">
              <rect x="0" y={eq.zeroY} width={eq.W} height={eq.belowH} />
            </clipPath>
          </defs>
          <path d={eq.area} fill={`rgba(${UP_RGB}, 0.13)`} clipPath="url(#pnl-eq-up)" />
          <path d={eq.area} fill={`rgba(${DOWN_RGB}, 0.13)`} clipPath="url(#pnl-eq-dn)" />
          <path
            d={eq.path}
            fill="none"
            stroke={UP}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath="url(#pnl-eq-up)"
          />
          <path
            d={eq.path}
            fill="none"
            stroke={DOWN}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath="url(#pnl-eq-dn)"
          />
          {eq.pts.map((p) => (
            <rect
              key={p.i}
              x={p.rectX}
              y="0"
              width={p.rectW}
              height={eq.H}
              fill="transparent"
              onMouseEnter={() => setHover(p.i)}
            />
          ))}
          {dot && (
            <circle
              cx={dot.x}
              cy={dot.y}
              r={4.5}
              fill={tone(dot.pnl)}
              stroke="var(--card)"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {dot && (
          <ChartTip xPct={(dot.x / eq.W) * 100} topPx={(dot.y / eq.H) * 236}>
            <div className="mb-0.5 text-[10px] text-muted-foreground">
              {dstr(dot.t)}
            </div>
            <div>
              Equity{" "}
              <span className="font-semibold">{signedUsd(dot.cum, 0)}</span>
            </div>
            <div style={{ color: tone(dot.pnl) }}>Day {signedUsd(dot.pnl, 0)}</div>
          </ChartTip>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{eq.startLabel}</span>
        <span>{eq.endLabel}</span>
      </div>
    </div>
  )
}

function DailyBars({
  bars,
  hover,
  setHover,
}: {
  bars: BarsGeom
  hover: number | null
  setHover: (i: number | null) => void
}) {
  if (bars.empty) return <EmptyChart height={118} label="No trades in range." />
  const b = hover != null ? bars.bars[hover] : null
  return (
    <div className="relative mt-3">
      <svg
        viewBox={`0 0 ${bars.W} ${bars.H}`}
        preserveAspectRatio="none"
        className="block h-[118px] w-full"
        onMouseLeave={() => setHover(null)}
      >
        <line
          x1="0"
          y1={bars.zeroY}
          x2={bars.W}
          y2={bars.zeroY}
          className="stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {bars.bars.map((bar) => (
          <rect
            key={bar.i}
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            rx={0.6}
            fill={bar.pos ? UP : DOWN}
          />
        ))}
        {bars.bars.map((bar) => (
          <rect
            key={`h${bar.i}`}
            x={bar.hx}
            y="0"
            width={bar.hw}
            height={bars.H}
            fill="transparent"
            onMouseEnter={() => setHover(bar.i)}
          />
        ))}
      </svg>
      {b && (
        <ChartTip
          xPct={((b.x + b.w / 2) / bars.W) * 100}
          topPx={((b.pos ? b.y : bars.zeroY) / bars.H) * 118}
        >
          <div className="mb-0.5 text-[10px] text-muted-foreground">
            {dstr(b.t)}
          </div>
          <div style={{ color: tone(b.pnl) }}>{signedUsd(b.pnl, 0)}</div>
        </ChartTip>
      )}
    </div>
  )
}

function WinLoss({
  donut,
  streak,
}: {
  donut: ReturnType<typeof donutGeom>
  streak: ReturnType<typeof streakOf>
}) {
  return (
    <div className="mt-3 flex items-center gap-4">
      <div className="relative size-[100px] shrink-0">
        <svg viewBox="0 0 128 128" className="size-[100px]">
          <circle
            cx="64"
            cy="64"
            r={donut.r}
            fill="none"
            className="stroke-muted"
            strokeWidth={15}
          />
          <circle
            cx="64"
            cy="64"
            r={donut.r}
            fill="none"
            stroke={UP}
            strokeWidth={15}
            strokeLinecap="round"
            strokeDasharray={donut.dash}
            transform="rotate(-90 64 64)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold">
            {donut.winRateStr}
          </span>
          <span className="text-[9px] tracking-wide text-muted-foreground uppercase">
            win days
          </span>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <LegendRow color={UP} label="Green days" value={donut.greenDays} />
        <LegendRow color={DOWN} label="Red days" value={donut.redDays} />
        <div className="mt-1 flex items-center gap-2 border-t pt-2">
          {streak.up != null && (
            <span
              className="size-2 rounded-full"
              style={{ background: streak.up ? UP : DOWN }}
            />
          )}
          <span className="text-xs font-semibold">{streak.title}</span>
        </div>
      </div>
    </div>
  )
}

function LegendRow({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: number
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-[3px]"
        style={{ background: color }}
      />
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums">
        {value}
      </span>
    </div>
  )
}

function MiniSpark({ spark, up }: { spark: SparkGeom; up: boolean }) {
  if (spark.empty) return <span className="text-muted-foreground">—</span>
  const stroke = up ? UP : DOWN
  const fill = `rgba(${up ? UP_RGB : DOWN_RGB}, 0.12)`
  return (
    <svg
      viewBox="0 0 120 34"
      preserveAspectRatio="none"
      className="inline-block h-7 w-[92px] align-middle"
    >
      <path d={spark.area} fill={fill} />
      <path
        d={spark.path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CalDays({ cal }: { cal: CalView2 }) {
  return (
    <div>
      <div className="mb-1.5 grid gap-1" style={{ gridTemplateColumns: CAL_GRID }}>
        {DOW.map((n) => (
          <HeadCell key={n}>{n}</HeadCell>
        ))}
        <HeadCell>Wk</HeadCell>
      </div>
      <div className="flex flex-col gap-1">
        {cal.weeks.map((wk, wi) => (
          <div
            key={wi}
            className="grid gap-1"
            style={{ gridTemplateColumns: CAL_GRID }}
          >
            {wk.cells.map((c, ci) => (
              <DayCell key={ci} cell={c} />
            ))}
            <div
              className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-md border border-dashed"
              style={{ background: wk.netBg }}
            >
              <span className="text-[8px] font-semibold text-muted-foreground uppercase">
                Net
              </span>
              <span
                className="font-mono text-[10px] font-semibold tabular-nums"
                style={{ color: wk.netDays ? tone(wk.net) : MUTED }}
              >
                {wk.netDays ? signedCompactUsd(wk.net) : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HeadCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="py-0.5 text-center text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function DayCell({ cell }: { cell: CalView2["weeks"][number]["cells"][number] }) {
  if (!cell.inMonth) return <div className="min-h-[44px] rounded-md" aria-hidden />
  return (
    <div
      className={cn(
        "flex min-h-[44px] flex-col justify-between rounded-md border p-1",
        cell.isToday ? "border-foreground" : "border-border"
      )}
      style={{ background: cell.bg }}
    >
      <span
        className="text-[10px] font-semibold"
        style={{
          color: cell.isToday ? "var(--foreground)" : "var(--muted-foreground)",
        }}
      >
        {cell.dnum}
      </span>
      {cell.has && (
        <span
          className="font-mono text-[10px] font-semibold tabular-nums"
          style={{ color: cell.tone }}
        >
          {signedCompactUsd(cell.pnl)}
        </span>
      )}
    </div>
  )
}

function CalMonths({
  monthly,
  onPick,
}: {
  monthly: ReturnType<typeof monthlyGeom>
  onPick: (mo: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      {monthly.months.map((m) => (
        <button
          key={m.mo}
          type="button"
          onClick={() => onPick(m.mo)}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
            m.current && "bg-muted/40"
          )}
        >
          <span
            className="w-8 shrink-0 text-[12px] font-semibold"
            style={{
              color: m.current ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            {m.name}
          </span>
          <span className="relative flex h-2 flex-1 items-center">
            <span
              className="absolute left-0 h-2 rounded-full"
              style={{ width: m.barPct, background: m.barColor }}
            />
          </span>
          <span
            className="w-16 text-right font-mono text-[12px] font-semibold tabular-nums"
            style={{ color: m.tone }}
          >
            {m.has ? signedCompactUsd(m.total) : "—"}
          </span>
        </button>
      ))}
    </div>
  )
}

function CalYear({
  year,
  onPick,
}: {
  year: ReturnType<typeof yearGeom>
  onPick: (mo: number) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 xl:grid-cols-4">
      {year.months.map((m) => (
        <button
          key={m.mo}
          type="button"
          onClick={() => onPick(m.mo)}
          className="rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/40"
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold">{m.name}</span>
            <span
              className="font-mono text-[11.5px] font-semibold tabular-nums"
              style={{ color: m.tone }}
            >
              {m.has ? signedCompactUsd(m.total) : "—"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-[2px]">
            {m.cells.map((bg, i) => (
              <div
                key={i}
                className="aspect-square rounded-[2px]"
                style={{ background: bg }}
              />
            ))}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">{m.sub}</div>
        </button>
      ))}
    </div>
  )
}
