import * as React from "react"
import {
  BrushCleaningIcon,
  RadarIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  DashboardCardHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { MarketScannerSettings } from "@/components/trade/market-scanner-settings"
import { loadMarketScannerSettings } from "@/lib/api/trade/market-scanner"
import { marketChartHref, type MarketCatalog } from "@/lib/protocols/contracts"
import {
  useMarketScanner,
  type ScannerResult,
} from "@/lib/trade/use-market-scanner"
import type { ScannerSettings } from "@/lib/trade/market-scanner"
import { MADE_MONEY_SURFACE, LOST_MONEY_SURFACE } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

type Props = {
  accountId: string
  catalogs: readonly MarketCatalog[]
  onSelectMarket: (key: string) => void
  selectedMarketKey: string | null
}
export function MarketScannerPanel(props: Props) {
  const [opening, setOpening] = React.useState<Awaited<
    ReturnType<typeof loadMarketScannerSettings>
  > | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const load = React.useCallback(() => {
    void loadMarketScannerSettings()
      .then((answer) => {
        setOpening(answer)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])
  React.useEffect(load, [load])
  return (
    <>
      {opening ? (
        // The header travels with the results because Clear all lives in it
        // and only the results know what there is to clear.
        <ScannerResults
          {...props}
          settings={opening.settings}
          triggerRef={triggerRef}
          onEdit={() => setEditing(true)}
        />
      ) : (
        <>
          <ScannerHeader triggerRef={triggerRef} />
          <div className="p-3 text-sm text-muted-foreground">
            {failed ? (
              <>
                Could not load scanner settings.
                <Button variant="outline" onClick={load}>
                  Retry
                </Button>
              </>
            ) : (
              <LoadingRow label="Reading scanner settings" />
            )}
          </div>
        </>
      )}
      {editing && opening ? (
        <MarketScannerSettings
          settings={opening.settings}
          venues={opening.venues}
          triggerRef={triggerRef}
          onClose={() => setEditing(false)}
          onSave={(settings) => {
            setOpening({ ...opening, settings })
            setEditing(false)
          }}
        />
      ) : null}
    </>
  )
}
function ago(since: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - since) / 1000))
  return seconds < 60
    ? `${seconds}s ago`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : `${Math.floor(seconds / 3600)}h ago`
}
function scannerResultDetails(row: ScannerResult) {
  return `${row.market.key}. Detected when ${row.rule}. Captured at ${new Date(row.since).toLocaleTimeString()}. Saved until you delete it.`
}
/**
 * The panel's title row: the radar, the name, the cog, and Clear all.
 *
 * **Clear all appears only once there is something to clear** (Tyler,
 * 14 Sep 2026). Matches stay until they are deleted, and deleting them one
 * right-click at a time is the only way there was. The order is the app's
 * own rule for a row of actions: Settings, then the destructive one.
 *
 * **It asks before it sweeps** (Tyler, 14 Sep 2026). A match is a coin the
 * scanner found while nobody was looking, and the list can be an hour of them;
 * there is no undo, and a broom next to a cog is an easy thing to hit by
 * mistake.
 */
function ScannerHeader({
  triggerRef,
  onEdit,
  onClearAll,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onEdit?: () => void
  onClearAll?: () => void
}) {
  return (
    <DashboardCardHeader>
      <RadarIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
      <h2
        className={cn("min-w-0 flex-1 truncate", dashboardCardHeadingClassName)}
      >
        Market scanner
      </h2>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon"
            aria-label="Market scanner settings"
            disabled={!onEdit}
            onClick={onEdit}
          >
            <SettingsIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Market scanner settings</TooltipContent>
      </Tooltip>
      {onClearAll ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Clear all scanner matches"
              onClick={onClearAll}
            >
              {/* A broom, not a bin (Tyler, 14 Sep 2026). The bin on one row's
                  menu deletes that match; this sweeps the whole list, and two
                  bins side by side said the same thing about different jobs. */}
              <BrushCleaningIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear all matches</TooltipContent>
        </Tooltip>
      ) : null}
    </DashboardCardHeader>
  )
}

