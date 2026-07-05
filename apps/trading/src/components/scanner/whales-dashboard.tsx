import { useNavigate } from "@tanstack/react-router"
import { WavesIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { formatNotional, shortAddress } from "@/components/scanner/format"
import { SignedUsd } from "@/components/scanner/signed-usd"
import { SortHead } from "@/components/scanner/sort-head"
import { usePolledData } from "@/components/scanner/use-polled-data"
import {
  loadWhaleWallets,
  type LeaderboardItem,
  type LeaderboardResponse,
  type WhaleWalletsFilters,
} from "@/lib/api/scanner"

const POLL_MS = 30_000

const COLUMNS: {
  key: WhaleWalletsFilters["sortBy"]
  label: string
  main?: boolean
}[] = [
  { key: "wallet", label: "Whale", main: true },
  { key: "accountValue", label: "Size" },
  { key: "pnl30d", label: "30d PnL" },
  { key: "winRate", label: "Win rate" },
  { key: "quality", label: "Quality" },
  { key: "open", label: "Open" },
]

export function WhalesDashboard({
  initial,
  filters,
  onFiltersChange,
}: {
  initial: LeaderboardResponse
  filters: WhaleWalletsFilters
  onFiltersChange: (patch: Partial<WhaleWalletsFilters>) => void
}) {
  const navigate = useNavigate()
  const [data] = usePolledData(initial, loadWhaleWallets, filters, POLL_MS)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Whales"
        icon={
          <WavesIcon className="size-4 text-muted-foreground sm:size-[18px]" />
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
        emptyText="No whale wallets yet. The worker refreshes discovered wallets one at a time within the REST budget — the biggest wallets fill in over the next minutes."
        emptyColSpan={6}
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
          <WhaleRow
            key={item.address}
            item={item}
            onOpen={() =>
              void navigate({
                to: "/scanner/whales/$address",
                params: { address: item.address },
              })
            }
          />
        ))}
      </DashboardTable>
    </div>
  )
}

function WhaleRow({
  item,
  onOpen,
}: {
  item: LeaderboardItem
  onOpen: () => void
}) {
  return (
    <TableRow
      role="button"
      tabIndex={0}
      className="cursor-pointer"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <TableCell column="main">
        <div className="min-w-0">
          <span className="font-medium">
            {item.label || shortAddress(item.address)}
          </span>
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
          {item.accountValue === null ? "—" : formatNotional(item.accountValue)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <SignedUsd
          value={item.pnl30d}
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
          {item.qualityScore ?? "—"}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.openPositionCount}
        </span>
      </TableCell>
    </TableRow>
  )
}
