import {
  ArrowLeftIcon,
  Loader2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  SquareIcon,
} from "lucide-react"

import {
  signedUsd,
  toneClass,
} from "@/components/backtest/backtest-format"
import { IconButton } from "@/components/icon-button"
import { MarkPriceInline } from "@/components/kpi"
import { BotStatusBadge } from "@/components/bots/fleet-dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { BotDetailResponse } from "@/lib/api/bots"
import { cn } from "@/lib/utils"

export type BotCommand = "start" | "stop" | "pause" | "resume" | "flatten"

/**
 * Top toolbar of the bot workspace: identity + quick info on the left,
 * lifecycle controls on the right. Mirrors the backtest workspace header.
 */
export function BotWorkspaceHeader({
  bot,
  stats,
  markPrice,
  dayChangePct,
  selectedMarket,
  busy,
  marketsOpen,
  onToggleMarkets,
  controlsOpen,
  onToggleControls,
  onBack,
  onCommand,
  onOpenSettings,
}: {
  bot: BotDetailResponse["bot"]
  stats: BotDetailResponse["stats"]
  markPrice: number
  dayChangePct: number | null
  selectedMarket: string
  busy: boolean
  marketsOpen: boolean
  onToggleMarkets: () => void
  controlsOpen: boolean
  onToggleControls: () => void
  onBack: () => void
  onCommand: (command: BotCommand) => void
  onOpenSettings: () => void
}) {
  const sourceInterval =
    "interval" in bot.params ? String(bot.params.interval) : "tick"
  const sourceType =
    bot.params.kind === "automation" ? "Automation" : "Strategy"
  const sourceName = bot.source_name ?? sourceType
  const quickInfo = [
    `running ${formatRunningFor(bot.created_at)}`,
    `${sourceName} · ${sourceInterval}`,
    `${stats.trade_count} fills`,
  ].join(" · ")

  return (
    <div className="flex items-center gap-3 border-b bg-card px-4 py-2">
      <div className="flex items-center gap-1">
        <IconButton label="Back to bots" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <IconButton
          label={marketsOpen ? "Hide markets panel" : "Show markets panel"}
          onClick={onToggleMarkets}
        >
          <PanelLeftIcon className="size-4" />
        </IconButton>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{bot.name}</span>
        <Badge variant="secondary" className="shrink-0 font-medium">
          {sourceType}
        </Badge>
        <Badge
          variant={bot.mode === "live" ? "default" : "secondary"}
          className="shrink-0"
        >
          {bot.mode}
        </Badge>
        <BotStatusBadge status={bot.status} reason={bot.status_reason} />
      </div>

      <div className="h-6 w-px bg-border" />

      <span className="text-sm font-bold">{selectedMarket}</span>
      {bot.markets.length > 1 ? (
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {bot.markets.length} markets
        </Badge>
      ) : null}
      <MarkPriceInline
        markPrice={markPrice}
        dayChangePct={dayChangePct}
        className="leading-tight"
      />

      <div className="h-6 w-px bg-border" />

      <span className="hidden font-mono text-[11px] text-muted-foreground lg:inline">
        {quickInfo}
      </span>

      <div className="flex-1" />

      <span
        className={cn(
          "font-mono text-xs font-semibold",
          toneClass(stats.realized_pnl)
        )}
      >
        {signedUsd(stats.realized_pnl)}
      </span>

      {bot.status === "running" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={busy}
          onClick={() => onCommand("pause")}
        >
          {busy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PauseIcon className="size-3.5" />
          )}
          Pause
        </Button>
      ) : bot.status === "starting" ? (
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled>
          <Loader2Icon className="size-3.5 animate-spin" />
          Starting…
        </Button>
      ) : (
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={busy}
          onClick={() =>
            onCommand(bot.status === "paused" ? "resume" : "start")
          }
        >
          {busy ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <PlayIcon className="size-3.5" />
          )}
          {bot.status === "paused" ? "Resume" : "Start"}
        </Button>
      )}

      {bot.status === "running" || bot.status === "paused" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={busy}
          onClick={() => onCommand("flatten")}
          title="Close the position, cancel orders, and pause the bot"
        >
          <SquareIcon className="size-3.5" />
          Flatten
        </Button>
      ) : null}

      <IconButton label="Bot settings" onClick={onOpenSettings}>
        <SettingsIcon className="size-4" />
      </IconButton>
      <IconButton
        label={controlsOpen ? "Hide order controls" : "Show order controls"}
        onClick={onToggleControls}
      >
        <PanelRightIcon className="size-4" />
      </IconButton>
    </div>
  )
}

/** "12d 4h" / "3h" / "<1h" since the bot was created. */
function formatRunningFor(createdAt: string): string {
  const ms = Date.now() - Date.parse(createdAt)
  if (!(ms > 0)) return "<1h"
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return "<1h"
  const days = Math.floor(hours / 24)
  if (days < 1) return `${hours}h`
  const rem = hours % 24
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}
