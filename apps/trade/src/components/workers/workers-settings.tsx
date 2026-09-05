import * as React from "react"

import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
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
} from "@/lib/api/trade/workers"
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
} from "@/lib/api/trade/quick-order"
import { DEFAULT_ORDER_STYLE, type OrderStyle } from "@/lib/trade/order-style"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  WORKER_STATE_LABELS,
  type WorkersDashboard,
  type WorkerState,
  type WorkerStatus,
} from "@/lib/trade/workers"
import { cn } from "@/lib/utils"
import { EngineErrorsCard } from "@/components/workers/engine-errors-card"
import { LiquidationWarningSettings } from "@/components/workers/liquidation-warning-settings"
import { AsterMarginSettings } from "@/components/workers/aster-margin-settings"
import { useTradingEngineSettingsBootstrap } from "@/components/workers/trading-engine-settings-context"

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
 * goes to change how the app behaves. The route provides the first answer and
 * the browser refreshes it while the page stays open.
 */

/** Often enough that a stopped engine is noticed, rarely enough to be cheap. */
const REFRESH_MS = 5_000

const STATE_TONE: Record<WorkerState, string> = {
  running:
    "border-emerald-600/20 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400",
  idle: "text-muted-foreground",
  paused:
    "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  off: "text-muted-foreground",
  offline: "border-destructive/20 bg-destructive/5 text-destructive",
}

const STATE_DOT: Record<WorkerState, string> = {
  running: "bg-emerald-600 dark:bg-emerald-400",
  idle: "bg-muted-foreground",
  paused: "bg-amber-500",
  off: "bg-muted-foreground",
  offline: "bg-destructive",
}