function ScannerResults({
  settings,
  accountId,
  catalogs,
  onSelectMarket,
  selectedMarketKey,
  triggerRef,
  onEdit,
}: Props & {
  settings: ScannerSettings
  triggerRef: React.RefObject<HTMLButtonElement | null>
  onEdit: () => void
}) {
  const { snapshot, retry, dismiss, dismissAll } = useMarketScanner(
    settings,
    catalogs,
    accountId
  )
  const [menu, setMenu] = React.useState<{
    key: string
    symbol: string
    x: number
    y: number
    target: HTMLElement
  } | null>(null)
  const [clearing, setClearing] = React.useState(false)
  const listRef = React.useRef<HTMLUListElement>(null)
  const [order, setOrder] = React.useState<string[] | null>(null)
  const rows = order
    ? [...snapshot.rows].sort((a, b) => {
        const left = order.indexOf(a.market.key),
          right = order.indexOf(b.market.key)
        return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right)
      })
    : snapshot.rows
  const readingMarkets =
    settings.enabled && !snapshot.loaded && snapshot.errors.length === 0
  return (
    <>
      <ScannerHeader
        triggerRef={triggerRef}
        onEdit={onEdit}
        onClearAll={rows.length > 0 ? () => setClearing(true) : undefined}
      />
      <ConfirmDialog
        open={clearing}
        onOpenChange={setClearing}
        title="Clear every match?"
        description={`The ${rows.length} ${rows.length === 1 ? "market" : "markets"} the scanner has found go off this list for good. The scanner keeps watching, and a market only comes back if it meets your conditions again.`}
        confirmLabel="Clear all"
        onConfirm={() => {
          dismissAll()
          setClearing(false)
        }}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div
          className="p-3 text-xs text-muted-foreground"
          role={readingMarkets ? undefined : "status"}
        >
          {!settings.enabled ? (
            "Scanner paused. Enable scanning in settings."
          ) : readingMarkets ? (
            <LoadingRow
              label="Reading the market list"
              className="py-0 text-xs"
            />
          ) : settings.mode === "price" ? (
            `Watching for a ${settings.priceIncreasePct}% rise in ${settings.priceWindowSeconds / 60} minute${settings.priceWindowSeconds === 60 ? "" : "s"}. Matches stay until you delete them. ${snapshot.warming ? "Collecting price history…" : ""}`
          ) : (
            `Scanning ${snapshot.total - snapshot.unavailable} markets. Matches stay until you delete them. ${snapshot.unavailable} unavailable or reconnecting.`
          )}
        </div>
        {snapshot.errors.length > 0 ? (
          <div className="grid gap-2 p-3 text-xs" role="alert">
            {snapshot.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
            <Button variant="outline" onClick={retry}>
              Retry scanner
            </Button>
          </div>
        ) : null}
        {settings.enabled && snapshot.loaded && !rows.length ? (
          <p className="p-3 text-xs text-muted-foreground">
            No markets meet your conditions yet.
          </p>
        ) : null}
        <ul
          ref={listRef}
          tabIndex={-1}
          onPointerEnter={() =>
            setOrder(snapshot.rows.map((r) => r.market.key))
          }
          onPointerLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement))
              setOrder(null)
          }}
          onFocus={() =>
            setOrder((old) => old ?? snapshot.rows.map((r) => r.market.key))
          }
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget) &&
              !event.currentTarget.matches(":hover")
            )
              setOrder(null)
          }}
        >
          {rows.map((row) => {
            const change = row.change
            const details = scannerResultDetails(row)
            return (
              <li
                key={row.market.key}
                className={cn(
                  "min-w-0 hover:bg-muted",
                  selectedMarketKey === row.market.key && "bg-muted"
                )}
              >
                <a
                  href={marketChartHref(row.market.key) ?? undefined}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenu({
                      key: row.market.key,
                      symbol: row.market.symbol,
                      x: event.clientX,
                      y: event.clientY,
                      target: event.currentTarget,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key !== "ContextMenu" &&
                      !(event.shiftKey && event.key === "F10")
                    )
                      return
                    event.preventDefault()
                    const bounds = event.currentTarget.getBoundingClientRect()
                    setMenu({
                      key: row.market.key,
                      symbol: row.market.symbol,
                      x: bounds.left,
                      y: bounds.bottom,
                      target: event.currentTarget,
                    })
                  }}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return
                    if (
                      catalogs.some((catalog) =>
                        catalog.rows.some((m) => m.key === row.market.key)
                      )
                    ) {
                      event.preventDefault()
                      onSelectMarket(row.market.key)
                    }
                  }}
                  aria-label={`${row.market.symbol}, ${ago(row.since)}. ${details}`}
                  aria-current={
                    selectedMarketKey === row.market.key ? "true" : undefined
                  }
                  className={cn(
                    "flex h-9 min-w-0 items-center gap-2 px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring",
                    selectedMarketKey === row.market.key && "bg-muted"
                  )}
                >
                  <span className="order-1 min-w-0 truncate text-sm font-medium">
                    {row.market.symbol}
                  </span>
                  <span className="order-3 ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                    {ago(row.since)}
                  </span>
                  <span
                    className={cn(
                      "order-4 min-w-14 shrink-0 rounded-full px-2 py-0.5 text-right text-xs tabular-nums",
                      change !== null && change > 0
                        ? MADE_MONEY_SURFACE
                        : change !== null && change < 0
                          ? LOST_MONEY_SURFACE
                          : "text-muted-foreground"
                    )}
                  >
                    {change === null
                      ? "—"
                      : `${change > 0 ? "+" : ""}${(change * 100).toFixed(2)}%`}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
        {menu ? (
          <DropdownMenu
            open
            onOpenChange={(open) => {
              if (!open) setMenu(null)
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${menu.symbol} scanner actions`}
                className="pointer-events-none fixed size-px opacity-0"
                style={{ left: menu.x, top: menu.y }}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                if (menu.target.isConnected) menu.target.focus()
                else listRef.current?.focus()
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  dismiss(menu.key)
                  setMenu(null)
                }}
              >
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </ScrollArea>
    </>
  )
}
