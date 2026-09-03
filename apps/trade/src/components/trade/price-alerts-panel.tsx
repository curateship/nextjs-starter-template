import * as React from "react"
import { BellRingIcon, HistoryIcon, Trash2Icon } from "lucide-react"

import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import {
  getFiredPriceAlertDeleteErrorMessage,
  getFiredPriceAlertLoadErrorMessage,
  loadFiredPriceAlerts,
  removeFiredPriceAlert,
} from "@/lib/api/trade/price-alerts"
import { formatDateTime, formatRelativeTime } from "@/lib/format/format-time"
import { marketSymbol } from "@/lib/protocols/contracts"
import { formatPrice } from "@/lib/trade/format"
import type { LineAlert } from "@/lib/trade/line-alerts"
import type { FiredPriceAlert, PriceAlert } from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

const FIRED_REFRESH_MS = 2_000

/**
 * The alerts drawn lines carry, listed beside the price alerts. Optional, so
 * a screen with no chart to arm a line from can leave them out.
 */
export type LineAlertsForPanel = {
  armed: readonly LineAlert[]
  fired: readonly LineAlert[]
  error: string | null
  onRetry: () => void
  /** Open the market and pick the line out. */
  onSelect: (marketKey: string, id: string) => void
  /** Switch an armed one off, or clear a fired one. The line stays. */
  onSwitchOff: (id: string) => void
}

const NO_LINES: LineAlertsForPanel = {
  armed: [],
  fired: [],
  error: null,
  onRetry: () => undefined,
  onSelect: () => undefined,
  onSwitchOff: () => undefined,
}

export type PriceAlertsPanelProps = {
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines?: LineAlertsForPanel
}

export type FiredPriceAlertsControl = {
  alerts: readonly FiredPriceAlert[]
  error: string | null
  known: boolean
  busy: boolean
  refresh: () => Promise<void>
  remove: (id: string) => void
}

/** The fired list stays live so the bell can notify before its menu opens. */
export function useFiredPriceAlerts(): FiredPriceAlertsControl {
  const [fired, setFired] = React.useState<FiredPriceAlert[]>([])
  const [firedError, setFiredError] = React.useState<string | null>(null)
  const [firedKnown, setFiredKnown] = React.useState(false)
  const [firedBusy, setFiredBusy] = React.useState(false)
  const firedReading = React.useRef(false)
  const firedKnownRef = React.useRef(false)
  const pendingFiredDeletes = React.useRef(new Set<string>())

  const refreshFired = React.useCallback(async () => {
    if (firedReading.current) return
    firedReading.current = true
    const wasKnown = firedKnownRef.current
    if (!wasKnown) setFiredBusy(true)
    try {
      const answer = await loadFiredPriceAlerts()
      setFired(
        answer.alerts.filter(
          (alert) => !pendingFiredDeletes.current.has(alert.id)
        )
      )
      setFiredError(null)
      setFiredKnown(true)
      firedKnownRef.current = true
    } catch (caught) {
      setFiredError(getFiredPriceAlertLoadErrorMessage(caught))
    } finally {
      firedReading.current = false
      if (!wasKnown) setFiredBusy(false)
    }
  }, [])

  React.useEffect(() => {
    void refreshFired()
  }, [refreshFired])

  React.useEffect(() => {
    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshFired()
    }
    const timer = window.setInterval(refreshWhenVisible, FIRED_REFRESH_MS)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [refreshFired])

  const deleteFired = React.useCallback(
    (id: string) => {
      const removed = fired.find((alert) => alert.id === id)
      if (!removed) return
      pendingFiredDeletes.current.add(id)
      setFired((current) => current.filter((alert) => alert.id !== id))
      void removeFiredPriceAlert(id).then(
        () => pendingFiredDeletes.current.delete(id),
        (caught) => {
          pendingFiredDeletes.current.delete(id)
          setFired((current) =>
            current.some((alert) => alert.id === id)
              ? current
              : [...current, removed].sort(
                  (left, right) =>
                    right.firedAt - left.firedAt ||
                    right.createdAt - left.createdAt ||
                    left.id.localeCompare(right.id)
                )
          )
          showErrorToast(getFiredPriceAlertDeleteErrorMessage(caught))
        }
      )
    },
    [fired]
  )

  return {
    alerts: fired,
    error: firedError,
    known: firedKnown,
    busy: firedBusy,
    refresh: refreshFired,
    remove: deleteFired,
  }
}

