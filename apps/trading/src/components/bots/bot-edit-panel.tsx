import * as React from "react"
import { Loader2Icon, XIcon } from "lucide-react"

import { StrategyParamCards } from "@/components/backtest/run-config-fields"
import { RiskFieldsGrid } from "@/components/bots/strategy-param-fields"
import {
  buildParams,
  paramsToValues,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
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
import { getBotErrorMessage, updateBot, type BotDetailResponse } from "@/lib/api/bots"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { strategyParamsSchema, type RiskParams } from "@/lib/strategies/params"

/**
 * State + save logic for editing a bot's name, markets, parameters, and risk
 * limits. Shared by the workspace side-sheet ({@link BotEditPanel}) and the
 * fleet dashboard's edit dialog so both stay in sync. Saving while the bot runs
 * restarts the runner with the new settings; adding a market spins up a runner
 * for it, removing one closes that market's position and stops trading it.
 */
export function useBotEditor(
  bot: BotDetailResponse["bot"],
  running: boolean,
  onSaved: (message: string, tone: "ok" | "error") => void
) {
  const [name, setName] = React.useState(bot.name)
  const [markets, setMarkets] = React.useState<string[]>(bot.markets)
  const [params, setParams] = React.useState<ParamValues>(() =>
    paramsToValues(bot.params)
  )
  const [risk, setRisk] = React.useState<RiskParams>(bot.risk_params)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError("Bot name is required.")
      return
    }
    if (markets.length === 0) {
      setError("Pick at least one market.")
      return
    }
    const built = buildParams(bot.strategy_type, params)
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

    setBusy(true)
    try {
      await updateBot({
        botId: bot.id,
        name: name.trim(),
        markets,
        params: parsed.data,
        riskParams: risk,
      })
      onSaved(
        running
          ? "Saved — bot restarting with the new settings."
          : "Saved.",
        "ok"
      )
    } catch (error) {
      setError(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return {
    name,
    setName,
    markets,
    setMarkets,
    params,
    setParams,
    risk,
    setRisk,
    busy,
    error,
    save,
  }
}

export type BotEditor = ReturnType<typeof useBotEditor>

/**
 * The editable name/markets/parameters/risk fields, shared by the workspace
 * sheet and the fleet dialog. Uses the same card styling as the backtest New
 * Run dialog. Returns a fragment so the container sets spacing.
 */
export function BotEditFields({
  strategyType,
  mid,
  network,
  editor,
}: {
  strategyType: BotDetailResponse["bot"]["strategy_type"]
  mid: number
  network: TradingNetwork
  editor: BotEditor
}) {
  const { name, setName, markets, setMarkets, params, setParams, risk, setRisk, busy, error } =
    editor
  const marketRows = useMarketRows(network)
  const available = marketRows.filter((row) => !markets.includes(row.coin))
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="bot-edit-name">Bot name</Label>
        <Input
          id="bot-edit-name"
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>
          Markets{" "}
          <span className="font-normal text-muted-foreground">
            ({markets.length})
          </span>
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {markets.map((coin) => (
            <Badge key={coin} variant="secondary" className="gap-1 font-mono">
              {coin}
              <button
                type="button"
                aria-label={`Remove ${coin}`}
                disabled={busy || markets.length <= 1}
                onClick={() =>
                  setMarkets((current) => current.filter((c) => c !== coin))
                }
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
          {available.length > 0 ? (
            <Select
              value=""
              disabled={busy}
              onValueChange={(coin) =>
                setMarkets((current) =>
                  current.includes(coin) ? current : [...current, coin]
                )
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Add market" />
              </SelectTrigger>
              <SelectContent>
                {available.map((row) => (
                  <SelectItem key={row.coin} value={row.coin}>
                    {row.coin}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Removing a market closes its position and stops trading it.
        </p>
      </div>

      <StrategyParamCards
        strategy={strategyType}
        values={params}
        disabled={busy}
        mid={mid}
        onChange={(key, value) =>
          setParams((current) => ({ ...current, [key]: value }))
        }
      />

      <div className="grid gap-4 rounded-lg border p-4">
        <Label>Risk limits</Label>
        <div className="grid gap-4 sm:grid-cols-3">
          <RiskFieldsGrid risk={risk} busy={busy} onChange={setRisk} />
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
    </>
  )
}

/**
 * Right-panel bot editor (workspace side-sheet): the shared fields plus a save
 * button, scrolling within the sheet.
 */
export function BotEditPanel({
  bot,
  mid,
  running,
  onSaved,
}: {
  bot: BotDetailResponse["bot"]
  mid: number
  running: boolean
  onSaved: (message: string, tone: "ok" | "error") => void
}) {
  const editor = useBotEditor(bot, running, onSaved)
  const network: TradingNetwork = bot.network === "mainnet" ? "mainnet" : "testnet"
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <BotEditFields
            strategyType={bot.strategy_type}
            mid={mid}
            network={network}
            editor={editor}
          />
          <Button
            type="button"
            disabled={editor.busy}
            onClick={() => void editor.save()}
          >
            {editor.busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Save
          </Button>
          {running ? (
            <p className="text-[11px] text-muted-foreground">
              The bot is running — saving restarts it with the new settings
              (existing positions kept, orders re-derived).
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
