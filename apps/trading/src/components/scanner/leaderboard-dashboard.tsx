import { Link } from "@tanstack/react-router"
import { TrophyIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { formatNotional, shortAddress } from "@/components/scanner/format"
import { SignedUsd } from "@/components/scanner/signed-usd"
import { SortHead } from "@/components/scanner/sort-head"
import { usePolledData } from "@/components/scanner/use-polled-data"
import {
  loadLeaderboard,
  type LeaderboardFilters,
  type LeaderboardItem,
  type LeaderboardResponse,
} from "@/lib/api/scanner"

const POLL_MS = 30_000

const COLUMNS: {
  key: LeaderboardFilters["sortBy"]
  label: string
  main?: boolean
}[] = [
  { key: "wallet", label: "Wallet", main: true },
  { key: "quality", label: "Quality" },
  { key: "pnl30d", label: "30d PnL" },
  { key: "pnl7d", label: "7d PnL" },
  { key: "winRate", label: "Win rate" },
  { key: "accountValue", label: "Account" },
  { key: "fillCount", label: "Fills 30d" },
  { key: "topCoin", label: "Top coins" },
  { key: "open", label: "Open" },
  { key: "updated", label: "Updated" },
]

export function LeaderboardDashboard({
  initial,
  filters,
  onFiltersChange,
}: {
  initial: LeaderboardResponse
  filters: LeaderboardFilters
  onFiltersChange: (patch: Partial<LeaderboardFilters>) => void
}) {
  const [data] = usePolledData(initial, loadLeaderboard, filters, POLL_MS)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Smart Wallet Leaderboard"
        icon={
          <TrophyIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={data.total}
        controls={
          <DashboardToolbarButton
            type="button"
            variant={filters.trackedOnly ? "default" : "outline"}
            onClick={() =>
              onFiltersChange({
                trackedOnly: filters.trackedOnly ? undefined : true,
              })
            }
          >
            Tracked only
          </DashboardToolbarButton>
        }
        header={
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <SortHead
                  key={c.key}
                  column={c.main ? "main" : "meta"}
                  sortKey={c.key}
                  label={c.label}
                  activeKey={filters.sortBy}
                  dir={filters.dir}
                  onSort={onFiltersChange}
                />
              ))}
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.items.length === 0}
        emptyText="No wallet stats yet. The worker refreshes discovered wallets one at a time within the REST budget — stats fill in over the next minutes."
        emptyColSpan={10}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / data.pageSize)),
          onPageChange: (page) => onFiltersChange({ page }),
          onPageSizeChange: (pageSize) => onFiltersChange({ page: 1, pageSize }),
        }}
      >
        {data.items.map((item) => (
          <LeaderboardRow key={item.address} item={item} />
        ))}
      </DashboardTable>
    </div>
  )
}

function LeaderboardRow({ item }: { item: LeaderboardItem }) {
  return (
    <TableRow>
      <TableCell column="main">
        <div className="min-w-0">
          <Link
            to="/scanner/whales/$address"
            params={{ address: item.address }}
            className="font-medium hover:underline"
          >
            {item.label || shortAddress(item.address)}
          </Link>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {item.tracked ? <Badge>tracked</Badge> : null}
            {item.autoLabels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs font-medium tabular-nums">
          {item.qualityScore ?? "—"}
        </span>
      </TableCell>
      <TableCell column="meta">
        <SignedUsd
          value={item.pnl30d}
          className="font-mono text-xs font-medium tabular-nums"
        />
      </TableCell>
      <TableCell column="meta">
        <SignedUsd
          value={item.pnl7d}
          className="font-mono text-xs font-medium tabular-nums"
        />
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.winRate === null
            ? "—"
            : `${Math.round(Number(item.winRate) * 100)}%`}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.accountValue === null ? "—" : formatNotional(item.accountValue)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.fillCount30d ?? "—"}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="text-xs text-muted-foreground">
          {item.topCoins
            .slice(0, 3)
            .map((coin) => coin.coin)
            .join(", ") || "—"}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.openPositionCount}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span
          className="font-mono text-xs tabular-nums text-muted-foreground"
          title={new Date(item.statsUpdatedAt).toLocaleString("en-US", {
            hour12: false,
          })}
        >
          {relativeAge(item.statsUpdatedAt)}
        </span>
      </TableCell>
    </TableRow>
  )
}

function relativeAge(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 90) return "just now"
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}
