"use client"

import * as React from "react"
import { GaugeIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { formatApiUsageFeature } from "@/lib/api-usage-format"
import {
  getApiUsageErrorMessage,
  getCurrentApiUsageSummary,
  listCurrentApiUsageEvents,
  type ApiUsageEventItem,
  type ApiUsageSummary,
} from "@/lib/api/api-usage"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
})

export function ApiUsageIndicator() {
  const [open, setOpen] = React.useState(false)
  const [summary, setSummary] = React.useState<ApiUsageSummary | null>(null)
  const [events, setEvents] = React.useState<ApiUsageEventItem[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = React.useState(false)
  const [loadingEvents, setLoadingEvents] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const percent = summary
    ? Math.min(
        100,
        Math.round((summary.used_credits / summary.limit_credits) * 100)
      )
    : 0

  const loadSummary = React.useCallback(async () => {
    setLoadingSummary(true)
    setError(null)
    try {
      setSummary(await getCurrentApiUsageSummary())
    } catch (loadError) {
      setError(getApiUsageErrorMessage(loadError))
    } finally {
      setLoadingSummary(false)
    }
  }, [])

  const loadEvents = React.useCallback(async (cursor?: string) => {
    setLoadingEvents(true)
    setError(null)
    try {
      const data = await listCurrentApiUsageEvents({
        cursor,
        limit: PAGE_SIZE,
      })
      setEvents((current) =>
        cursor ? [...current, ...data.events] : data.events
      )
      setNextCursor(data.next_cursor)
    } catch (loadError) {
      setError(getApiUsageErrorMessage(loadError))
    } finally {
      setLoadingEvents(false)
    }
  }, [])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void loadSummary(), 0)
    return () => window.clearTimeout(timeout)
  }, [loadSummary])

  React.useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => {
      void loadSummary()
      void loadEvents()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadEvents, loadSummary, open])

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-[30px] gap-1.5 px-2.5",
          summary?.status === "warning" && "border-amber-300 text-amber-700",
          summary?.status === "blocked" &&
            "border-destructive/40 text-destructive"
        )}
        onClick={() => setOpen(true)}
        aria-label="Open API usage"
      >
        {loadingSummary && !summary ? (
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <GaugeIcon className="h-3.5 w-3.5" />
        )}
        <span className="hidden text-xs font-medium sm:inline">
          {summary
            ? `${summary.used_credits}/${summary.limit_credits}`
            : "Credits"}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>API Usage</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-5">
            {summary ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {monthFormatter.format(new Date(summary.period_start))}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {summary.remaining_credits} credits left
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {summary.used_credits} / {summary.limit_credits}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {summary.status}
                    </p>
                  </div>
                </div>
                <Progress value={percent} />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                Loading usage
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium">Recent usage</h3>
              {events.length ? (
                <div className="divide-y rounded-md border">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {formatApiUsageFeature(event.feature)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {event.provider}
                          {event.model ? ` · ${event.model}` : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{event.credits} credits</p>
                        <p>
                          {dateFormatter.format(new Date(event.created_at))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">
                  No usage yet
                </div>
              )}
              {error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!nextCursor || loadingEvents}
              onClick={() => nextCursor && void loadEvents(nextCursor)}
            >
              {loadingEvents ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Load more
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
