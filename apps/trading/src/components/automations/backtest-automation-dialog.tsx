import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  XCircleIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  loadBacktest,
  runBacktest,
  type BacktestGroupRun,
} from "@/lib/api/backtests"
import { useBinanceMarketRows } from "@/lib/backtest/binance-markets"
import { MAX_EXTRA_MARKETS, maxWindowDays } from "@/lib/backtest/types"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"

import { summarizeGroupProgress } from "./backtest-progress"

const POLL_MS = 2000

/**
 * The one way to launch a backtest: pick markets + days for a saved
 * Automation. Everything else (interval, strategy, fees, starting capital)
 * comes from the Automation itself, so results are always comparable.
 */
export function BacktestAutomationDialog({
  open,
  onOpenChange,
  automationId,
  automationName,
  interval,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  automationId: string
  automationName: string
  interval: AutomationInterval
}) {
  const router = useRouter()
  const markets = useBinanceMarketRows()
  const [selected, setSelected] = React.useState<string[]>(["BTC"])
  const [days, setDays] = React.useState("30")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [groupId, setGroupId] = React.useState<string | null>(null)
  const [runs, setRuns] = React.useState<BacktestGroupRun[]>([])

  const maxDays = maxWindowDays(interval)
  const progress = summarizeGroupProgress(runs)

  // Fresh form every time the dialog opens.
  React.useEffect(() => {
    if (!open) return
    setSelected(["BTC"])
    setDays("30")
    setBusy(false)
    setError(null)
    setGroupId(null)
    setRuns([])
  }, [open])

  // Progress phase: poll the group until every market lands, then open the
  // result page. Closing the dialog stops polling but never stops the runs —
  // the server queue keeps draining in the background.
  React.useEffect(() => {
    if (!open || !groupId) return
    let cancelled = false
    const poll = () => {
      if (document.visibilityState !== "visible") return
      void loadBacktest(groupId)
        .then((response) => {
          if (cancelled) return
          setRuns(response.groupRuns)
          const status = summarizeGroupProgress(response.groupRuns)
          if (status.allTerminal) {
            cancelled = true
            clearInterval(timer)
            onOpenChange(false)
            void router.navigate({
              to: "/backtest/$groupId",
              params: { groupId },
            })
          }
        })
        .catch(() => {
          // Transient load errors: keep polling; the queue is unaffected.
        })
    }
    const timer = setInterval(poll, POLL_MS)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    poll()
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [groupId, onOpenChange, open, router])

  const availableMarkets = markets.filter((row) => !selected.includes(row.coin))

  const submit = async () => {
    if (busy) return
    const windowDays = Number(days)
    if (
      !Number.isInteger(windowDays) ||
      windowDays < 1 ||
      windowDays > maxDays
    ) {
      setError(
        `Days must be a whole number between 1 and ${maxDays} for ${interval} candles.`
      )
      return
    }
    if (selected.length === 0) {
      setError("Pick at least one market.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { backtestId } = await runBacktest({
        automationId,
        market: selected[0],
        extraMarkets: selected.slice(1),
        windowDays,
      })
      setGroupId(backtestId)
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Could not start the backtest."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Backtest {automationName}</DialogTitle>
          <DialogDescription>
            {groupId
              ? "Replaying the Automation on each market. You can close this — it keeps running in the background."
              : `Pick the markets and how many days to replay. Runs on ${interval} candles with this Automation's saved capital and fees.`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {groupId ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {progress.done} of {progress.total} market
                  {progress.total === 1 ? "" : "s"} complete
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {runs.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2Icon className="size-4 animate-spin" />
                    Queuing markets…
                  </div>
                ) : (
                  runs.map((run) => (
                    <div
                      key={run.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <RunStatusIcon status={run.status} />
                      <span className="font-mono">{run.market}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {STATUS_LABELS[run.status]}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Markets</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label>
                    Selected{" "}
                    <span className="font-normal text-muted-foreground">
                      (one run per market · max {MAX_EXTRA_MARKETS + 1})
                    </span>
                  </Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selected.map((coin) => (
                      <Badge
                        key={coin}
                        variant="secondary"
                        className="gap-1 font-mono"
                      >
                        {coin}
                        <button
                          type="button"
                          aria-label={`Remove ${coin}`}
                          onClick={() =>
                            setSelected((current) =>
                              current.filter((c) => c !== coin)
                            )
                          }
                        >
                          <XIcon className="size-3" />
                        </button>
                      </Badge>
                    ))}
                    {availableMarkets.length > 0 &&
                    selected.length < MAX_EXTRA_MARKETS + 1 ? (
                      <Select
                        value=""
                        onValueChange={(coin) =>
                          setSelected((current) =>
                            current.includes(coin)
                              ? current
                              : [...current, coin]
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-36">
                          <SelectValue placeholder="Add market" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMarkets.slice(0, 100).map((row) => (
                            <SelectItem key={row.coin} value={row.coin}>
                              {row.coin}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Window</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-1.5">
                  <Label htmlFor="backtest-days">
                    Days{" "}
                    <span className="font-normal text-muted-foreground">
                      (max {maxDays} at {interval})
                    </span>
                  </Label>
                  <Input
                    id="backtest-days"
                    type="number"
                    min={1}
                    max={maxDays}
                    step={1}
                    className="w-32"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                  />
                </CardContent>
              </Card>
            </>
          )}

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {groupId ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close — keeps running in the background
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Test
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STATUS_LABELS: Record<BacktestGroupRun["status"], string> = {
  pending: "Waiting",
  running: "Running",
  done: "Done",
  error: "Failed",
}

function RunStatusIcon({ status }: { status: BacktestGroupRun["status"] }) {
  if (status === "done") {
    return <CheckCircle2Icon className="size-4 text-emerald-500" />
  }
  if (status === "error") {
    return <XCircleIcon className="size-4 text-destructive" />
  }
  if (status === "running") {
    return <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
  }
  return <CircleDashedIcon className="size-4 text-muted-foreground" />
}
