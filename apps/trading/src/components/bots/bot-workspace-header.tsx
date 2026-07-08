import * as React from "react"
import {
  ArrowLeftIcon,
  EllipsisVerticalIcon,
  Loader2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PauseIcon,
  PlayIcon,
  Settings2Icon,
  SquareIcon,
} from "lucide-react"

import {
  pct,
  price as fmtPrice,
  signedUsd,
  toneClass,
} from "@/components/backtest/backtest-format"
import { BotStatusBadge } from "@/components/bots/fleet-dashboard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { BotDetailResponse } from "@/lib/api/bots"
import { STRATEGY_LABELS } from "@/lib/strategies/params"
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
  busy,
  paramsOpen,
  onToggleParams,
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
  busy: boolean
  paramsOpen: boolean
  onToggleParams: () => void
  controlsOpen: boolean
  onToggleControls: () => void
  onBack: () => void
  onCommand: (command: BotCommand) => void
  onOpenSettings: () => void
}) {
  const signalInterval =
    "interval" in bot.params ? String(bot.params.interval) : "tick"
  const quickInfo = [
    `running ${formatRunningFor(bot.created_at)}`,
    `signal ${signalInterval}`,
    `${stats.trade_count} fills`,
    `lev ${bot.risk_params.maxLeverage}×`,
  ].join(" · ")

  return (
    <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-1">
        <IconButton label="Back to bots" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </IconButton>
        <IconButton
          label={paramsOpen ? "Hide parameters panel" : "Show parameters panel"}
          onClick={onToggleParams}
        >
          <PanelLeftIcon className="size-4" />
        </IconButton>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{bot.name}</span>
        <Badge variant="secondary" className="shrink-0 font-medium">
          {STRATEGY_LABELS[bot.strategy_type]}
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

      <span className="text-sm font-bold">{bot.market}</span>
      <div className="flex flex-col leading-tight">
        <span
          className={cn(
            "font-mono text-base font-semibold",
            dayChangePct !== null ? toneClass(dayChangePct) : undefined
          )}
        >
          {markPrice > 0 ? `$${fmtPrice(markPrice)}` : "—"}
        </span>
        <span
          className={cn(
            "font-mono text-[11px]",
            dayChangePct !== null ? toneClass(dayChangePct) : "text-muted-foreground"
          )}
        >
          {dayChangePct !== null ? `${pct(dayChangePct)} 24h` : "—"}
        </span>
      </div>

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground"
            aria-label="More bot actions"
          >
            <EllipsisVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            disabled={busy || bot.status === "stopped"}
            onClick={() => onCommand("flatten")}
            className="text-xs"
          >
            Flatten — close position, cancel orders
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={busy || bot.status === "stopped"}
            onClick={() => onCommand("stop")}
            className="text-xs"
          >
            <SquareIcon className="size-3.5" /> Stop bot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IconButton label="Bot settings" onClick={onOpenSettings}>
        <Settings2Icon className="size-4" />
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

/** Ghost icon button used for the header's back/panel toggles. */
function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 text-muted-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
