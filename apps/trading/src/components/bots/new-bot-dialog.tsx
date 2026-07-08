import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { orderSizeFromValues } from "@/components/backtest/run-config-fields"
import {
  buildParams,
  INTERVAL_STRATEGIES,
  PARAM_DEFAULTS,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
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
  DEFAULT_RISK_PARAMS,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyParamsSchema,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

const STRATEGY_TYPES: StrategyType[] = ["momentum", "qqe", "vwap", "grid", "dca", "copy"]

/**
 * Minimal bot creation: name, strategy, template, wallet, mode. Everything
 * else — params, market, signal interval, paper equity — seeds from the
 * chosen template (or the strategy's saved default) and stays editable later
 * in Bot Settings. Risk limits start at the platform defaults.
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
  const [strategy, setStrategy] = React.useState<StrategyType>("momentum")
  const [templateId, setTemplateId] = React.useState("__default__")
  const [walletId, setWalletId] = React.useState("")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  /** Fallback market when the chosen template doesn't pin one. */
  const [marketOverride, setMarketOverride] = React.useState("ETH")
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
  const markets = useMarketRows(network)

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

  const strategyTemplates = (seeds?.templates ?? []).filter(
    (row) => row.strategyType === strategy
  )
  const template =
    templateId === "__default__"
      ? null
      : (strategyTemplates.find((row) => row.id === templateId) ?? null)
  const config: StrategyRunDefaults = template
    ? {
        ...template.config,
        params: { ...PARAM_DEFAULTS[strategy], ...template.config.params },
      }
    : seedFor(strategy)

  const market = config.market ?? marketOverride
  const mid = Number(markets.find((row) => row.coin === market)?.markPx ?? 0)
  const paperEquity = config.equity ?? 10_000
  const orderSize = orderSizeFromValues(config.params)
  const signalInterval =
    config.interval ??
    config.params.interval ??
    (INTERVAL_STRATEGIES.includes(strategy) ? "15m" : "tick")

  function selectStrategy(next: StrategyType) {
    setStrategy(next)
    setTemplateId("__default__")
    setError(null)
  }

  async function submit() {
    setError(null)
    if (!name.trim()) return setError("Give the bot a name.")
    if (!walletId) return setError("Select a wallet.")

    const values: ParamValues = { ...config.params }
    if (config.interval) values.interval = config.interval
    if (strategy === "copy") values.sourceAddress = sourceAddress.trim()
    // Grid bounds are absolute prices — seed ±10% around the mid when the
    // template doesn't pin them.
    if (strategy === "grid" && !values.lowerPx && !values.upperPx && mid > 0) {
      values.lowerPx = (mid * 0.9).toPrecision(5)
      values.upperPx = (mid * 1.1).toPrecision(5)
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
        market,
        mode,
        params: parsed.data,
        riskParams: DEFAULT_RISK_PARAMS,
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
            Pick a strategy and template — the bot seeds its parameters,
            market, and sizing from it. Everything stays editable later in Bot
            Settings.
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

          {strategy === "copy" ? (
            <div className="grid gap-2">
              <Label htmlFor="bot-source">Source address</Label>
              <Input
                id="bot-source"
                value={sourceAddress}
                placeholder="0x…"
                onChange={(event) => setSourceAddress(event.target.value.trim())}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={(id) => {
                setTemplateId(id)
                setError(null)
              }}>
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
          )}

          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
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
            {!config.market ? (
              <div className="grid gap-2">
                <Label>Market</Label>
                <Select value={market} onValueChange={setMarketOverride}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(markets.length > 0
                      ? markets.map((row) => row.coin)
                      : [market]
                    ).map((coin) => (
                      <SelectItem key={coin} value={coin}>
                        {coin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  This template doesn't pin a market — pick one.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            Seeds — market {market} · signal {String(signalInterval)}
            {orderSize > 0 ? ` · order $${orderSize.toLocaleString()}` : ""}
            {mode === "paper"
              ? ` · equity $${paperEquity.toLocaleString()}`
              : ""}{" "}
            · risk limits default
          </div>

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
