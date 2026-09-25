import { ArrowRightLeftIcon } from "lucide-react"

import { DashboardTable, pagedFooter } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import { compactUsd } from "@/lib/format"
import { SortHeaderRow } from "@/components/scanner/sort-head"
import { usePolledData } from "@/components/scanner/use-polled-data"
import { WalletChip } from "@/components/scanner/wallet-chip"
import {
  loadPositionEvents,
  POSITION_EVENT_TYPES,
  type PositionEventItem,
  type PositionEventsFilters,
  type PositionEventsResponse,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

const POLL_MS = 10_000

const COLUMNS: {
  key: PositionEventsFilters["sortBy"]
  label: string
  main?: boolean
}[] = [
  { key: "wallet", label: "Wallet", main: true },
  { key: "coin", label: "Coin" },
  { key: "event", label: "Event" },
  { key: "from", label: "From" },
  { key: "to", label: "To" },
  { key: "time", label: "Time" },
]

const EVENT_STYLES: Record<string, { label: string; className?: string }> = {
  opened: { label: "opened", className: "text-emerald-600" },
  closed: { label: "closed" },
  increased: { label: "increased", className: "text-emerald-600" },
  reduced: { label: "reduced", className: "text-red-500" },
  flipped: { label: "flipped", className: "text-amber-600" },
  reopened: { label: "back after 30d", className: "text-emerald-600" },
}

export function PositionsDashboard({
  initial,
  filters,
  onFiltersChange,
}: {
  initial: PositionEventsResponse
  filters: PositionEventsFilters
  onFiltersChange: (patch: Partial<PositionEventsFilters>) => void
}) {
  const [data] = usePolledData(initial, loadPositionEvents, filters, POLL_MS)

  return (
    <div className="w-full">
      <DashboardTable
        title="Position Changes"
        icon={
          <ArrowRightLeftIcon className="text-muted-foreground" />
        }
        count={data.total}
        controls={
          <>
            <Select
              value={filters.eventType ?? "all"}
              onValueChange={(value) =>
                onFiltersChange({
                  eventType:
                    value === "all"
                      ? undefined
                      : (value as PositionEventsFilters["eventType"]),
                })
              }
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue placeholder="Event" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {POSITION_EVENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {EVENT_STYLES[type]?.label ?? type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          </>
        }
        header={
          <SortHeaderRow
            columns={COLUMNS}
            activeKey={filters.sortBy}
            dir={filters.dir}
            onSort={onFiltersChange}
          />
        }
        isEmpty={data.items.length === 0}
        emptyText="No position changes recorded yet. The tracker polls wallets after whale-feed activity, so events accumulate as whales trade."
        emptyColSpan={6}
        footer={pagedFooter(data, onFiltersChange)}
      >
        {data.items.map((item) => (
          <PositionEventRow key={item.id} item={item} />
        ))}
      </DashboardTable>
    </div>
  )
}

export function PositionEventRow({ item }: { item: PositionEventItem }) {
  const style = EVENT_STYLES[item.eventType] ?? { label: item.eventType }
  return (
    <TableRow>
      <TableCell column="main">
        <WalletChip address={item.address} wallet={item.wallet} />
      </TableCell>
      <TableCell column="meta">
        <span className="font-medium">{item.coin}</span>
      </TableCell>
      <TableCell column="meta">
        <Badge variant="secondary" className={cn(style.className)}>
          {style.label}
        </Badge>
      </TableCell>
      <TableCell column="meta">
        <SideNotional szi={item.prevSzi} notional={item.prevNotional} />
      </TableCell>
      <TableCell column="meta">
        <SideNotional szi={item.newSzi} notional={item.newNotional} />
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {new Date(item.ts).toLocaleString("en-US", { hour12: false })}
        </span>
      </TableCell>
    </TableRow>
  )
}

function SideNotional({
  szi,
  notional,
}: {
  szi: string | null
  notional: string | null
}) {
  const size = szi === null ? 0 : Number(szi)
  if (size === 0) {
    return <span className="font-mono text-xs text-muted-foreground">flat</span>
  }
  return (
    <span className="font-mono text-xs tabular-nums">
      <span
        className={cn(
          "font-medium",
          size > 0 ? "text-emerald-600" : "text-red-500"
        )}
      >
        {size > 0 ? "long" : "short"}
      </span>{" "}
      {notional === null ? "" : compactUsd(notional)}
    </span>
  )
}
