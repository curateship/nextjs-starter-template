import { UsersIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarSelectTrigger } from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHeader, TableRow } from "@/components/ui/table"
import { formatNotional, shortAddress } from "@/components/scanner/format"
import { SortHead } from "@/components/scanner/sort-head"
import { usePolledData } from "@/components/scanner/use-polled-data"
import {
  loadCrowdSignals,
  type CrowdSignalItem,
  type CrowdSignalsFilters,
  type CrowdSignalsResponse,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

const POLL_MS = 15_000

const COLUMNS: {
  key: CrowdSignalsFilters["sortBy"]
  label: string
  main?: boolean
}[] = [
  { key: "signal", label: "Signal", main: true },
  { key: "score", label: "Score" },
  { key: "wallets", label: "Wallets" },
  { key: "notional", label: "Notional" },
  { key: "avgQuality", label: "Avg quality" },
  { key: "agreement", label: "Agreement" },
  { key: "time", label: "Time" },
]

export function CrowdedDashboard({
  initial,
  filters,
  onFiltersChange,
}: {
  initial: CrowdSignalsResponse
  filters: CrowdSignalsFilters
  onFiltersChange: (patch: Partial<CrowdSignalsFilters>) => void
}) {
  const [data] = usePolledData(initial, loadCrowdSignals, filters, POLL_MS)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Crowded Trades"
        icon={
          <UsersIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={data.total}
        controls={
          <Select
            value={filters.direction ?? "all"}
            onValueChange={(value) =>
              onFiltersChange({
                direction:
                  value === "all" ? undefined : (value as "long" | "short"),
              })
            }
          >
            <DashboardToolbarSelectTrigger>
              <SelectValue placeholder="Direction" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">Long + short</SelectItem>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
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
        emptyText="No crowded-trade signals yet. Signals appear when several whales pile into the same coin+direction within 30 minutes."
        emptyColSpan={7}
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
          <CrowdSignalRow key={item.id} item={item} />
        ))}
      </DashboardTable>
    </div>
  )
}

function CrowdSignalRow({ item }: { item: CrowdSignalItem }) {
  const score = Math.round(Number(item.score))
  return (
    <TableRow>
      <TableCell column="main">
        <div className="min-w-0">
          <div className="font-medium">
            {item.coin}{" "}
            <span
              className={cn(
                item.direction === "long" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {item.direction}
            </span>
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {item.topWallets
              .slice(0, 3)
              .map(
                (wallet) =>
                  `${shortAddress(wallet.taker)} ${formatNotional(wallet.notional)}`
              )
              .join(" · ")}
          </div>
        </div>
      </TableCell>
      <TableCell column="meta">
        <span
          className={cn(
            "inline-flex min-w-9 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
            score >= 70
              ? "bg-emerald-600/10 text-emerald-600"
              : "bg-muted text-foreground"
          )}
        >
          {score}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">{item.walletCount}</span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs font-medium tabular-nums">
          {formatNotional(item.notional)}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.avgQuality === null ? "—" : Math.round(Number(item.avgQuality))}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {item.directionShare === null
            ? "—"
            : `${Math.round(item.directionShare * 100)}%`}
        </span>
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {new Date(item.createdAt).toLocaleString("en-US", { hour12: false })}
        </span>
      </TableCell>
    </TableRow>
  )
}
