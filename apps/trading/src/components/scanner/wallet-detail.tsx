import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, PencilIcon, WavesIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EquityCurve } from "@/components/scanner/equity-curve"
import { formatNotional, shortAddress } from "@/components/scanner/format"
import { PositionEventRow } from "@/components/scanner/positions-dashboard"
import { SignedUsd } from "@/components/scanner/signed-usd"
import { WalletChip } from "@/components/scanner/wallet-chip"
import { WalletDialog } from "@/components/scanner/wallet-dialog"
import { formatPriceDisplay } from "@/components/trading/format"
import {
  loadWalletDetail,
  type ScannerWalletDetail,
  type ScannerWalletStatsItem,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

export function WalletDetailPage({
  initial,
}: {
  initial: ScannerWalletDetail
}) {
  const [data, setData] = React.useState(initial)
  const [prevInitial, setPrevInitial] = React.useState(initial)
  const [editing, setEditing] = React.useState(false)

  // Loader re-ran (navigated to another wallet): adopt it during render.
  if (prevInitial !== initial) {
    setPrevInitial(initial)
    setData(initial)
  }

  const wallet = data.wallet

  async function refetch() {
    setData(await loadWalletDetail(wallet.address))
  }

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)]">
      <div className="rounded-xl border border-foreground/5 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center sm:size-8">
              <WavesIcon className="text-muted-foreground" />
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium sm:text-base">
              <Link
                to="/scanner/whales"
                className="text-muted-foreground hover:text-foreground"
              >
                Whales
              </Link>
              <ChevronRightIcon className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {wallet.label || shortAddress(wallet.address)}
              </span>
            </span>
          </div>
          <DashboardToolbarButton
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
          >
            <PencilIcon className="size-4" />
            Label / track / ignore
          </DashboardToolbarButton>
        </div>
        {wallet.tracked || wallet.ignored || wallet.autoLabels.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {wallet.tracked ? <Badge>tracked</Badge> : null}
            {wallet.ignored ? <Badge variant="outline">ignored</Badge> : null}
            {wallet.autoLabels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          {wallet.address}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {wallet.firstSeenAt
            ? `First seen ${new Date(wallet.firstSeenAt).toLocaleString("en-US", { hour12: false })}`
            : "Not seen in the whale feed yet"}
          {wallet.lastSeenAt
            ? ` · last seen ${new Date(wallet.lastSeenAt).toLocaleString("en-US", { hour12: false })}`
            : ""}
        </p>
      </div>

      {data.stats ? <WalletStatsSection stats={data.stats} /> : null}

      {data.positionEvents.length > 0 ? (
        <DashboardTable
          title="Position History"
          count={data.positionEvents.length}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="main">Wallet</TableHead>
                <TableHead column="meta">Coin</TableHead>
                <TableHead column="meta">Event</TableHead>
                <TableHead column="meta">From</TableHead>
                <TableHead column="meta">To</TableHead>
                <TableHead column="meta">Time</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={false}
          emptyText=""
          emptyColSpan={6}
          footer={{ type: "summary", count: data.positionEvents.length }}
        >
          {data.positionEvents.map((event) => (
            <PositionEventRow key={event.id} item={event} />
          ))}
        </DashboardTable>
      ) : null}

      <DashboardTable
        title="Recent Whale Trades"
        count={data.recentTrades.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Coin</TableHead>
              <TableHead column="meta">Role</TableHead>
              <TableHead column="meta">Side</TableHead>
              <TableHead column="meta">Size</TableHead>
              <TableHead column="meta">Price</TableHead>
              <TableHead column="meta">Notional</TableHead>
              <TableHead column="meta">Counterparty</TableHead>
              <TableHead column="meta">Time</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.recentTrades.length === 0}
        emptyText="No trades above the scanner floor for this wallet in the retention window."
        emptyColSpan={8}
        footer={{ type: "summary", count: data.recentTrades.length }}
      >
        {data.recentTrades.map((item) => {
          const isBuyer = item.buyer === wallet.address
          const counterparty = isBuyer ? item.seller : item.buyer
          const counterpartyWallet = isBuyer
            ? item.sellerWallet
            : item.buyerWallet
          return (
            <TableRow key={item.id}>
              <TableCell column="main">
                <span className="font-medium">{item.coin}</span>
              </TableCell>
              <TableCell column="meta">
                <span
                  className={cn(
                    "font-medium",
                    isBuyer ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {isBuyer ? "bought" : "sold"}
                </span>
              </TableCell>
              <TableCell column="meta">
                <span className="text-xs text-muted-foreground">
                  {item.side === "buy" ? "taker buy" : "taker sell"}
                </span>
              </TableCell>
              <TableCell column="meta">
                <span className="font-mono text-xs tabular-nums">{item.sz}</span>
              </TableCell>
              <TableCell column="meta">
                <span className="font-mono text-xs tabular-nums">
                  {formatPriceDisplay(item.px)}
                </span>
              </TableCell>
              <TableCell column="meta">
                <span className="font-mono text-xs font-medium tabular-nums">
                  {formatNotional(item.notional)}
                </span>
              </TableCell>
              <TableCell column="meta">
                <WalletChip address={counterparty} wallet={counterpartyWallet} />
              </TableCell>
              <TableCell column="meta">
                <span className="font-mono text-xs tabular-nums">
                  {new Date(item.ts).toLocaleString("en-US", { hour12: false })}
                </span>
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <WalletDialog
        address={wallet.address}
        wallet={wallet}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => void refetch()}
      />
    </div>
  )
}

function WalletStatsSection({ stats }: { stats: ScannerWalletStatsItem }) {
  const tiles: { label: string; value: React.ReactNode }[] = [
    { label: "Account value", value: money(stats.accountValue) },
    { label: "30d PnL", value: <SignedUsd value={stats.pnl30d} /> },
    { label: "7d PnL", value: <SignedUsd value={stats.pnl7d} /> },
    {
      label: "Win rate",
      value:
        stats.winRate === null
          ? "—"
          : `${Math.round(Number(stats.winRate) * 100)}%`,
    },
    { label: "Fills (30d)", value: stats.fillCount30d ?? "—" },
    { label: "Avg trade", value: money(stats.avgTradeNotional) },
    { label: "Largest win", value: <SignedUsd value={stats.largestWin} /> },
    { label: "Largest loss", value: <SignedUsd value={stats.largestLoss} /> },
    {
      label: "Avg hold",
      value:
        stats.avgHoldMinutes === null
          ? "—"
          : formatHold(Number(stats.avgHoldMinutes)),
    },
    {
      label: "Top coins",
      value:
        stats.topCoins
          .slice(0, 3)
          .map((coin) => coin.coin)
          .join(", ") || "—",
    },
  ]

  return (
    <div className="space-y-[var(--shell-gutter,0.75rem)]">
      <div className="rounded-xl border border-foreground/5 bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-medium sm:text-base">Stats (30d)</h3>
          <span className="text-xs text-muted-foreground">
            updated{" "}
            {new Date(stats.statsUpdatedAt).toLocaleString("en-US", {
              hour12: false,
            })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {tiles.map((tile) => (
            <div key={tile.label}>
              <p className="text-xs text-muted-foreground">{tile.label}</p>
              <p className="font-mono text-sm font-medium tabular-nums">
                {tile.value}
              </p>
            </div>
          ))}
        </div>
        {stats.portfolioHistory.length > 1 ? (
          <div className="mt-4">
            <p className="mb-1 text-xs text-muted-foreground">
              Account value (30d)
            </p>
            <EquityCurve points={stats.portfolioHistory} />
          </div>
        ) : null}
      </div>

      {stats.openPositions.length > 0 ? (
        <DashboardTable
          title="Open Positions"
          count={stats.openPositions.length}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="main">Coin</TableHead>
                <TableHead column="meta">Direction</TableHead>
                <TableHead column="meta">Size</TableHead>
                <TableHead column="meta">Entry</TableHead>
                <TableHead column="meta">Value</TableHead>
                <TableHead column="meta">uPnL</TableHead>
                <TableHead column="meta">Lev</TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={false}
          emptyText=""
          emptyColSpan={7}
          footer={{ type: "summary", count: stats.openPositions.length }}
        >
          {stats.openPositions.map((position) => {
            const size = Number(position.szi)
            const upnl = Number(position.unrealizedPnl)
            return (
              <TableRow key={position.coin}>
                <TableCell column="main">
                  <span className="font-medium">{position.coin}</span>
                </TableCell>
                <TableCell column="meta">
                  <span
                    className={cn(
                      "font-medium",
                      size > 0 ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {size > 0 ? "long" : "short"}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <span className="font-mono text-xs tabular-nums">
                    {position.szi}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <span className="font-mono text-xs tabular-nums">
                    {position.entryPx ? formatPriceDisplay(position.entryPx) : "—"}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <span className="font-mono text-xs tabular-nums">
                    {formatNotional(position.positionValue)}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <span
                    className={cn(
                      "font-mono text-xs font-medium tabular-nums",
                      upnl > 0 && "text-emerald-600",
                      upnl < 0 && "text-red-500"
                    )}
                  >
                    {formatNotional(upnl)}
                  </span>
                </TableCell>
                <TableCell column="meta">
                  <span className="font-mono text-xs tabular-nums">
                    {position.leverage}x
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </DashboardTable>
      ) : null}
    </div>
  )
}

function money(value: string | null): string {
  return value === null ? "—" : formatNotional(value)
}

function formatHold(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  if (minutes < 24 * 60) return `${(minutes / 60).toFixed(1)}h`
  return `${(minutes / (24 * 60)).toFixed(1)}d`
}
