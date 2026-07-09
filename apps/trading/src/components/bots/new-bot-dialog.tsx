import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { orderSizeFromValues } from "@/components/backtest/run-config-fields"
import {
  buildParams,
  INTERVAL_STRATEGIES,
  PARAM_DEFAULTS,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  loadStrategyTemplates,
  type StrategyDefaultsMap,
  type StrategyRunDefaults,
  type StrategyTemplate,
} from "@/lib/api/backtests"
import { createBot, getBotErrorMessage } from "@/lib/api/bots"
import { loadTradingContext, type TradingContextResponse } from "@/lib/api/trading"
import { useMarketRows } from "@/lib/hl/hooks"
import {
  DEFAULT_BACKTEST_RISK_PARAMS,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyParamsSchema,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

const STRATEGY_TYPES: StrategyType[] = ["momentum", "qqe", "vwap", "grid", "dca", "copy"]

/** Exchanges the bot can trade on. Only Hyperliquid exists today. */
const EXCHANGES: { id: string; label: string }[] = [
  { id: "hyperliquid", label: "Hyperliquid" },
]

/**
 * Guided bot creation. Fields reveal step by step — name, then wallet + mode,
 * then a strategy (nothing pre-selected), then its template, then the exchange,
 * then a basket of markets. A bot runs its strategy on every chosen market at
 * once. Params, signal interval, and paper equity seed from the template (or
 * the strategy's saved default) and stay editable later in Bot Settings.
 */
export function NewBotDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (botId: string) => void
}) {
  const [context, setContext] = React.useState<TradingContextResponse | null>(
    null
  )
  const [seeds, setSeeds] = React.useState<{
    strategyDefaults: StrategyDefaultsMap
    templates: StrategyTemplate[]
  } | null>(null)

  const [name, setName] = React.useState("")
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  const [strategy, setStrategy] = React.useState<StrategyType | null>(null)
  const [templateId, setTemplateId] = React.useState("__default__")
  const [exchange, setExchange] = React.useState("")
  const [selectedMarkets, setSelectedMarkets] = React.useState<string[]>([])
  const [sourceAddress, setSourceAddress] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const [ctx, tpl] = await Promise.all([
          loadTradingContext(),
          loadStrategyTemplates(),
        ])
        if (cancelled) return
        setContext(ctx)
        setSeeds(tpl)
        setWalletId(
          (current) =>
            current ||
            (ctx.wallets.find((wallet) => wallet.is_active)?.id ??
              ctx.wallets[0]?.id ??
              "")
        )
      } catch (err) {
        if (!cancelled) setError(getBotErrorMessage(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const network = context?.network ?? "testnet"
  const marketRows = useMarketRows(network)

  /** Built-ins overlaid with the user's saved defaults for a strategy. */
  const seedFor = React.useCallback(
    (type: StrategyType): StrategyRunDefaults => {
      const stored = seeds?.strategyDefaults?.[type]
      return {
        ...stored,
        params: { ...PARAM_DEFAULTS[type], ...(stored?.params ?? {}) },
      }
    },
    [seeds]
  )

  const strategyTemplates = strategy
    ? (seeds?.templates ?? []).filter((row) => row.strategyType === strategy)
    : []
  const template =
    templateId === "__default__"
      ? null
      : (strategyTemplates.find((row) => row.id === templateId) ?? null)
  const config: StrategyRunDefaults | null = strategy
    ? template
      ? {
          ...template.config,
          params: { ...PARAM_DEFAULTS[strategy], ...template.config.params },
        }
      : seedFor(strategy)
    : null

  const firstMid = Number(
    marketRows.find((row) => row.coin === selectedMarkets[0])?.markPx ?? 0
  )
  const paperEquity = config?.equity ?? 10_000
  const orderSize = config ? orderSizeFromValues(config.params) : 0
  const signalInterval =
    config?.interval ??
    config?.params.interval ??
    (strategy && INTERVAL_STRATEGIES.includes(strategy) ? "15m" : "tick")

  // Template + exchange reveal once a strategy is picked; markets after an
  // exchange is chosen.
  const strategyChosen = strategy !== null
  const showMarkets = strategyChosen && exchange !== ""

  function selectStrategy(next: StrategyType) {
    setStrategy(next)
    setTemplateId("__default__")
    setExchange("")
    setSelectedMarkets([])
    setError(null)
  }

  function selectExchange(next: string) {
    setExchange(next)
    setError(null)
    // If the chosen template pins a market, seed it as the first pick.
    if (config?.market && selectedMarkets.length === 0) {
      setSelectedMarkets([config.market])
    }
  }

  const availableMarkets = marketRows.filter(
    (row) => !selectedMarkets.includes(row.coin)
  )

  async function submit() {
    setError(null)
    if (!name.trim()) return setError("Give the bot a name.")
    if (!walletId) return setError("Select a wallet.")
    if (!strategy || !config) return setError("Pick a strategy.")
    if (!exchange) return setError("Select an exchange.")
    if (selectedMarkets.length === 0) return setError("Pick at least one market.")

    const values: ParamValues = { ...config.params }
    if (config.interval) values.interval = config.interval
    if (strategy === "copy") values.sourceAddress = sourceAddress.trim()
    // Grid bounds are absolute prices — seed ±10% around the first market's mid
    // when the template doesn't pin them.
    if (strategy === "grid" && !values.lowerPx && !values.upperPx && firstMid > 0) {
      values.lowerPx = (firstMid * 0.9).toPrecision(5)
      values.upperPx = (firstMid * 1.1).toPrecision(5)
    }

    const parsed = strategyParamsSchema.safeParse(buildParams(strategy, values))
    if (!parsed.success) {
      return setError(
        parsed.error.issues
          .map((issue) =>
            issue.path.length
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join(" · ")
      )
    }

    setBusy(true)
    try {
      const { botId } = await createBot({
        name: name.trim(),
        walletId,
        markets: selectedMarkets,
        exchange,
        mode,
        params: parsed.data,
        // Seed the bot's risk from the chosen template. Fall back to the SAME
        // default the template editor + New Run show (research mode) when it has
        // none, so the bot's risk always matches what the template displays.
        riskParams: config.riskParams ?? DEFAULT_BACKTEST_RISK_PARAMS,
        paperStartingEquity: mode === "paper" ? paperEquity : undefined,
      })
      onOpenChange(false)
      onCreated(botId)
    } catch (err) {
      setError(getBotErrorMessage(err))
      setBusy(false)
    }
  }

  const wallets = context?.wallets ?? []

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>New Bot</DialogTitle>
          <DialogDescription>
            Name the bot, pick a strategy and template, then choose the markets
            it trades — it runs the strategy on every market at once. Params and
            sizing seed from the template and stay editable later.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-5 overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="bot-name">Name</Label>
            <Input
              id="bot-name"
              value={name}
              placeholder="ETH momentum #1"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Wallet</Label>
              <Select value={walletId} onValueChange={setWalletId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={wallets.length === 0 ? "No wallets" : "Select"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.id}>
                      {wallet.label} ({wallet.network})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select
                value={mode}
                onValueChange={(value) => setMode(value as "paper" | "live")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paper">Paper (simulated fills)</SelectItem>
                  <SelectItem value="live">Live (signs real orders)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Strategy</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {STRATEGY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectStrategy(type)}
                  className={cn(
                    "rounded-md border p-3 text-left text-sm hover:bg-muted/50",
                    strategy === type && "border-primary bg-muted"
                  )}
                >
                  <div className="font-medium">{STRATEGY_LABELS[type]}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {STRATEGY_DESCRIPTIONS[type]}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {strategyChosen ? (
            strategy === "copy" ? (
              <div className="grid gap-2">
                <Label htmlFor="bot-source">Source address</Label>
                <Input
                  id="bot-source"
                  value={sourceAddress}
                  placeholder="0x…"
                  onChange={(event) =>
                    setSourceAddress(event.target.value.trim())
                  }
                />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Template</Label>
                <Select
                  value={templateId}
                  onValueChange={(id) => {
                    setTemplateId(id)
                    setError(null)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">Main default</SelectItem>
                    {strategyTemplates.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          ) : null}

          {strategyChosen ? (
            <div className="grid gap-2">
              <Label>Exchange</Label>
              <Select value={exchange} onValueChange={selectExchange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select exchange" />
                </SelectTrigger>
                <SelectContent>
                  {EXCHANGES.map((ex) => (
                    <SelectItem key={ex.id} value={ex.id}>
                      {ex.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {showMarkets ? (
            <div className="grid gap-2">
              <Label>
                Markets{" "}
                {selectedMarkets.length > 0 ? (
                  <span className="font-normal text-muted-foreground">
                    ({selectedMarkets.length} selected)
                  </span>
                ) : null}
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
                        setSelectedMarkets((current) =>
                          current.filter((c) => c !== coin)
                        )
                      }
                    >
                      <XIcon className="size-3" />
                    </button>
                  </Badge>
                ))}
                {availableMarkets.length > 0 ? (
                  <Select
                    value=""
                    onValueChange={(coin) =>
                      setSelectedMarkets((current) =>
                        current.includes(coin) ? current : [...current, coin]
                      )
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Add market" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableMarkets.map((row) => (
                        <SelectItem key={row.coin} value={row.coin}>
                          {row.coin}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                The bot runs the strategy on each market independently
                {mode === "paper"
                  ? ` — each starts with $${paperEquity.toLocaleString()} paper equity.`
                  : "."}
              </p>
            </div>
          ) : null}

          {config && selectedMarkets.length > 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              Seeds — {selectedMarkets.length} market
              {selectedMarkets.length === 1 ? "" : "s"} · signal{" "}
              {String(signalInterval)}
              {orderSize > 0 ? ` · order $${orderSize.toLocaleString()}` : ""}
              {mode === "paper"
                ? ` · equity $${paperEquity.toLocaleString()}/market`
                : ""}{" "}
              · risk from template
            </div>
          ) : null}

          {mode === "live" ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              Live mode signs real orders with this wallet on its network.
              Paper-test the strategy first; risk limits still apply.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Create {mode} bot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
