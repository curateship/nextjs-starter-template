import * as React from "react"
import { BanknoteIcon, ClockIcon, CpuIcon } from "lucide-react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardGroup,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  changeRealMoneySwitch,
  changeWorkerSwitch,
  getWorkersErrorMessage,
  loadWorkers,
  restartWorker,
} from "@/lib/api/workers"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatRelativeTime } from "@/lib/format/format-time"
import {
  loadRememberedOrderStyle,
  saveRememberedOrderStyle,
} from "@/lib/api/quick-order"
import type { OrderStyle } from "@/lib/trade/order-style"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  WORKER_STATE_LABELS,
  type WorkersDashboard,
  type WorkerState,
  type WorkerStatus,
} from "@/lib/trade/workers"
import { cn } from "@/lib/utils"
import { LiquidationWarningSettings } from "@/components/workers/liquidation-warning-settings"
import { AsterMarginSettings } from "@/components/workers/aster-margin-settings"

/**
 * Is the trading engine running, the two switches for it, and the real-money
 * permission.
 *
 * The engine is a separate program from the website, so "is it up?" is a real
 * question with a real answer, and until this existed there was nowhere to ask
 * it. It works entirely off what the engine writes down every few seconds: a
 * copy that has died stops writing, and this says so rather than leaving you to
 * notice that a trade did not happen.
 *
 * A Settings tab rather than a page of its own, because that is where somebody
 * goes to change how the app behaves — and pausing the engine is exactly that.
 * It fetches its own answer instead of taking one from a loader: the tab is
 * only drawn when it is opened, and the answer changes without anybody
 * clicking.
 */

/** Often enough that a stopped engine is noticed, rarely enough to be cheap. */
const REFRESH_MS = 5_000

const STATE_TONE: Record<WorkerState, string> = {
  running: "text-emerald-600 dark:text-emerald-400",
  idle: "text-muted-foreground",
  paused: "text-amber-600 dark:text-amber-400",
  off: "text-muted-foreground",
  offline: "text-destructive",
}