export function PriceAlertsPanelContent({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
  lines = NO_LINES,
  fired,
  onClear,
  clearing = false,
}: PriceAlertsPanelProps & {
  fired: FiredPriceAlertsControl
  onClear?: (kind: "active" | "fired") => void
  clearing?: boolean
}) {
  const [tab, setTab] = React.useState<"alerts" | "fired">("alerts")

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as "alerts" | "fired"
        setTab(next)
        if (next === "fired") void fired.refresh()
      }}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <DashboardCardTabsHeader>
        <DashboardCardTab
          value="alerts"
          icon={<BellRingIcon className="size-4" />}
          label="Alert"
          count={alerts.length + lines.armed.length}
        />
        <DashboardCardTab
          value="fired"
          icon={<HistoryIcon className="size-4" />}
          label="Fired"
          count={
            fired.known ? fired.alerts.length + lines.fired.length : undefined
          }
        />
      </DashboardCardTabsHeader>

      <TabsContent value="alerts" className="min-h-0 flex-1">
        <ActiveAlertsView
          alerts={alerts}
          error={error}
          onRetry={onRetry}
          onSelectMarket={onSelectMarket}
          onDelete={onDelete}
          lines={lines}
        />
      </TabsContent>
      <TabsContent value="fired" className="min-h-0 flex-1">
        <FiredAlertsView
          alerts={fired.alerts}
          error={fired.error}
          known={fired.known}
          busy={fired.busy}
          onRetry={() => void fired.refresh()}
          onSelectMarket={onSelectMarket}
          onDelete={fired.remove}
          lines={lines}
        />
      </TabsContent>
      {onClear &&
      (tab === "alerts"
        ? alerts.length + lines.armed.length > 0
        : fired.alerts.length + lines.fired.length > 0) ? (
        <div className="mt-auto flex shrink-0 border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 text-xs text-muted-foreground"
            disabled={clearing}
            onClick={() => onClear(tab === "alerts" ? "active" : "fired")}
          >
            {clearing ? "Clearing..." : "Clear all"}
          </Button>
        </div>
      ) : null}
    </Tabs>
  )
}

/** One list of both kinds, oldest first, the way the Alert tab reads it. */
type ActiveRow =
  | { kind: "price"; at: number; alert: PriceAlert }
  | { kind: "line"; at: number; alert: LineAlert }

function activeRows(
  alerts: readonly PriceAlert[],
  lines: readonly LineAlert[]
): ActiveRow[] {
  return [
    ...alerts.map((alert): ActiveRow => ({
      kind: "price",
      at: alert.createdAt,
      alert,
    })),
    ...lines.map((alert): ActiveRow => ({
      kind: "line",
      at: alert.armedAt,
      alert,
    })),
  ].sort((a, b) => a.at - b.at || a.alert.id.localeCompare(b.alert.id))
}

const BIN_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

