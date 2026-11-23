import * as React from "react"
import { ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react"

import { MarketPicker } from "@/components/trading/market-watchlist"
import { useMarketFavorites } from "@/lib/trading/use-market-favorites"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

// A DCA basket runs one shared wallet, capped by how much history one portfolio
// calculation can handle; every other strategy runs one independent runner
// per market and isn't capped.
const MAX_SHARED_WALLET_MARKETS = 200

/** Nothing is pinned in the add-market picker; the list is already filtered. */
const EMPTY_MARKETS: ReadonlySet<string> = new Set()

/**
 * The editor's right panel while Bot mode is on: the market selector +
 * Deploy form for a NEW run. A deployed run lives on its own page
 * (/bots/$botId) — entering Bot mode with a current run navigates there, so
 * this panel only ever shows the setup form.
 */
export function AutomationBotSidePanel({
  bot,
  isDca,
  runnable,
  disabledReason,
  onBeforeDeploy,
}: {
  bot: AutomationBotState
  /** True when a DCA ladder runs the whole basket off one shared wallet. */
  isDca: boolean
  /** Compiles cleanly — a broken automation can't be deployed. */
  runnable: boolean
  disabledReason?: string
  /**
   * A deployed run reads the SAVED automation, so this flushes the editor's
   * pending auto-save first and reports whether the saved copy is runnable.
   */
  onBeforeDeploy?: () => Promise<boolean>
}) {
  const {
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
  } = bot

  const selectedWallet = wallets.find((wallet) => wallet.id === walletId)
  const network = (
    selectedWallet?.network === "mainnet" ? "mainnet" : "testnet"
  ) as TradingNetwork
  const marketRows = useMarketRows(network)
  const { favorites, toggleFavorite } = useMarketFavorites()
  // Set lookup, not `includes`: with hundreds of markets selected, filtering an
  // array inside an array walk is quadratic and re-runs on every price tick,
  // which locks up the panel.
  const selectedSet = React.useMemo(
    () => new Set(selectedMarkets),
    [selectedMarkets]
  )
  const availableMarkets = React.useMemo(
    () => marketRows.filter((row) => !selectedSet.has(row.coin)),
    [marketRows, selectedSet]
  )
  const maxMarkets = isDca ? MAX_SHARED_WALLET_MARKETS : Infinity

  // The deployed run picks its config up from the database, so any edit still
  // sitting in the auto-save debounce has to land before deploying. `deploying`
  // only goes true once the deploy request is out, so it does not cover that
  // flush — without `preparing`, a second click during it deploys twice.
  const [preparing, setPreparing] = React.useState(false)
  const busy = deploying || preparing

  const deploy = async () => {
    if (preparing) return
    if (onBeforeDeploy) {
      setPreparing(true)
      let saved = false
      try {
        saved = await onBeforeDeploy()
      } finally {
        setPreparing(false)
      }
      if (!saved) return
    }
    await bot.deploy()
  }

  const deployButton = (
    <DisabledReasonTooltip reason={runnable ? undefined : disabledReason}>
      <Button
        type="button"
        size="sm"
        className="h-8 w-full"
        disabled={!runnable || busy}
        onClick={() => void deploy()}
      >
        {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
        Deploy {mode} run
      </Button>
    </DisabledReasonTooltip>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <h2 className="text-xs font-semibold tracking-wide uppercase">Bot</h2>
        <span className="text-[10px] text-muted-foreground">
          {bot.hydrating ? "" : "New run"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {bot.hydrating ? (
            // Looking up the automation's latest run — rendering the setup
            // form here would flash form → navigation when a run exists.
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>
                    Markets{" "}
                    <span className="font-normal text-muted-foreground">
                      (
                      {isDca
                        ? `one shared DCA portfolio · max ${MAX_SHARED_WALLET_MARKETS}`
                        : "one runner per market"}
                      )
                    </span>
                  </Label>
                  {selectedMarkets.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => setSelectedMarkets([])}
                    >
                      Clear all
                    </Button>
                  ) : null}
                </div>
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
                  <MarketPicker
                    rows={availableMarkets}
                    selected=""
                    protectedMarkets={EMPTY_MARKETS}
                    favorites={favorites}
                    onToggleFavorite={toggleFavorite}
                    multiple
                    maxSelectable={maxMarkets - selectedMarkets.length}
                    onSelectMany={(coins) =>
                      setSelectedMarkets(
                        [...new Set([...selectedMarkets, ...coins])].slice(
                          0,
                          maxMarkets
                        )
                      )
                    }
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal text-muted-foreground"
                      >
                        Add market
                        <ChevronDownIcon className="size-4" />
                      </Button>
                    }
                  />
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
          )}
        </div>
      </ScrollArea>
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
