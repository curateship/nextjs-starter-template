import * as React from "react"
import { createPortal } from "react-dom"
import {
  BrushCleaningIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { LoadingRow } from "@/components/ui/loading-row"
import { Button } from "@/components/ui/button"
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
import {
  BlockHeadingActions,
  useBlockCount,
  useBlockOpen,
} from "@/components/trade/notes/trade-block-views"
import { loadMarketScannerSettings } from "@/lib/api/trade/market-scanner"
import { marketChartHref, type MarketCatalog } from "@/lib/protocols/contracts"
import {
  useMarketScanner,
  type ScannerResult,
} from "@/lib/trade/use-market-scanner"
import {
  priceMoveWord,
  type ScannerSettings,
} from "@/lib/trade/market-scanner"
import { MADE_MONEY_SURFACE, LOST_MONEY_SURFACE } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

type Props = {
  accountId: string
  catalogs: readonly MarketCatalog[]
  onSelectMarket: (key: string) => void
  selectedMarketKey: string | null
}

/**
 * The market scanner, the dashboard's Scanner block (the Admin 3 panel
 * design, 7 Nov 2026). Its cog and broom sit in the block's heading.
 *
 * The scanner keeps running with the block folded, so the heading can count
 * what it found since the list was last looked at. An open block counts what
 * it shows as seen, as the Alerts block does.
 */
export function MarketScannerMenu(props: Props) {
  const [opening, setOpening] = React.useState<Awaited<
    ReturnType<typeof loadMarketScannerSettings>
  > | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  // The cog, which focus comes back to when the settings window closes.
  const cogRef = React.useRef<HTMLButtonElement>(null)
  const load = React.useCallback(() => {
    void loadMarketScannerSettings()
      .then((answer) => {
        setOpening(answer)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [])
  React.useEffect(load, [load])
  const edit = React.useCallback(() => setEditing(true), [])
  return (
    <>
      {opening ? (
        <ScannerResults
          {...props}
          settings={opening.settings}
          cogRef={cogRef}
          onEdit={edit}
        />
      ) : (
        <ScannerFrame>
          <ScannerHeader cogRef={cogRef} />
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
        </ScannerFrame>
      )}
      {editing && opening ? (
        <MarketScannerSettings
          settings={opening.settings}
          venues={opening.venues}
          triggerRef={cogRef}
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

/** The block's body: the list in place, its own height, scrolling inside. */
function ScannerFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex h-80 min-h-0 flex-col overflow-hidden">{children}</div>
}

/** One match, told apart from a later match on the same market. */
function resultId(row: ScannerResult) {
  return `${row.market.key}@${row.since}`
}

/**
 * The matches already looked at, kept in this browser beside the matches
 * themselves, so a reload does not count the whole list as new again.
 */
function useSeenResults(accountId: string) {
  const storageKey = `trade:market-scanner-seen:${accountId}`
  const [seen, setSeen] = React.useState<ReadonlySet<string>>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      return new Set(saved ? (JSON.parse(saved) as string[]) : [])
    } catch {
      return new Set()
    }
  })
  const markSeen = React.useCallback(
    (ids: readonly string[]) => {
      setSeen(new Set(ids))
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(ids))
      } catch {
        // Without storage the count still clears for this visit.
      }
    },
    [storageKey]
  )
  return [seen, markSeen] as const
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
 * The menu's title row: the radar, the name, the cog, and Clear all.
 *
 * **Clear all appears only once there is something to clear** (Tyler,
 * 14 Sep 2026). Matches stay until they are deleted, and deleting them one
 * right-click at a time is the only way there was. The order is the app's
 * own rule for a row of actions: Settings, then the destructive one.
 *
 * **It clears at once, without asking** (Tyler, 29 Oct 2026: "remove the
 * confirmation modal for the clear all matches scanner icon"). It asked first
 * from 14 Sep until then.
 */
function ScannerHeader({
  onEdit,
  onClearAll,
  cogRef,
}: {
  onEdit?: () => void
  onClearAll?: () => void
  /** The cog, so the settings window can hand focus back to it. */
  cogRef: React.RefObject<HTMLButtonElement | null>
}) {
  const buttons = (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={cogRef}
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
    </>
  )
  // The block's own heading row holds them.
  return <BlockHeadingActions>{buttons}</BlockHeadingActions>
}

function ScannerResults({
  settings,
  accountId,
  catalogs,
  onSelectMarket,
  selectedMarketKey,
  cogRef,
  onEdit,
}: Props & {
  settings: ScannerSettings
  cogRef: React.RefObject<HTMLButtonElement | null>
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
  const [seen, markSeen] = useSeenResults(accountId)
  const open = useBlockOpen()
  const ids = snapshot.rows.map(resultId)
  const newCount = open ? 0 : ids.filter((id) => !seen.has(id)).length
  // An open block counts what it shows as seen, and folding it lets the
  // list fall back into its own order.
  const idsKey = ids.join("\n")
  React.useEffect(() => {
    if (open) markSeen(idsKey ? idsKey.split("\n") : [])
    else setOrder(null)
  }, [open, idsKey, markSeen])
  useBlockCount(newCount)
  return (
    <>
      <ScannerFrame>
        <ScannerHeader
          cogRef={cogRef}
          onEdit={onEdit}
          onClearAll={rows.length > 0 ? dismissAll : undefined}
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
              `Watching for a ${settings.priceIncreasePct}% ${priceMoveWord(settings.priceDirection)} in ${settings.priceWindowSeconds / 60} minute${settings.priceWindowSeconds === 60 ? "" : "s"}. Matches stay until you delete them. ${snapshot.warming ? "Collecting price history…" : ""}`
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
              {/* In the page body, not the menu: the menu is moved into place
                  with a transform, and fixed inside a transform measures from
                  the menu rather than the window. */}
              {createPortal(
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${menu.symbol} scanner actions`}
                    className="pointer-events-none fixed size-px opacity-0"
                    style={{ left: menu.x, top: menu.y }}
                  />
                </DropdownMenuTrigger>,
                document.body
              )}
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
      </ScannerFrame>
    </>
  )
}
