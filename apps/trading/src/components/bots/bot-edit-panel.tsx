import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { StrategyParamCards } from "@/components/backtest/run-config-fields"
import { RiskFieldsGrid } from "@/components/bots/strategy-param-fields"
import {
  buildParams,
  paramsToValues,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getBotErrorMessage, updateBot, type BotDetailResponse } from "@/lib/api/bots"
import { strategyParamsSchema, type RiskParams } from "@/lib/strategies/params"

/**
 * State + save logic for editing a bot's name, parameters, and risk limits.
 * Shared by the workspace side-sheet ({@link BotEditPanel}) and the fleet
 * dashboard's edit dialog so both stay in sync. Saving while the bot runs
 * restarts the runner with the new parameters (position kept, orders re-derived).
 */
export function useBotEditor(
  bot: BotDetailResponse["bot"],
  running: boolean,
  onSaved: (message: string, tone: "ok" | "error") => void
) {
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

  return {
    name,
    setName,
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
 * The editable name/parameters/risk fields, shared by the workspace sheet and
 * the fleet dialog. Uses the same card styling as the backtest New Run dialog:
 * a name field, the collapsible strategy-parameter cards, and a risk-limits
 * card. Returns a fragment so the container (DialogBody / sheet) sets spacing.
 */
export function BotEditFields({
  strategyType,
  mid,
  editor,
}: {
  strategyType: BotDetailResponse["bot"]["strategy_type"]
  mid: number
  editor: BotEditor
}) {
  const { name, setName, params, setParams, risk, setRisk, busy, error } =
    editor
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          <BotEditFields
            strategyType={bot.strategy_type}
            mid={mid}
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
              The bot is running — saving cancels its resting orders and
              re-derives them from the new parameters. Position is kept.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
