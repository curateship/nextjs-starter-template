import * as React from "react"
import { Loader2Icon, RadarIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import {
  DashboardCardHeader,
  dashboardCardHeadingClassName,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
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
      <DashboardCardHeader>
        <RadarIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <h2
          className={cn(
            "min-w-0 flex-1 truncate",
            dashboardCardHeadingClassName
          )}
        >
          Market scanner
        </h2>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          aria-label="Market scanner settings"
          disabled={!opening}
          onClick={() => setEditing(true)}
        >
          <SettingsIcon />
        </Button>
      </DashboardCardHeader>
      {opening ? (
        <ScannerResults {...props} settings={opening.settings} />
      ) : (
        <div className="p-3 text-sm text-muted-foreground">
          {failed ? (
            <>
              Could not load scanner settings.
              <Button variant="outline" onClick={load}>
                Retry
              </Button>
            </>
          ) : (
            <Loader2Icon
              className="size-4 animate-spin"
              aria-label="Loading scanner settings"
            />
          )}
        </div>
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
function ScannerResults({
  settings,
  accountId,
  catalogs,
  onSelectMarket,
  selectedMarketKey,
}: Props & { settings: ScannerSettings }) {
  const { snapshot, retry, dismiss } = useMarketScanner(
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
  const listRef = React.useRef<HTMLUListElement>(null)
  const [order, setOrder] = React.useState<string[] | null>(null)
  const rows = order
    ? [...snapshot.rows].sort((a, b) => {
        const left = order.indexOf(a.market.key),
          right = order.indexOf(b.market.key)
        return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right)
      })
    : snapshot.rows
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-3 text-xs text-muted-foreground" role="status">
        {!settings.enabled
          ? "Scanner paused. Enable scanning in settings."
          : !snapshot.loaded && snapshot.errors.length === 0
            ? "Loading markets…"
            : settings.mode === "price"
              ? `Watching for a ${settings.priceIncreasePct}% rise in ${settings.priceWindowSeconds / 60} minute${settings.priceWindowSeconds === 60 ? "" : "s"}. Matches stay until you delete them. ${snapshot.warming ? "Collecting price history…" : ""}`
              : `Scanning ${snapshot.total - snapshot.unavailable} markets. Matches stay until you delete them. ${snapshot.unavailable} unavailable or reconnecting.`}
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
        onPointerEnter={() => setOrder(snapshot.rows.map((r) => r.market.key))}
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
  )
}
