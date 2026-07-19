import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import {
  BacktestMarketsTable,
  sortMarketRows,
  useMarketSort,
} from "@/components/backtest/backtest-markets-table"
import { buildBotMarketRows } from "@/components/bots/bot-market-rows"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"

import type { AutomationBotState } from "./use-automation-bot"

// QFL runs one shared portfolio, capped by how much history one portfolio
// calculation can handle; every other strategy runs one independent runner
// per market and isn't capped.
const MAX_QFL_MARKETS = 200

/**
 * The editor's right panel while Bot mode is on: market selector + Deploy for
 * a new run, then the live per-market results table with the same
 * "name this run to keep it" lifecycle as the backtest. No re-run buttons —
 * deploying again from setup replaces an unnamed run.
 */
export function AutomationBotSidePanel({
  bot,
  isQfl,
  runnable,
  disabledReason,
}: {
  bot: AutomationBotState
  /** QFL runs one shared portfolio over many markets; others take one. */
  isQfl: boolean
  /** Compiled + saved — deploying mid-edit is blocked, like backtest runs. */
  runnable: boolean
  disabledReason?: string
}) {
  const {
    phase,
    selectedMarkets,
    setSelectedMarkets,
    walletId,
    setWalletId,
    mode,
    setMode,
    paperEquity,
    setPaperEquity,
    wallets,
    error,
    deploying,
    detail,
    selectedMarket,
  } = bot
  const [keepName, setKeepName] = React.useState("")
  const [confirmKeep, setConfirmKeep] = React.useState(false)
  const marketSort = useMarketSort("net")

  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)
  const network = (
    selectedWallet?.network === "mainnet" ? "mainnet" : "testnet"
  ) as TradingNetwork
  const marketRows = useMarketRows(network)
  const availableMarkets = marketRows.filter(
    (row) => !selectedMarkets.includes(row.coin)
  )
  const maxMarkets = isQfl ? MAX_QFL_MARKETS : Infinity

  // Keeping finishes the run; when it still holds a position, that means
  // closing it — a money action, so it goes through a confirmation.
  const hasOpenPosition =
    detail !== null &&
    detail.states.some(
      (state) =>
        state.paper_position && Number(state.paper_position.szi) !== 0
    )
  const submitKeep = () => {
    void bot.keep(keepName)
    setKeepName("")
    setConfirmKeep(false)
  }

  const liveRows = React.useMemo(
    () =>
      detail
        ? sortMarketRows(
            buildBotMarketRows(detail.bot.markets, detail.states, detail.trades),
            marketSort.sortColumn,
            marketSort.sortDirection
          )
        : [],
    [detail, marketSort.sortColumn, marketSort.sortDirection]
  )

  const deployButton = (
    <DisabledReasonTooltip reason={runnable ? undefined : disabledReason}>
      <Button
        type="button"
        size="sm"
        className="h-8 w-full"
        disabled={!runnable || deploying}
        onClick={() => void bot.deploy()}
      >
        {deploying ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Deploy {mode} run
      </Button>
    </DisabledReasonTooltip>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Bot</h2>
        <span className="text-[10px] text-muted-foreground">
          {bot.hydrating ? "" : phase === "setup" ? "New run" : "Live"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div
          className={
            phase === "live"
              ? "flex flex-col gap-4"
              : "flex flex-col gap-4 p-3"
          }
        >
          {bot.hydrating ? (
            // Looking up the automation's latest run — rendering the setup
            // form here would flash form → dashboard when a run exists.
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : phase === "setup" ? (
            <>
              <div className="grid gap-2">
                <Label>
                  Markets{" "}
                  <span className="font-normal text-muted-foreground">
                    (
                    {isQfl
                      ? `one shared QFL portfolio · max ${MAX_QFL_MARKETS}`
                      : "one runner per market"}
                    )
                  </span>
                </Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {selectedMarkets.map((coin) => (
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
                          setSelectedMarkets(
                            selectedMarkets.filter((c) => c !== coin)
                          )
                        }
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                {availableMarkets.length > 0 &&
                selectedMarkets.length < maxMarkets ? (
                  <Select
                    value=""
                    onValueChange={(coin) =>
                      setSelectedMarkets(
                        selectedMarkets.includes(coin)
                          ? selectedMarkets
                          : [...selectedMarkets, coin].slice(0, maxMarkets)
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Add market" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {availableMarkets.slice(0, 100).map((row) => (
                        <SelectItem key={row.coin} value={row.coin}>
                          {row.coin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <div className="grid gap-1.5">
                <Label>Wallet</Label>
                <Select value={walletId} onValueChange={setWalletId}>
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={wallets.length === 0 ? "No wallets" : "Select"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {wallets.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.label} ({wallet.network})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(value) => setMode(value as "paper" | "live")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="paper">Paper (practice money)</SelectItem>
                    <SelectItem value="live">Live (real orders)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === "paper" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="bot-paper-equity">Paper starting equity</Label>
                  <Input
                    id="bot-paper-equity"
                    inputMode="decimal"
                    className="w-32"
                    value={paperEquity}
                    onChange={(event) =>
                      setPaperEquity(event.target.value.trim())
                    }
                  />
                </div>
              ) : null}

              {error ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {error}
                </div>
              ) : null}

              {deployButton}
            </>
          ) : detail === null ? (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Starting the run…
            </div>
          ) : (
            <div className="grid gap-1">
              <BacktestMarketsTable
                rows={liveRows}
                state={marketSort}
                selectedId={selectedMarket}
                onSelect={(row) => bot.setSelectedMarket(row.id)}
                emptyLabel="Waiting for the first data from the worker…"
              />
            </div>
          )}
        </div>
      </ScrollArea>

      {phase === "live" && detail !== null ? (
        <div className="grid shrink-0 gap-3 border-t p-3">
          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {error}
            </div>
          ) : null}
          <div className="grid gap-2 rounded-md border bg-muted/40 p-2.5">
            <div className="flex items-center gap-2">
              <Input
                value={keepName}
                onChange={(event) => setKeepName(event.target.value)}
                placeholder="Name this run to keep it"
                aria-label="Run name"
                className="h-8 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!keepName.trim()}
                onClick={() => {
                  if (hasOpenPosition) setConfirmKeep(true)
                  else submitKeep()
                }}
              >
                Keep
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Unnamed runs are replaced by your next deploy. Naming finishes
              this run — closes its position, stops it, files the result —
              and opens the selector for the next one.
            </p>
          </div>
        </div>
      ) : null}

      {/* Finishing a run that still holds a position closes it — confirm. */}
      <Dialog open={confirmKeep} onOpenChange={setConfirmKeep}>
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Keep this run?</DialogTitle>
            <DialogDescription>
              Keeping finishes the run and files its result.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This run still holds an open position. Keeping it closes the
              position at market and stops the run.
            </p>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmKeep(false)}
            >
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={submitKeep}>
              Close position &amp; keep
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DisabledReasonTooltip({
  reason,
  children,
}: {
  reason: string | undefined
  children: React.ReactNode
}) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="w-full rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{reason}</TooltipContent>
    </Tooltip>
  )
}
