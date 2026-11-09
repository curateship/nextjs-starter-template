import * as React from "react"

import {
  PriceAlertsPanelContent,
  type FiredPriceAlertsControl,
  type LineAlertsForPanel,
} from "@/components/trade/price-alerts-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { clearAlerts, getClearAlertsErrorMessage } from "@/lib/api/trade/alerts"
import type { PriceAlert } from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Active and fired chart alerts, the Alerts tab of the Trade dashboard page's
 * ⋮ (8 Nov 2026; a block on the page until then). It has no count of its own:
 * a fired alert is told by the bell's notification tray.
 */
export function PriceAlertsMenu({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
  lines,
  fired,
  onCleared,
}: {
  /**
   * The fired alerts, read by the dashboard rather than by this list, so
   * reopening the Alerts tab shows them at once instead of reading them again
   * (Tyler, 8 Nov 2026: "Why does this amount kept loading if i go back to
   * it").
   */
  fired: FiredPriceAlertsControl
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines: LineAlertsForPanel
  onCleared: () => Promise<void>
}) {
  const [clearing, setClearing] = React.useState(false)
  const [confirmClear, setConfirmClear] = React.useState<
    "active" | "fired" | null
  >(null)
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