export default function WorkersSettings() {
  const bootstrap = useTradingEngineSettingsBootstrap()
  const [data, setData] = React.useState<WorkersDashboard | null>(
    bootstrap?.workers ?? null
  )
  const [busy, setBusy] = React.useState(false)
  const [orderStyle, setOrderStyle] = React.useState<OrderStyle>(
    bootstrap?.orderStyle ?? DEFAULT_ORDER_STYLE
  )
  const [styleBusy, setStyleBusy] = React.useState(false)
  const [dismissedError, setDismissedError] = React.useState<string | null>(
    null
  )

  React.useEffect(() => {
    if (bootstrap) return
    let stopped = false
    void loadRememberedOrderStyle()
      .then((answer) => {
        if (!stopped) setOrderStyle(answer.orderStyle)
      })
      // Keep the default already on screen if the fallback route cannot read
      // the saved choice. A failed read must not move the control underneath
      // somebody.
      .catch(() => {})
    return () => {
      stopped = true
    }
  }, [bootstrap])

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

    if (!bootstrap) read()
    const timer = window.setInterval(read, REFRESH_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [bootstrap])

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
    return null
  }

  return (
    <CardGroup>
      {data.workers.map((worker) => {
        const figures = Object.fromEntries(
          worker.figures.map((figure) => [figure.label, figure.value])
        )
        const showError =
          worker.latestError && worker.latestError !== dismissedError

        return (
          <Card key={worker.kind} className="gap-0 py-0">
            <CardHeader className="border-b px-4 pt-3 [.border-b]:pb-3">
              <CardTitle>{worker.label}</CardTitle>
              <CardAction className="row-span-1">
                <Badge variant="outline" className={STATE_TONE[worker.state]}>
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      STATE_DOT[worker.state]
                    )}
                    aria-hidden="true"
                  />
                  {WORKER_STATE_LABELS[worker.state]}
                </Badge>
              </CardAction>
            </CardHeader>

            <CardContent className="grid gap-5 p-4 pt-3">
              {worker.state === "offline" && worker.enabled ? (
                <Notice>
                  {worker.lastSeenAt
                    ? `Nothing has run since ${formatRelativeTime(worker.lastSeenAt)}. Ladders are not being worked. No rung will buy and no stop will fire until the engine starts again.`
                    : "The engine has never run. Ladders are not being worked. No rung will buy and no stop will fire until the engine starts."}
                </Notice>
              ) : null}

              {showError ? (
                <Notice
                  action={
                    <button
                      type="button"
                      className="shrink-0 underline underline-offset-2"
                      onClick={() => setDismissedError(worker.latestError)}
                    >
                      Dismiss
                    </button>
                  }
                >
                  Last error · {worker.latestError}
                </Notice>
              ) : null}

              <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                <Line
                  label="Doing now"
                  value={
                    worker.restartRequested
                      ? "Restart requested"
                      : worker.activity
                  }
                />
                <Line
                  label="Running since"
                  value={
                    worker.startedAt
                      ? formatRelativeTime(worker.startedAt)
                      : "—"
                  }
                />
                <Line
                  label="Ladders working"
                  value={figures["Ladders working"] ?? "—"}
                />
                <Line
                  label="Last heard from"
                  value={
                    worker.lastSeenAt
                      ? formatRelativeTime(worker.lastSeenAt)
                      : "Never"
                  }
                />
                <Line label="Where" value={worker.host ?? "—"} />
                <Line label="Build" value={figures.Build ?? "Not reported"} />
                <Line
                  label="Copies alive"
                  value={figures["Copies alive"] ?? "—"}
                />
              </dl>

              <PriceFeeds value={figures.Prices ?? "Not reported"} />
            </CardContent>

            <CardFooter className="flex flex-wrap gap-x-8 gap-y-3 p-4">
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
                className="ml-auto"
                disabled={busy}
                onClick={() => setRestartAsking(worker)}
              >
                Restart
              </Button>
            </CardFooter>
          </Card>
        )
      })}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b p-4">
          <CardTitle>Safety</CardTitle>
        </CardHeader>

        <CardContent className="px-0">
          <div className="p-4">
            <h3 className="font-medium">Real money</h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Off refuses every real order. Practice and testnet always work.
              Only ever on in one place at a time.
            </p>
          </div>
          <LiquidationWarningSettings
            initialValue={bootstrap?.liquidationWarning}
          />
        </CardContent>

        <CardFooter className="justify-between p-4">
          {data.realMoney.masterAllowed ? (
            <SwitchRow
              id="real-money"
              label="Real money"
              checked={data.realMoney.enabled}
              disabled={busy}
              onChange={(on) => void flipRealMoney(on)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              The server has locked real money off.
            </p>
          )}
          <span
            className={cn(
              "text-sm font-medium",
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
          </span>
        </CardFooter>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="border-b p-4">
          <CardTitle>Orders</CardTitle>
        </CardHeader>

        <CardContent className="px-0">
          <AsterMarginSettings initialWallets={bootstrap?.asterMargins} />

          <div className="grid gap-4 border-t p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div>
              <h3 className="font-medium">How a plain order waits</h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                A right-clicked buy or sell either sits on the exchange until it
                fills, or waits here until the price is reached. Ladders and
                grids are unaffected. They have always been watched.
              </p>
            </div>
            <Select
              value={orderStyle}
              disabled={styleBusy}
              onValueChange={(next) => void changeStyle(next as OrderStyle)}
            >
              <SelectTrigger aria-label="How a plain order waits">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rest">Rests on the exchange</SelectItem>
                <SelectItem value="watch">Watched by the engine</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {bootstrap ? <EngineErrorsCard errors={bootstrap.engineErrors} /> : null}

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
function Notice({
  children,
  action,
}: {
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p>{children}</p>
      {action}
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 font-medium tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  )
}

function PriceFeeds({ value }: { value: string }) {
  const feeds = value.split(" · ").map((feed) => {
    const [name, ...rest] = feed.split(": ")
    return { name, detail: rest.join(": ") || "Not reported" }
  })

  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Prices
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {feeds.map((feed) => {
          const live = feed.detail.startsWith("live")
          return (
            <Badge
              key={`${feed.name}-${feed.detail}`}
              variant="outline"
              className="h-7 gap-2 px-3 text-sm"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "bg-emerald-600" : "bg-amber-500"
                )}
                aria-hidden="true"
              />
              <span>{feed.name}</span>
              <span className="font-normal text-muted-foreground">
                {feed.detail}
              </span>
            </Badge>
          )
        })}
      </div>
    </div>
  )
}
