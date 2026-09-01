import * as React from "react"
import { BellRingIcon, HistoryIcon, Trash2Icon } from "lucide-react"

import {
  DashboardCardTab,
  DashboardCardTabsHeader,
} from "@/components/shared/dashboard-card-header"
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
import type { FiredPriceAlert, PriceAlert } from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

const FIRED_REFRESH_MS = 2_000

export function PriceAlertsPanel({
  alerts,
  error,
  collapsed,
  onRetry,
  onExpand,
  onSelectMarket,
  onDelete,
}: {
  alerts: readonly PriceAlert[]
  error: string | null
  collapsed: boolean
  onRetry: () => void
  onExpand?: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
}) {
  const [tab, setTab] = React.useState<"alerts" | "fired">("alerts")
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
    if (tab !== "fired" || alerts.length === 0) return
    const refreshWhenVisible = () => {
      if (!document.hidden) void refreshFired()
    }
    const timer = window.setInterval(refreshWhenVisible, FIRED_REFRESH_MS)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [alerts.length, refreshFired, tab])

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

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as "alerts" | "fired"
        setTab(next)
        if (next === "fired") void refreshFired()
      }}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      <DashboardCardTabsHeader>
        <DashboardCardTab
          value="alerts"
          icon={<BellRingIcon className="size-4" />}
          label="Alert"
          count={alerts.length}
          onClick={collapsed ? onExpand : undefined}
        />
        <DashboardCardTab
          value="fired"
          icon={<HistoryIcon className="size-4" />}
          label="Fired"
          count={firedKnown ? fired.length : undefined}
          onClick={collapsed ? onExpand : undefined}
        />
      </DashboardCardTabsHeader>

      {collapsed ? null : (
        <>
          <TabsContent value="alerts" className="min-h-0 flex-1">
            <ActiveAlertsView
              alerts={alerts}
              error={error}
              onRetry={onRetry}
              onSelectMarket={onSelectMarket}
              onDelete={onDelete}
            />
          </TabsContent>
          <TabsContent value="fired" className="min-h-0 flex-1">
            <FiredAlertsView
              alerts={fired}
              error={firedError}
              known={firedKnown}
              busy={firedBusy}
              onRetry={() => void refreshFired()}
              onSelectMarket={onSelectMarket}
              onDelete={deleteFired}
            />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}

function ActiveAlertsView({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
}: {
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
}) {
  if (error) {
    return (
      <div className="p-2">
        <ErrorBanner message={error} onRetry={onRetry} />
      </div>
    )
  }

  return (
    <ScrollArea className="h-full min-h-0">
      {alerts.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          No active alerts. Right-click a chart to add one.
        </p>
      ) : (
        <div className="grid">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex min-h-8 items-center gap-1 border-b px-3 hover:bg-muted"
            >
              <PriceAlertRow alert={alert} onSelectMarket={onSelectMarket} />
              <button
                type="button"
                aria-label={`Delete ${marketSymbol(alert.marketKey)} alert at ${formatPrice(alert.price)}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                onClick={() => onDelete(alert.id)}
              >
                <Trash2Icon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  )
}

function FiredAlertsView({
  alerts,
  error,
  known,
  busy,
  onRetry,
  onSelectMarket,
  onDelete,
}: {
  alerts: readonly FiredPriceAlert[]
  error: string | null
  known: boolean
  busy: boolean
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {error ? <ErrorBanner message={error} onRetry={onRetry} /> : null}
      <ScrollArea className="min-h-0 flex-1">
        {alerts.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            No alerts have fired yet.
          </p>
        ) : (
          <div className="grid">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex min-h-8 items-center gap-1 border-b px-3 hover:bg-muted"
              >
                <PriceAlertRow
                  alert={alert}
                  rightText={formatRelativeTime(
                    new Date(alert.firedAt),
                    formatDateTime
                  )}
                  rightTitle={formatDateTime(new Date(alert.firedAt))}
                  rightMuted
                  onSelectMarket={onSelectMarket}
                />
                <button
                  type="button"
                  aria-label={`Delete fired ${marketSymbol(alert.marketKey)} alert`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onDelete(alert.id)}
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
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
