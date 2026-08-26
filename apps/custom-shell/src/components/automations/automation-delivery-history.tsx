import * as React from "react"
import { ChevronDownIcon, Loader2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAutomationRunErrorMessage,
  listAutomationRunDeliveries,
  type AutomationRunDeliveryItem,
  type AutomationRunDeliveryPageItem,
} from "@/lib/api/automations/automation-runs"
import { formatDateTime } from "@/lib/format/format-time"
import { cn } from "@/lib/utils"

const DELIVERY_REFRESH_MS = 10_000

/** Resend results for one Send Email step, refreshed while its run is open. */
export function AutomationDeliveryHistory({
  runId,
  nodeId,
  polling,
}: {
  runId: string
  nodeId: string
  /** True only while the run can still change and its panel is visible. */
  polling: boolean
}) {
  const [page, setPage] = React.useState<AutomationRunDeliveryPageItem | null>(
    null
  )
  const [deliveries, setDeliveries] = React.useState<
    AutomationRunDeliveryItem[]
  >([])
  const [showRecipients, setShowRecipients] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadFirstPage = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const fresh = await listAutomationRunDeliveries(runId, nodeId, 0)
        setPage(fresh)
        setDeliveries((current) => {
          const freshIds = new Set(fresh.deliveries.map((row) => row.id))
          return [
            ...fresh.deliveries,
            ...current.slice(fresh.deliveries.length).filter((row) => !freshIds.has(row.id)),
          ]
        })
        setError(null)
      } catch (loadError) {
        setError(getAutomationRunErrorMessage(loadError))
      } finally {
        setLoading(false)
      }
    },
    [nodeId, runId]
  )

  React.useEffect(() => {
    const first = window.setTimeout(() => void loadFirstPage(true), 0)
    return () => window.clearTimeout(first)
  }, [loadFirstPage])

  React.useEffect(() => {
    if (!polling) return
    const timer = window.setInterval(
      () => void loadFirstPage(true),
      DELIVERY_REFRESH_MS
    )
    return () => window.clearInterval(timer)
  }, [loadFirstPage, polling])

  async function loadMore() {
    if (!page || loadingMore || deliveries.length >= page.total) return
    setLoadingMore(true)
    try {
      const next = await listAutomationRunDeliveries(
        runId,
        nodeId,
        deliveries.length
      )
      setPage(next)
      setDeliveries((current) => [...current, ...next.deliveries])
      setError(null)
    } catch (loadError) {
      setError(getAutomationRunErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  if (loading && !page) {
    return <LoadingRow label="Loading delivery results…" className="py-4" />
  }
  if (!page) {
    return error ? (
      <ErrorBanner
        message={error}
        onRetry={() => void loadFirstPage()}
      />
    ) : null
  }
  if (page.total === 0) return null

  return (
    <div className="grid min-w-0 gap-2 pt-1">
      {error ? (
        <ErrorBanner message={error} onRetry={() => void loadFirstPage()} />
      ) : null}
      <p className="text-xs font-medium" aria-live="polite">
        {page.sent} sent
        {page.failed ? ` · ${page.failed} failed` : ""} · {page.opened} opened ·{" "}
        {page.clicked} clicked
      </p>
      <p className="text-xs text-muted-foreground">
        Opens are estimates — many inboxes hide them or load them automatically.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="justify-self-start"
        aria-expanded={showRecipients}
        onClick={() => setShowRecipients((current) => !current)}
      >
        <ChevronDownIcon
          className={cn("transition-transform", !showRecipients && "-rotate-90")}
        />
        {showRecipients ? "Hide recipients" : `Show ${page.total} recipients`}
      </Button>

      {showRecipients ? (
        <div className="divide-y rounded-lg border bg-background">
          {deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="flex min-w-0 items-center gap-2 px-3 py-2"
            >
              <span
                className="min-w-0 flex-1 truncate text-xs"
                title={delivery.to_email}
              >
                {delivery.to_email}
              </span>
              <Badge
                variant={delivery.state === "failed" ? "destructive" : "secondary"}
                title={formatDateTime(delivery.occurred_at)}
              >
                {deliveryStateLabel(delivery.state)}
              </Badge>
            </div>
          ))}
          {deliveries.length < page.total ? (
            <div className="p-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Loader2Icon className="animate-spin" /> : null}
                Load more ({page.total - deliveries.length} remaining)
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function deliveryStateLabel(
  state: AutomationRunDeliveryItem["state"]
): string {
  return {
    sent: "Sent",
    delivered: "Delivered",
    opened: "Opened",
    clicked: "Clicked",
    failed: "Failed",
  }[state]
}
