import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import {
  BotIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  botBadgeState,
  COMMAND_LABELS,
  EXPECTED_STATUS,
  SUCCESS_TEXT,
} from "@/components/bots/bot-status"
import {
  buildFleetSummaries,
  pileupKey,
} from "@/components/bots/fleet-overview"
import { useBotCommandToasts } from "@/components/bots/use-bot-command-toasts"
import { WorkerOfflineBanner } from "@/components/bots/worker-offline-banner"
import { GuardianBanner } from "@/components/bots/guardian-banner"
import {
  FleetOverviewStrip,
  type FleetFilter,
} from "@/components/bots/fleet-overview-strip"
import { NewBotDialog } from "@/components/bots/new-bot-dialog"
import { DashboardTable } from "@/components/dashboard-table"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  deleteBot,
  getBotErrorMessage,
  loadBots,
  sendCommand,
  sendGlobalCommand,
  type BotListItem,
  type BotListResponse,
} from "@/lib/api/bots"
import { guardianTableStatus } from "@/lib/trading/guardian"
import { useIntervalLoader } from "@/lib/use-interval-loader"
import { cn } from "@/lib/utils"

type PendingGlobal = "pause_all" | "flatten_all"

export function FleetDashboard({ initial }: { initial: BotListResponse }) {
  const router = useRouter()
  const { data, refresh } = useIntervalLoader(loadBots, initial)
  const [busyBotId, setBusyBotId] = React.useState<string | null>(null)
  const [pendingGlobal, setPendingGlobal] = React.useState<PendingGlobal | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<BotListItem | null>(null)
  const [newBotOpen, setNewBotOpen] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [fleetFilter, setFleetFilter] = React.useState<FleetFilter | null>(null)

  const summaries = React.useMemo(
    () => buildFleetSummaries(data.bots),
    [data.bots]
  )
  const visibleBots = React.useMemo(
    () =>
      fleetFilter
        ? data.bots.filter((bot) => fleetFilter.botIds.includes(bot.id))
        : data.bots,
    [data.bots, fleetFilter]
  )

  // A pile-up filter can outlive its pile-up (positions close, bots change on
  // the next poll). Drop it as soon as the pile-up is gone — otherwise the
  // table stays filtered with no chip left on screen to clear it.
  React.useEffect(() => {
    if (!fleetFilter) return
    const stillExists = summaries.some((summary) =>
      summary.pileups.some(
        (pileup) => pileupKey(summary.mode, pileup) === fleetFilter.key
      )
    )
    if (!stillExists) setFleetFilter(null)
  }, [summaries, fleetFilter])
  const trackCommand = useBotCommandToasts(data.bots)

  async function runCommand(
    bot: BotListItem,
    command: "start" | "stop" | "pause" | "resume" | "flatten"
  ) {
    setBusyBotId(bot.id)
    setError(null)
    try {
      const response = await sendCommand(bot.id, command)
      const label = COMMAND_LABELS[command]
      if (!response.workerOnline) {
        toast(`Worker offline — ${label.toLowerCase()} queued for ${bot.name}.`)
      } else if (command === "flatten") {
        // Flatten's real effect (closing the position) isn't visible in the
        // status when the bot is already paused, so confirm the send instead.
        toast.success(
          `Flatten sent — ${bot.name} closes its position and pauses.`
        )
      } else {
        trackCommand(bot.id, {
          ids: [bot.id],
          isDone: (watched) => watched.status === EXPECTED_STATUS[command],
          successText: `${bot.name} ${SUCCESS_TEXT[command]}.`,
          commandLabel: `${label} for ${bot.name}`,
        })
      }
      await refresh()
    } catch (error) {
      setError(getBotErrorMessage(error))
    } finally {
      setBusyBotId(null)
    }
  }

  async function confirmGlobal() {
    if (!pendingGlobal) return
    setBusy(true)
    setError(null)
    const command = pendingGlobal
    const label = command === "flatten_all" ? "Flatten all" : "Pause all"
    // The command only touches bots that are running when it lands, so those
    // are the ones whose convergence proves it worked.
    const runningIds = data.bots
      .filter((bot) => bot.status === "running" || bot.status === "starting")
      .map((bot) => bot.id)
    try {
      const response = await sendGlobalCommand(command)
      setPendingGlobal(null)
      if (!response.workerOnline) {
        toast(`Worker offline — ${label.toLowerCase()} queued.`)
      } else if (runningIds.length === 0) {
        toast.success("No bots were running — nothing to do.")
      } else {
        trackCommand("global", {
          ids: runningIds,
          isDone: (watched) =>
            watched.status !== "running" && watched.status !== "starting",
          successText:
            command === "flatten_all"
              ? "All bots flattened and paused."
              : "All bots paused.",
          commandLabel: label,
        })
      }
      await refresh()
    } catch (error) {
      setError(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusy(true)
    setError(null)
    try {
      await deleteBot(pendingDelete.id)
      await refresh()
      setPendingDelete(null)
    } catch (error) {
      setError(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full">
      {!data.workerOnline ? (
        <WorkerOfflineBanner className="mt-4 rounded-md border px-3 py-2 text-sm" />
      ) : null}
      <GuardianBanner guardian={data.guardian} onChanged={refresh} />
      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {summaries.length > 0 ? (
        <div className="mb-2 md:mb-3">
          <FleetOverviewStrip
            summaries={summaries}
            filter={fleetFilter}
            onFilterChange={setFleetFilter}
          />
        </div>
      ) : null}

      <DashboardTable
        title="Bots"
        icon={<BotIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={visibleBots.length}
        status={guardianTableStatus(data.guardian)}
        controls={
          <>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setPendingGlobal("pause_all")}
            >
              <PauseIcon className="size-4" />
              Pause all
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              onClick={() => setPendingGlobal("flatten_all")}
            >
              <SquareIcon className="size-4" />
              Flatten all
            </DashboardToolbarButton>
            <DashboardToolbarButton
              type="button"
              onClick={() => setNewBotOpen(true)}
            >
              <PlusIcon className="size-4" />
              New Bot
            </DashboardToolbarButton>
          </>
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Bot</TableHead>
              <TableHead column="meta">Market</TableHead>
              <TableHead column="meta">Mode</TableHead>
              <TableHead column="meta">Status</TableHead>
              <TableHead column="meta">PnL</TableHead>
              <TableHead column="meta">Trades</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={visibleBots.length === 0}
        emptyText="No bots yet. Create one to start trading automatically."
        emptyColSpan={7}
        footer={{ type: "summary", count: visibleBots.length, label: "bots" }}
      >
        {visibleBots.map((bot) => (
          <TableRow key={bot.id}>
            <TableCell column="main">
              <Link
                to="/bots/$botId"
                params={{ botId: bot.id }}
                className="block min-w-0"
              >
                <div className="truncate font-medium hover:underline">
                  {bot.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  Strategy · {bot.wallet_label}
                </div>
              </Link>
            </TableCell>
            <TableCell column="meta">
              <MarketChips markets={bot.markets} />
            </TableCell>
            <TableCell column="meta">
              <Badge variant={bot.mode === "live" ? "default" : "secondary"}>
                {bot.mode}
              </Badge>
            </TableCell>
            <TableCell column="meta">
              <BotStatusBadge bot={bot} />
              {(bot.status === "error" || bot.status === "killed") &&
              bot.status_reason ? (
                <div
                  className="mt-1 max-w-52 truncate text-xs text-destructive"
                  title={bot.status_reason}
                >
                  {bot.status_reason}
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta">
              <span
                className={cn(
                  "font-mono tabular-nums",
                  bot.realized_pnl > 0
                    ? "text-emerald-600"
                    : bot.realized_pnl < 0
                      ? "text-red-500"
                      : undefined
                )}
              >
                {bot.realized_pnl >= 0 ? "+" : ""}
                {bot.realized_pnl.toFixed(2)}
              </span>
            </TableCell>
            <TableCell column="meta">{bot.trade_count}</TableCell>
            <TableCell column="meta">
              <div className="flex items-center gap-1">
                {busyBotId === bot.id ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <>
                    {bot.status === "running" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title="Pause"
                        onClick={() => void runCommand(bot, "pause")}
                      >
                        <PauseIcon className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        title={bot.status === "paused" ? "Resume" : "Start"}
                        onClick={() =>
                          void runCommand(
                            bot,
                            bot.status === "paused" ? "resume" : "start"
                          )
                        }
                      >
                        <PlayIcon className="size-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Stop"
                      disabled={bot.status === "stopped"}
                      onClick={() => void runCommand(bot, "stop")}
                    >
                      <SquareIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Delete"
                      onClick={() => setPendingDelete(bot)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <NewBotDialog
        open={newBotOpen}
        onOpenChange={setNewBotOpen}
        onCreated={(botId) =>
          void router.navigate({ to: "/bots/$botId", params: { botId } })
        }
      />

      <Dialog
        open={Boolean(pendingGlobal)}
        onOpenChange={(open) => {
          if (!open) setPendingGlobal(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>
              {pendingGlobal === "flatten_all" ? "Flatten all bots" : "Pause all bots"}
            </DialogTitle>
            <DialogDescription>
              {pendingGlobal === "flatten_all"
                ? "Every running bot closes its position at market, cancels its orders, and pauses."
                : "Every running bot cancels its open orders and pauses. Positions stay open."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">Proceed?</p>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPendingGlobal(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmGlobal()}
              >
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Confirm
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Delete Bot</DialogTitle>
            <DialogDescription>
              Deletes the bot with its trade and event history. The bot must be
              stopped first.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm">
              Delete <span className="font-medium">{pendingDelete?.name}</span>?
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                Delete
              </Button>
            </>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Compact market list for a bot: first couple of coins, then a "+N" overflow. */
function MarketChips({ markets }: { markets: string[] }) {
  if (markets.length === 0) return <span className="text-muted-foreground">—</span>
  const shown = markets.slice(0, 2)
  const extra = markets.length - shown.length
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {shown.map((coin) => (
        <Badge key={coin} variant="secondary" className="font-mono">
          {coin}
        </Badge>
      ))}
      {extra > 0 ? (
        <span
          className="text-xs text-muted-foreground"
          title={markets.join(", ")}
        >
          +{extra}
        </span>
      ) : null}
    </div>
  )
}

export function BotStatusBadge({
  bot,
}: {
  bot: Pick<
    BotListItem,
    "status" | "desired_state" | "updated_at" | "status_reason"
  >
}) {
  const view = botBadgeState(bot, Date.now())
  const variant = view.transient
    ? "outline"
    : view.status === "running"
      ? "default"
      : view.status === "error" || view.status === "killed"
        ? "destructive"
        : view.status === "paused" || view.status === "starting"
          ? "outline"
          : "secondary"
  return (
    <Badge variant={variant} title={bot.status_reason ?? undefined}>
      {view.transient ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : null}
      {view.label}
    </Badge>
  )
}