export default function WorkersSettings() {
  const [data, setData] = React.useState<WorkersDashboard | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [orderStyle, setOrderStyle] = React.useState<OrderStyle>("rest")
  const [styleBusy, setStyleBusy] = React.useState(false)

  React.useEffect(() => {
    let stopped = false
    void loadRememberedOrderStyle()
      .then((answer) => {
        if (!stopped) setOrderStyle(answer.orderStyle)
      })
      // Falls back to resting, which is what it has always been. A setting
      // that failed to load must not silently change how orders are placed.
      .catch(() => {})
    return () => {
      stopped = true
    }
  }, [])

  const changeStyle = async (next: OrderStyle) => {
    const was = orderStyle
    setOrderStyle(next)
    setStyleBusy(true)
    try {
      await saveRememberedOrderStyle(next)
    } catch (error) {
      setOrderStyle(was)
      showErrorToast(getWorkersErrorMessage(error))
    } finally {
      setStyleBusy(false)
    }
  }

  React.useEffect(() => {
    let stopped = false
    const read = () =>
      void loadWorkers()
        .then((next) => {
          if (!stopped) setData(next)
        })
        // A refresh that fails is not worth interrupting anybody for — the next
        // is five seconds away, and the card says when it was last read.
        .catch(() => {})

    read()
    const timer = window.setInterval(read, REFRESH_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  const flip = async (
    worker: WorkerStatus,
    change: { enabled: boolean } | { paused: boolean }
  ) => {
    setBusy(true)
    try {
      setData(await changeWorkerSwitch({ kind: worker.kind, change }))
    } catch (thrown) {
      showErrorToast(getWorkersErrorMessage(thrown))
    } finally {
      setBusy(false)
    }
  }

  // Which worker the Restart question is open for, and whether the request
  // is on its way. The dialog owns the consequence sentence; the card's
  // "Doing now" line then says "Restart requested" until the engine picks the
  // mark up at the top of its next pass.
  const [restartAsking, setRestartAsking] = React.useState<WorkerStatus | null>(
    null
  )
  const [restartBusy, setRestartBusy] = React.useState(false)

  const confirmRestart = async () => {
    if (!restartAsking) return
    setRestartBusy(true)
    try {
      setData(await restartWorker(restartAsking.kind))
      setRestartAsking(null)
      toast.success(
        "Restart requested. The engine finishes its pass, stops, and is started again in a few seconds."
      )
    } catch (thrown) {
      showErrorToast(getWorkersErrorMessage(thrown))
    } finally {
      setRestartBusy(false)
    }
  }

  const flipRealMoney = async (on: boolean) => {
    setBusy(true)
    try {
      setData(await changeRealMoneySwitch(on))
    } catch (thrown) {
      showErrorToast(getWorkersErrorMessage(thrown))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Asking the server…</p>
  }

  return (
    <CardGroup>
      {data.workers.map((worker) => (
        <Card key={worker.kind}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CpuIcon className="size-4" />
              {worker.label}
            </CardTitle>
            <CardDescription>{worker.description}</CardDescription>
            <CardAction>
              <Badge variant="outline" className={STATE_TONE[worker.state]}>
                {WORKER_STATE_LABELS[worker.state]}
              </Badge>
            </CardAction>
          </CardHeader>

          <CardContent className="grid gap-4">
            {/* Said on the card, not as a toast. This is a STATE, not something
                that just went wrong: it stays true until somebody starts the
                engine, and a toast reappearing every five seconds as the
                wording ticks over would be unusable. */}
            {worker.state === "offline" && worker.enabled ? (
              <Notice>
                {worker.lastSeenAt
                  ? `Nothing has run since ${formatRelativeTime(worker.lastSeenAt)}. Ladders are not being worked — no rung will buy and no stop will fire until it is started again.`
                  : "This has never run. Ladders are not being worked — no rung will buy and no stop will fire until it is started."}
              </Notice>
            ) : null}

            {worker.latestError ? (
              <Notice>Last error: {worker.latestError}</Notice>
            ) : null}

            <dl className="grid gap-1 text-sm sm:grid-cols-2">
              <Line
                label="Doing now"
                value={
                  worker.restartRequested ? "Restart requested" : worker.activity
                }
              />
              <Line
                label="Last heard from"
                value={
                  worker.lastSeenAt
                    ? formatRelativeTime(worker.lastSeenAt)
                    : "Never"
                }
              />
              <Line
                label="Running since"
                value={
                  worker.startedAt ? formatRelativeTime(worker.startedAt) : "—"
                }
              />
              <Line label="Where" value={worker.host ?? "—"} />
              {worker.figures.map((figure) => (
                <Line
                  key={figure.label}
                  label={figure.label}
                  value={figure.value}
                />
              ))}
            </dl>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t pt-4">
              <SwitchRow
                id={`${worker.kind}-enabled`}
                label="Engine"
                checked={worker.enabled}
                disabled={busy}
                onChange={(on) => void flip(worker, { enabled: on })}
              />
              <SwitchRow
                id={`${worker.kind}-trading`}
                label="Trading"
                checked={worker.enabled && !worker.paused}
                disabled={busy || !worker.enabled}
                onChange={(on) => void flip(worker, { paused: !on })}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={busy}
                onClick={() => setRestartAsking(worker)}
              >
                Restart
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BanknoteIcon className="size-4" />
            Real-money trading
          </CardTitle>
          <CardDescription>
            Off refuses every real order. Practice and testnet always work.
          </CardDescription>
          <CardAction>
            <Badge
              variant="outline"
              className={cn(
                data.realMoney.masterAllowed && data.realMoney.enabled
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              )}
            >
              {!data.realMoney.masterAllowed
                ? "Locked off"
                : data.realMoney.enabled
                  ? "On"
                  : "Off"}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent>
          {data.realMoney.masterAllowed ? (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <SwitchRow
                id="real-money"
                label="Real money"
                checked={data.realMoney.enabled}
                disabled={busy}
                onChange={(on) => void flipRealMoney(on)}
              />
              <p className="text-xs text-muted-foreground">
                Only ever on in one place at a time.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Locked off by the server — only a deploy can allow real money
              here.
            </p>
          )}
        </CardContent>
      </Card>

      <LiquidationWarningSettings />

      <AsterMarginSettings />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="size-4" />
            How a plain order waits
          </CardTitle>
          <CardDescription>
            A right-clicked buy or sell either sits on the exchange until it
            fills, or waits here until the price is reached. Ladders and grids
            are unaffected — they have always been watched.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Select
            value={orderStyle}
            disabled={styleBusy}
            onValueChange={(next) => void changeStyle(next as OrderStyle)}
          >
            <SelectTrigger
              className="w-fit"
              aria-label="How a plain order waits"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rest">Rests on the exchange</SelectItem>
              <SelectItem value="watch">Watched by the engine</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {orderStyle === "rest"
              ? "It fills whether or not this app is running, and the money behind it is committed while it waits."
              : "Nothing reaches the exchange until the price is touched, so the money stays free and the level is nobody else's business — but it only fills while the engine above is running."}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Read {formatRelativeTime(data.checkedAt)}.
      </p>
      <ConfirmDialog
        open={restartAsking !== null}
        onOpenChange={(open) => {
          if (!open) setRestartAsking(null)
        }}
        title={`Restart ${restartAsking?.label ?? "the engine"}?`}
        description="The engine will finish its current pass, stop, and be started again by the server. Watched orders are not worked for a few seconds."
        confirmLabel="Restart"
        destructive={false}
        loading={restartBusy}
        onConfirm={() => void confirmRestart()}
      />
    </CardGroup>
  )
}

function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: string
  checked: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

/** A state worth reading on the card itself, rather than a passing toast. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 sm:justify-start sm:gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}
