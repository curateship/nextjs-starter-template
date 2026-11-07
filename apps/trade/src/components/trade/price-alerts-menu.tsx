import * as React from "react"

import {
  PriceAlertsPanelContent,
  useFiredPriceAlerts,
  type LineAlertsForPanel,
} from "@/components/trade/price-alerts-panel"
import {
  useBlockCount,
  useBlockOpen,
} from "@/components/trade/notes/trade-block-views"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { clearAlerts, getClearAlertsErrorMessage } from "@/lib/api/trade/alerts"
import type { PriceAlert } from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Active and fired chart alerts, the dashboard's Alerts block (the Admin 3
 * panel design, 7 Nov 2026). The block's heading carries the count of alerts
 * fired since the block was last open, and an open block counts what it shows
 * as seen.
 */
export function PriceAlertsMenu({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
  lines,
  onCleared,
}: {
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines: LineAlertsForPanel
  onCleared: () => Promise<void>
}) {
  const open = useBlockOpen()
  const [clearing, setClearing] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState<
    "active" | "fired" | null
  >(null)
  const fired = useFiredPriceAlerts()
  // **Opening the menu clears the red count** (Tyler, 29 Sep 2026). The fired
  // alerts stay in the list until they are cleared or binned, so the count on
  // the siren is what has fired since it was last looked at, not how many rows
  // the Fired tab holds. Anything that fires afterwards brings it back.
  const [seen, setSeen] = React.useState<readonly string[]>([])
  const firedIds = React.useMemo(
    () => [
      ...fired.alerts.map((alert) => alert.id),
      ...lines.fired.map((alert) => alert.id),
    ],
    [fired.alerts, lines.fired]
  )
  const firedCount = open
    ? 0
    : firedIds.filter((id) => !seen.includes(id)).length
  const clear = React.useCallback(
    async (kind: "active" | "fired") => {
      if (clearing) return
      setClearing(true)
      try {
        await clearAlerts(kind)
        await Promise.all([onCleared(), fired.refresh()])
      } catch (caught) {
        showErrorToast(getClearAlertsErrorMessage(caught))
      } finally {
        setClearing(false)
      }
    },
    [clearing, fired, onCleared]
  )
  // An open block counts what it shows as seen, as opening the menu does.
  const seenKey = firedIds.join(",")
  React.useEffect(() => {
    if (open) setSeen(seenKey ? seenKey.split(",") : [])
  }, [open, seenKey])
  useBlockCount(firedCount)
  const content = (
    <PriceAlertsPanelContent
      alerts={alerts}
      error={error}
      onRetry={onRetry}
      // Both of these put a market on the chart and leave the list up, so a
      // list of alerts can be walked down one row at a time. A row for
      // another exchange is the exception: it opens that exchange's screen.
      onSelectMarket={onSelectMarket}
      onDelete={onDelete}
      lines={lines}
      fired={fired}
      onClear={setConfirmClear}
      clearing={clearing}
    />
  )
  const confirm = (
    <ConfirmDialog
      open={confirmClear !== null}
      onOpenChange={(next) => !next && setConfirmClear(null)}
      title={
        confirmClear === "active"
          ? "Clear every active alert?"
          : "Clear all fired alerts?"
      }
      description={
        confirmClear === "active"
          ? "Every active price and drawing alert goes. The drawings stay on the chart, and this cannot be undone."
          : "Every saved fired price and drawing alert goes. The drawings stay on the chart, and this cannot be undone."
      }
      confirmLabel="Clear all"
      loading={clearing}
      onConfirm={() => {
        if (!confirmClear) return
        const kind = confirmClear
        setConfirmClear(null)
        void clear(kind)
      }}
    />
  )
  return (
    <>
      <div className="flex h-80 min-h-0 flex-col overflow-hidden">{content}</div>
      {confirm}
    </>
  )
}
