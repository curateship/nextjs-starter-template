import * as React from "react"
import { RadarIcon } from "lucide-react"

import { DashboardTable, pagedFooter } from "@/components/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/dashboard-toolbar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatNotional } from "@/components/scanner/format"
import { SortHeaderRow } from "@/components/scanner/sort-head"
import { usePolledData } from "@/components/scanner/use-polled-data"
import { WalletChip } from "@/components/scanner/wallet-chip"
import { WalletDialog } from "@/components/scanner/wallet-dialog"
import { formatPriceDisplay } from "@/components/trading/format"
import {
  loadWhalesPage,
  type ScannerWalletInfo,
  type WhalesFilters,
  type WhalesPageResponse,
  type WhaleTradeItem,
} from "@/lib/api/scanner"
import { cn } from "@/lib/utils"

const POLL_MS = 5_000

const COLUMNS: {
  key: WhalesFilters["sortBy"]
  label: string
  main?: boolean
}[] = [
  { key: "coin", label: "Coin", main: true },
  { key: "side", label: "Side" },
  { key: "size", label: "Size" },
  { key: "price", label: "Price" },
  { key: "notional", label: "Notional" },
  { key: "buyer", label: "Buyer" },
  { key: "seller", label: "Seller" },
  { key: "time", label: "Time" },
]

const MIN_NOTIONAL_OPTIONS = [
  { value: 0, label: "Any size" },
  { value: 50_000, label: "≥ $50k" },
  { value: 100_000, label: "≥ $100k" },
  { value: 250_000, label: "≥ $250k" },
  { value: 1_000_000, label: "≥ $1M" },
]

const MIN_COIN_VOLUME_OPTIONS = [
  { value: 0, label: "All coins" },
  { value: 1_000_000, label: "Vol ≥ $1M" },
  { value: 10_000_000, label: "Vol ≥ $10M" },
  { value: 50_000_000, label: "Vol ≥ $50M" },
]

export function WhaleTradesDashboard({
  initial,
  filters,
  onFiltersChange,
}: {
  initial: WhalesPageResponse
  filters: WhalesFilters
  onFiltersChange: (patch: Partial<WhalesFilters>) => void
}) {
  const [data, refetch] = usePolledData(initial, loadWhalesPage, filters, POLL_MS)
  const [dialogWallet, setDialogWallet] = React.useState<{
    address: string
    wallet: ScannerWalletInfo | null
  } | null>(null)

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Whale Trades"
        icon={
          <RadarIcon className="size-4 text-muted-foreground sm:size-[18px]" />
        }
        count={data.total}
        controls={
          <>
            <Select
              value={filters.coin ?? "all"}
              onValueChange={(value) =>
                onFiltersChange({ coin: value === "all" ? undefined : value })
              }
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue placeholder="Coin" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All coins</SelectItem>
                {data.coins.map((option) => (
                  <SelectItem key={option.coin} value={option.coin}>
                    {option.coin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.side ?? "all"}
              onValueChange={(value) =>
                onFiltersChange({
                  side: value === "all" ? undefined : (value as "buy" | "sell"),
                })
              }
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue placeholder="Side" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Buys + sells</SelectItem>
                <SelectItem value="buy">Buys</SelectItem>
                <SelectItem value="sell">Sells</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(filters.minNotional ?? 0)}
              onValueChange={(value) =>
                onFiltersChange({
                  minNotional: value === "0" ? undefined : Number(value),
                })
              }
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue placeholder="Min size" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {MIN_NOTIONAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(filters.minCoinVolume ?? 0)}
              onValueChange={(value) =>
                onFiltersChange({
                  minCoinVolume: value === "0" ? undefined : Number(value),
                })
              }
            >
              <DashboardToolbarSelectTrigger>
                <SelectValue placeholder="Coin volume" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {MIN_COIN_VOLUME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
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
            <DashboardToolbarButton
              type="button"
              variant={filters.hideIgnored ? "default" : "outline"}
              onClick={() => onFiltersChange({ hideIgnored: !filters.hideIgnored })}
            >
              Hide ignored
            </DashboardToolbarButton>
            <DashboardToolbarSearch
              value={filters.label ?? ""}
              placeholder="Wallet label…"
              onChange={(event) =>
                onFiltersChange({
                  label:
                    event.target.value === "" ? undefined : event.target.value,
                })
              }
            />
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
        emptyText="No whale trades yet. The worker collects mainnet trades above the notional floor — give it a minute."
        emptyColSpan={8}
        footer={pagedFooter(data, onFiltersChange)}
      >
        {data.items.map((item) => (
          <WhaleTradeRow
            key={item.id}
            item={item}
            onWalletClick={(address, wallet) =>
              setDialogWallet({ address, wallet })
            }
          />
        ))}
      </DashboardTable>
      {dialogWallet ? (
        <WalletDialog
          address={dialogWallet.address}
          wallet={dialogWallet.wallet}
          open
          onOpenChange={(open) => {
            if (!open) setDialogWallet(null)
          }}
          onSaved={() => void refetch()}
        />
      ) : null}
    </div>
  )
}

function WhaleTradeRow({
  item,
  onWalletClick,
}: {
  item: WhaleTradeItem
  onWalletClick: (address: string, wallet: ScannerWalletInfo | null) => void
}) {
  return (
    <TableRow>
      <TableCell column="main">
        <span className="font-medium">{item.coin}</span>
      </TableCell>
      <TableCell column="meta">
        <span
          className={cn(
            "font-medium",
            item.side === "buy" ? "text-emerald-600" : "text-red-500"
          )}
        >
          {item.side}
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
        <WalletChip
          address={item.buyer}
          wallet={item.buyerWallet}
          onClick={() => onWalletClick(item.buyer, item.buyerWallet)}
        />
      </TableCell>
      <TableCell column="meta">
        <WalletChip
          address={item.seller}
          wallet={item.sellerWallet}
          onClick={() => onWalletClick(item.seller, item.sellerWallet)}
        />
      </TableCell>
      <TableCell column="meta">
        <span className="font-mono text-xs tabular-nums">
          {new Date(item.ts).toLocaleTimeString("en-US", { hour12: false })}
        </span>
      </TableCell>
    </TableRow>
  )
}
