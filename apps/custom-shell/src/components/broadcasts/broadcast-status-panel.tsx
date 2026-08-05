import * as React from "react"
import { PauseIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  getBroadcastErrorMessage,
  loadBroadcastDeliveries,
  pauseBroadcastSend,
  resumeBroadcastSend,
  type BroadcastDeliveryItem,
  type BroadcastDetail,
  type BroadcastStatus,
} from "@/lib/api/broadcasts"
import { describeAudienceFilter } from "@/lib/broadcasts/blocks"
import { describeNextBatch } from "@/lib/broadcasts/drip"
import { formatDateTime } from "@/lib/format-time"
import { cn } from "@/lib/utils"

const DELIVERY_PAGE_SIZE = 25

const STATUS_LABELS: Record<BroadcastStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
}

/**
 * The bottom panel: where this newsletter has got to.
 *
 * Everything that has to survive the panel being dragged shut lives in the
 * header row — the state and the counts — because that 46px strip is all that
 * is left on screen when it is collapsed, and "how far along is it" is exactly
 * the question you collapse the panel still wanting answered.
 */
export function BroadcastStatusPanel({
  broadcast,
  onUpdated,
}: {
  broadcast: BroadcastDetail
  onUpdated: (detail: BroadcastDetail) => void
}) {
  const [deliveries, setDeliveries] = React.useState<BroadcastDeliveryItem[]>([])
  const [hasMore, setHasMore] = React.useState(false)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [statusBusy, setStatusBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const started = broadcast.status !== "draft"
  const remaining = Math.max(
    0,
    broadcast.totalRecipients - broadcast.totalSent - broadcast.totalFailed
  )
  // Only while it is actually sending: a paused newsletter has a stale next
  // time on it, and promising a batch that is not coming is worse than silence.
  const nextBatch =
    broadcast.status === "sending"
      ? describeNextBatch(broadcast.next_batch_at)
      : null

  // Reload the list whenever the counts move, which is the signal that another
  // batch went out. A draft has nothing to show and never asks.
  const sentSoFar = broadcast.totalSent + broadcast.totalFailed
  React.useEffect(() => {
    if (!started) return
    let cancelled = false
    loadBroadcastDeliveries(broadcast.id, { limit: DELIVERY_PAGE_SIZE })
      .then((page) => {
        if (cancelled) return
        setDeliveries(page.deliveries)
        setHasMore(page.hasMore)
        setError(null)
      })
      .catch((loadError) => {
        if (cancelled) return
        setError(getBroadcastErrorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [broadcast.id, started, sentSoFar])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const page = await loadBroadcastDeliveries(broadcast.id, {
        limit: DELIVERY_PAGE_SIZE,
        offset: deliveries.length,
      })
      setDeliveries((current) => [...current, ...page.deliveries])
      setHasMore(page.hasMore)
      setError(null)
    } catch (loadError) {
      setError(getBroadcastErrorMessage(loadError))
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleStatus = async () => {
    setStatusBusy(true)
    try {
      const detail =
        broadcast.status === "sending"
          ? await pauseBroadcastSend(broadcast.id)
          : await resumeBroadcastSend(broadcast.id)
      onUpdated(detail)
      toast.success(
        detail.status === "paused"
          ? "Paused. Nobody else will get it until you start it again."
          : "Started again. It picks up where it left off."
      )
    } catch (statusError) {
      toast.error(getBroadcastErrorMessage(statusError))
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-foreground/10 px-3">
        <span className="text-sm font-medium">Sending</span>
        <Badge variant={broadcast.status === "paused" ? "destructive" : "secondary"}>
          {STATUS_LABELS[broadcast.status]}
        </Badge>
        {/* This strip is all that is left when the panel is dragged shut, so
            everything you collapse it still wanting to know lives here — how
            far along it is, and when the next batch goes. */}
        <span className="truncate text-xs text-muted-foreground">
          {started
            ? `${broadcast.totalSent} of ${broadcast.totalRecipients} sent` +
              (broadcast.totalFailed > 0
                ? ` · ${broadcast.totalFailed} did not go through`
                : "") +
              (nextBatch ? ` · ${nextBatch}` : "")
            : "Not sent yet"}
        </span>
        {broadcast.status === "sending" || broadcast.status === "paused" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-8"
            disabled={statusBusy}
            onClick={() => void toggleStatus()}
          >
            {broadcast.status === "sending" ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
            {broadcast.status === "sending" ? "Pause" : "Start again"}
          </Button>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {error ? <ErrorBanner message={error} /> : null}

          {broadcast.pausedReason ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {broadcast.pausedReason}
            </p>
          ) : null}

          {started ? (
            <>
              <ProgressBar
                sent={broadcast.totalSent}
                failed={broadcast.totalFailed}
                total={broadcast.totalRecipients}
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
                <Stat label="Sent" value={broadcast.totalSent} />
                <Stat label="Did not go through" value={broadcast.totalFailed} />
                <Stat label="Still to go" value={remaining} />
                <Stat label="Everyone" value={broadcast.totalRecipients} />
                <Stat label="Batches" value={broadcast.batchesSent} />
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing has gone out yet. Everything you write is saved as you go —
              use Review and send when it is ready.
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            {describeAudienceFilter(broadcast.audienceFilter)}
            {broadcast.scheduled_at
              ? ` · Goes out ${formatDateTime(broadcast.scheduled_at)}`
              : ""}
            {broadcast.sent_at
              ? ` · Finished ${formatDateTime(broadcast.sent_at)}`
              : ""}
          </p>

          {started && deliveries.length > 0 ? (
            <div className="grid gap-1">
              {deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex items-center gap-2 rounded-md border border-foreground/5 px-2 py-1.5 text-sm"
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      delivery.status === "sent" ? "bg-emerald-500" : "bg-destructive"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{delivery.toEmail}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {delivery.status === "sent"
                      ? formatDateTime(delivery.created_at)
                      : (delivery.error ?? "Did not go through")}
                  </span>
                </div>
              ))}
              {hasMore ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1 justify-self-start"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function ProgressBar({
  sent,
  failed,
  total,
}: {
  sent: number
  failed: number
  total: number
}) {
  const safeTotal = Math.max(total, 1)
  const sentWidth = Math.min(100, (sent / safeTotal) * 100)
  const failedWidth = Math.min(100 - sentWidth, (failed / safeTotal) * 100)

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${sent} of ${total} sent, ${failed} did not go through`}
    >
      <div className="bg-emerald-500" style={{ width: `${sentWidth}%` }} />
      <div className="bg-destructive" style={{ width: `${failedWidth}%` }} />
    </div>
  )
}
