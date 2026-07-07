import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import {
  Field,
  RiskField,
  StrategyParamFields,
} from "@/components/bots/strategy-param-fields"
import {
  buildParams,
  PARAM_DEFAULTS,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createBot, getBotErrorMessage } from "@/lib/api/bots"
import type { WalletItem } from "@/lib/api/wallets"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import {
  DEFAULT_RISK_PARAMS,
  STRATEGY_DESCRIPTIONS,
  STRATEGY_LABELS,
  strategyParamsSchema,
  type RiskParams,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

const STRATEGY_TYPES: StrategyType[] = ["grid", "dca", "momentum", "qqe", "copy"]

export function BotWizard({
  network,
  wallets,
}: {
  network: TradingNetwork
  wallets: WalletItem[]
}) {
  const router = useRouter()
  const markets = useMarketRows(network)

  const [name, setName] = React.useState("")
  const [strategy, setStrategy] = React.useState<StrategyType>("grid")
  const [walletId, setWalletId] = React.useState(
    wallets.find((wallet) => wallet.is_active)?.id ?? ""
  )
  const [market, setMarket] = React.useState("ETH")
  const [mode, setMode] = React.useState<"paper" | "live">("paper")
  const [paperEquity, setPaperEquity] = React.useState("10000")
  const [params, setParams] = React.useState<ParamValues>(PARAM_DEFAULTS.grid)
  const [risk, setRisk] = React.useState<RiskParams>(DEFAULT_RISK_PARAMS)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const mid = Number(
    markets.find((row) => row.coin === market)?.markPx ?? 0
  )

  function selectStrategy(next: StrategyType) {
    setStrategy(next)
    setParams(PARAM_DEFAULTS[next])
    setError(null)
  }

  async function submit() {
    setError(null)
    const built = buildParams(strategy, params)
    const parsed = strategyParamsSchema.safeParse(built)
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) =>
            issue.path.length
              ? `${issue.path.join(".")}: ${issue.message}`
              : issue.message
          )
          .join(" · ")
      )
      return
    }
    if (!walletId) {
      setError("Select a wallet.")
      return
    }
    if (!name.trim()) {
      setError("Give the bot a name.")
      return
    }

    setBusy(true)
    try {
      const { botId } = await createBot({
        name: name.trim(),
        walletId,
        market,
        mode,
        params: parsed.data,
        riskParams: risk,
        paperStartingEquity:
          mode === "paper" ? Number(paperEquity) || 10_000 : undefined,
      })
      await router.navigate({ to: "/bots/$botId", params: { botId } })
    } catch (error) {
      setError(getBotErrorMessage(error))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-12">
      <Card>
        <CardHeader>
          <CardTitle>1 · Strategy</CardTitle>
          <CardDescription>Pick what the bot trades on.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
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
              <div className="flex items-center gap-2 font-medium">
                {STRATEGY_LABELS[type]}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {STRATEGY_DESCRIPTIONS[type]}
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2 · Market & wallet</CardTitle>
          <CardDescription>
            Paper mode simulates fills from live {network} market data. Live
            mode signs real orders on the wallet's network.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={name}
              placeholder="ETH grid #1"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Market">
            <Select value={market} onValueChange={setMarket} disabled={busy}>
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
          </Field>
          <Field label="Wallet">
            <Select value={walletId} onValueChange={setWalletId} disabled={busy}>
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
          </Field>
          <Field label="Mode">
            <Select
              value={mode}
              disabled={busy}
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
          </Field>
          {mode === "paper" ? (
            <Field label="Paper starting equity (USD)">
              <Input
                value={paperEquity}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setPaperEquity(event.target.value.trim())}
              />
            </Field>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs sm:col-span-2">
              Live mode signs real orders with this wallet on its network.
              Paper-test the strategy first; risk limits still apply.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3 · {STRATEGY_LABELS[strategy]} parameters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <StrategyParamFields
            strategy={strategy}
            values={params}
            disabled={busy}
            mid={mid}
            onChange={(key, value) =>
              setParams((current) => ({ ...current, [key]: value }))
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4 · Risk limits</CardTitle>
          <CardDescription>
            Enforced by the worker on every evaluation; breaches auto-pause or
            kill the bot.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <RiskFieldsGrid risk={risk} busy={busy} onChange={setRisk} />
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void router.navigate({ to: "/bots" })}
        >
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Create {mode} bot
        </Button>
      </div>
    </div>
  )
}

export function RiskFieldsGrid({
  risk,
  busy,
  onChange,
}: {
  risk: RiskParams
  busy: boolean
  onChange: (risk: RiskParams) => void
}) {
  return (
    <>
      <RiskField
        label="Max position notional (USD)"
        value={risk.maxPositionNotionalUsd}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxPositionNotionalUsd: value })}
      />
      <RiskField
        label="Max leverage"
        value={risk.maxLeverage}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxLeverage: value })}
      />
      <RiskField
        label="Daily loss limit (USD, auto-pause)"
        value={risk.dailyLossLimitUsd}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, dailyLossLimitUsd: value })}
      />
      <RiskField
        label="Max drawdown % (kill + flatten)"
        value={risk.maxDrawdownPct}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxDrawdownPct: value })}
      />
      <RiskField
        label="Max open orders"
        value={risk.maxOpenOrders}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxOpenOrders: value })}
      />
      <RiskField
        label="Cooldown after N losses"
        value={risk.cooldownLosses}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, cooldownLosses: value })}
      />
      <RiskField
        label="Cooldown minutes"
        value={risk.cooldownMinutes}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, cooldownMinutes: value })}
      />
    </>
  )
}