function ActiveAlertsView({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
  lines,
}: {
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines: LineAlertsForPanel
}) {
  if (error) {
    return (
      <div className="p-2">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    )
  }
  const rows = activeRows(alerts, lines.armed)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {lines.error ? (
        <ErrorBanner message={lines.error} onRetry={lines.onRetry} />
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No active alerts. Right-click a chart to add one, or double-click a
            drawn line.
          </p>
        ) : (
          <div className="grid">
            {rows.map((row) => (
              <div
                key={row.alert.id}
                className="-mt-px flex min-h-8 items-center gap-1 border-y border-t-transparent px-3 first:mt-0 hover:z-10 hover:border-t-border hover:bg-muted"
              >
                {row.kind === "price" ? (
                  <>
                    <PriceAlertRow
                      alert={row.alert}
                      onSelectMarket={onSelectMarket}
                    />
                    <button
                      type="button"
                      aria-label={`Delete ${marketSymbol(row.alert.marketKey)} alert at ${formatPrice(row.alert.price)}`}
                      className={BIN_CLASS}
                      onClick={() => onDelete(row.alert.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <LineAlertRow alert={row.alert} onSelect={lines.onSelect} />
                    <button
                      type="button"
                      aria-label={`Switch off the ${marketSymbol(row.alert.marketKey)} ${row.alert.kind} alert`}
                      className={BIN_CLASS}
                      onClick={() => lines.onSwitchOff(row.alert.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** The fired lists of both kinds, newest fire first. */
type FiredRow =
  | { kind: "price"; at: number; alert: FiredPriceAlert }
  | { kind: "line"; at: number; alert: LineAlert }

function firedRows(
  alerts: readonly FiredPriceAlert[],
  lines: readonly LineAlert[]
): FiredRow[] {
  return [
    ...alerts.map((alert): FiredRow => ({
      kind: "price",
      at: alert.firedAt,
      alert,
    })),
    ...lines.map((alert): FiredRow => ({
      kind: "line",
      at: alert.firedAt ?? 0,
      alert,
    })),
  ].sort((a, b) => b.at - a.at || a.alert.id.localeCompare(b.alert.id))
}

function FiredAlertsView({
  alerts,
  error,
  known,
  busy,
  onRetry,
  onSelectMarket,
  onDelete,
  lines,
}: {
  alerts: readonly FiredPriceAlert[]
  error: string | null
  known: boolean
  busy: boolean
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines: LineAlertsForPanel
}) {
  if (busy && !known) {
    return <LoadingRow label="Loading fired alerts..." className="min-h-32" />
  }
  if (error && !known) {
    return (
      <div className="p-2">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    )
  }

  const rows = firedRows(alerts, lines.fired)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? <ErrorBanner message={error} onRetry={onRetry} /> : null}
      <ScrollArea className="min-h-0 flex-1">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No alerts have fired yet.
          </p>
        ) : (
          <div className="grid">
            {rows.map((row) => (
              <div
                key={row.alert.id}
                className="-mt-px flex min-h-8 items-center gap-1 border-y border-t-transparent px-3 first:mt-0 hover:z-10 hover:border-t-border hover:bg-muted"
              >
                {row.kind === "price" ? (
                  <>
                    <PriceAlertRow
                      alert={row.alert}
                      rightText={formatRelativeTime(
                        new Date(row.alert.firedAt),
                        formatDateTime
                      )}
                      rightTitle={formatDateTime(new Date(row.alert.firedAt))}
                      rightMuted
                      onSelectMarket={onSelectMarket}
                    />
                    <button
                      type="button"
                      aria-label={`Delete fired ${marketSymbol(row.alert.marketKey)} alert`}
                      className={BIN_CLASS}
                      onClick={() => onDelete(row.alert.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <LineAlertRow
                      alert={row.alert}
                      rightText={formatRelativeTime(
                        new Date(row.at),
                        formatDateTime
                      )}
                      rightTitle={formatDateTime(new Date(row.at))}
                      onSelect={lines.onSelect}
                    />
                    <button
                      type="button"
                      aria-label={`Clear the fired ${marketSymbol(row.alert.marketKey)} ${row.alert.kind} alert`}
                      className={BIN_CLASS}
                      onClick={() => lines.onSwitchOff(row.alert.id)}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * A drawn line's row: the coin, the line's name or else the word trendline
 * or level, where the line is in dollars, and the direction. Pressing it
 * opens the market with the line picked out, which is the one thing a line
 * row can do that a price row cannot.
 */
function LineAlertRow({
  alert,
  rightText,
  rightTitle,
  onSelect,
}: {
  alert: LineAlert
  rightText?: string
  rightTitle?: string
  onSelect: (marketKey: string, id: string) => void
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onSelect(alert.marketKey, alert.id)}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-medium">
          {marketSymbol(alert.marketKey)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {alert.name ?? alert.kind}
          {alert.price === null ? "" : ` at ${formatPrice(alert.price)}`}
          {" · "}
          {alert.direction}
        </span>
      </span>
      {rightText ? (
        <span
          className="shrink-0 text-xs text-muted-foreground tabular-nums"
          title={rightTitle}
        >
          {rightText}
        </span>
      ) : null}
    </button>
  )
}

function PriceAlertRow({
  alert,
  rightText,
  rightTitle,
  rightMuted = false,
  onSelectMarket,
}: {
  alert: PriceAlert
  rightText?: string
  rightTitle?: string
  rightMuted?: boolean
  onSelectMarket: (marketKey: string) => void
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-2 self-stretch text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={() => onSelectMarket(alert.marketKey)}
    >
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate font-medium">
          {marketSymbol(alert.marketKey)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {alert.direction}
        </span>
      </span>
      {rightText ? (
        <span
          className={
            rightMuted
              ? "shrink-0 text-xs text-muted-foreground tabular-nums"
              : "shrink-0 tabular-nums"
          }
          title={rightTitle}
        >
          {rightText}
        </span>
      ) : null}
    </button>
  )
}
