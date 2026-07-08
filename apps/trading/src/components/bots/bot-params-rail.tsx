import { LockIcon } from "lucide-react"

import { StrategyParamFields } from "@/components/bots/strategy-param-fields"
import type { ParamValues } from "@/components/bots/strategy-params-form"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  STRATEGY_LABELS,
  type RiskParams,
  type StrategyType,
} from "@/lib/strategies/params"

/**
 * Left rail of the bot workspace: the strategy parameters the bot is running,
 * read-only ("the bot runs its parameters"), plus its risk limits. Full
 * editing lives in the Bot Settings sheet.
 */
export function BotParamsRail({
  strategy,
  values,
  mid,
  riskParams,
  onOpenSettings,
}: {
  strategy: StrategyType
  values: ParamValues
  mid: number
  riskParams: RiskParams
  onOpenSettings: () => void
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-[11px] font-semibold text-foreground/80">
          Parameters · {STRATEGY_LABELS[strategy]}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <LockIcon className="size-3" />
          Bot-managed
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          <StrategyParamFields
            strategy={strategy}
            values={values}
            disabled
            mid={mid}
            onChange={() => {}}
          />

          <div className="h-px bg-border" />

          <span className="text-[11px] font-semibold text-foreground/80">
            Risk limits
          </span>
          <Row label="Max position" value={`$${riskParams.maxPositionNotionalUsd.toLocaleString()}`} />
          <Row label="Max leverage" value={`${riskParams.maxLeverage}×`} />
          <Row label="Daily loss limit" value={`$${riskParams.dailyLossLimitUsd.toLocaleString()}`} />
          <Row label="Max drawdown" value={`${riskParams.maxDrawdownPct}%`} />
          <Row label="Max open orders" value={String(riskParams.maxOpenOrders)} />
          <Row
            label="Cooldown"
            value={`${riskParams.cooldownLosses} losses · ${riskParams.cooldownMinutes}m`}
          />

          <div className="h-px bg-border" />

          <p className="text-[10px] leading-snug text-muted-foreground">
            Parameters are locked while the bot runs them.{" "}
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Edit in Bot Settings
            </button>{" "}
            — saving restarts the bot with the new config (position kept).
          </p>
        </div>
      </ScrollArea>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-foreground/80">{value}</span>
    </div>
  )
}
