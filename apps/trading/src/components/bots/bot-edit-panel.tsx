import * as React from "react"
import { Loader2Icon } from "lucide-react"

import {
  Field,
  RiskFieldsGrid,
  StrategyParamFields,
} from "@/components/bots/strategy-param-fields"
import {
  buildParams,
  paramsToValues,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { getBotErrorMessage, updateBot, type BotDetailResponse } from "@/lib/api/bots"
import { strategyParamsSchema, type RiskParams } from "@/lib/strategies/params"

/**
 * Right-panel bot editor (Bitsgap-style): name, strategy parameters with
 * live %-hints, risk limits, save. Saving while the bot runs restarts the
 * runner with the new parameters (position kept, orders re-derived).
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
  const [name, setName] = React.useState(bot.name)
  const [params, setParams] = React.useState<ParamValues>(() =>
    paramsToValues(bot.params)
  )
  const [risk, setRisk] = React.useState<RiskParams>(bot.risk_params)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function save() {
    setError(null)
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
    if (!name.trim()) {
      setError("Bot name is required.")
      return
    }

    setBusy(true)
    try {
      await updateBot({
        botId: bot.id,
        name: name.trim(),
        params: parsed.data,
        riskParams: risk,
      })
      onSaved(
        running
          ? "Parameters saved — bot restarting with new settings."
          : "Parameters saved.",
        "ok"
      )
    } catch (error) {
      setError(getBotErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3 text-xs">
          <Field label="Bot name">
            <Input
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <div className="text-xs font-medium text-muted-foreground">
            Parameters
          </div>
          <div className="grid gap-3">
            <StrategyParamFields
              strategy={bot.strategy_type}
              values={params}
              disabled={busy}
              mid={mid}
              onChange={(key, value) =>
                setParams((current) => ({ ...current, [key]: value }))
              }
            />
          </div>

          <Separator />
          <div className="text-xs font-medium text-muted-foreground">
            Risk limits
          </div>
          <div className="grid gap-3">
            <RiskFieldsGrid risk={risk} busy={busy} onChange={setRisk} />
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </div>
          ) : null}

          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </Button>
          {running ? (
            <p className="text-[11px] text-muted-foreground">
              The bot is running — saving cancels its resting orders and
              re-derives them from the new parameters. Position is kept.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
