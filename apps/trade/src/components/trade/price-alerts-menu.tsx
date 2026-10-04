import * as React from "react"
import { SirenIcon } from "lucide-react"

import {
  PriceAlertsPanelContent,
  useFiredPriceAlerts,
  type LineAlertsForPanel,
} from "@/components/trade/price-alerts-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { clearAlerts, getClearAlertsErrorMessage } from "@/lib/api/trade/alerts"
import type { PriceAlert } from "@/lib/trade/price-alerts"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Active and fired chart alerts, opened with a click on the siren beside the
 * market. A siren, not a bell, so it never reads as the notifications bell a
 * few buttons along, and a click, not a hover, so the pointer passing over the
 * header on its way somewhere else opens nothing.
 */
export function PriceAlertsMenu({
  alerts,
  error,
  onRetry,
  onSelectMarket,
  onDelete,
  lines,
  onCleared,
  renderTrigger,
}: {
  /**
   * A line in the phone's market menu, in place of the siren button. It is
   * handed the count so the line can carry the same red number.
   */
  renderTrigger?: (firedCount: number) => React.ReactElement
  alerts: readonly PriceAlert[]
  error: string | null
  onRetry: () => void
  onSelectMarket: (marketKey: string) => void
  onDelete: (id: string) => void
  lines: LineAlertsForPanel
  onCleared: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
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
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Both ways round. Opening counts what is on screen as seen, and
          // closing catches anything that fired while the menu was up. Only
          // ids still in the fired list are kept, so the list cannot grow
          // without end as old alerts are binned.
          setSeen(firedIds)
          setOpen(next)
        }}
      >
        <PopoverTrigger asChild>
          {renderTrigger ? (
            renderTrigger(firedCount)
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative bg-muted/60 dark:bg-muted/60"
              aria-label={
                firedCount > 0
                  ? `Open alerts, ${firedCount} fired`
                  : "Open alerts"
              }
            >
              <SirenIcon className="size-4" />
              {firedCount > 0 ? (
                <Badge
                  variant="destructive"
                  aria-hidden
                  className="pointer-events-none absolute -top-1 -right-1 min-w-5 border-2 border-background px-1 text-[0.625rem] leading-none font-semibold tabular-nums"
                >
                  {firedCount > 99 ? "99+" : firedCount}
                </Badge>
              ) : null}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={12}
          sideOffset={8}
          style={{
            maxHeight: "var(--radix-popover-content-available-height)",
          }}
          className="h-[28rem] w-[calc(100vw-2rem)] max-w-96 gap-0 overflow-hidden p-0"
        >
          <PriceAlertsPanelContent
            alerts={alerts}
            error={error}
            onRetry={onRetry}
            // Both of these put a market on the chart and leave the menu
            // up, so a list of alerts can be walked down one row at a time.
            // A click outside the menu closes it, and so does Escape.
            // A row for another exchange is the exception: it opens that
            // exchange's screen, and the menu goes with the old page.
            onSelectMarket={onSelectMarket}
            onDelete={onDelete}
            lines={lines}
            fired={fired}
            onClear={(kind) => {
              setOpen(false)
              setConfirmClear(kind)
            }}
            clearing={clearing}
          />
        </PopoverContent>
      </Popover>
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
    </>
  )
}
