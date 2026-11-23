import { Loader2Icon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react"

import { botBadgeState } from "@/components/bots/bot-status"
import { Button } from "@/components/ui/button"
import type { BotDetailResponse } from "@/lib/api/bots"

export type BotCommand = "start" | "stop" | "pause" | "resume" | "flatten"

/**
 * The bot's lifecycle controls (Resume/Pause, Flatten) in the chart toolbar.
 * There is no bot settings dialog — the automation's canvas IS the config.
 */
export function BotLifecycleControls({
  bot,
  busy,
  onCommand,
}: {
  bot: BotDetailResponse["bot"]
  busy: boolean
  onCommand: (command: BotCommand) => void
}) {
  const view = botBadgeState(bot, Date.now())
  const transientLabel =
    view.label.charAt(0).toUpperCase() + view.label.slice(1)

  return (
    <div className="flex items-center gap-1.5">
      {view.transient ? (
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled>
          <Loader2Icon className="size-3.5 animate-spin" />
          {transientLabel}
        </Button>
      ) : bot.status === "running" ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
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
          className="h-7 gap-1.5 text-xs"
          disabled={busy}
          onClick={() => onCommand(bot.status === "paused" ? "resume" : "start")}
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
          className="h-7 gap-1.5 text-xs"
          disabled={busy || view.transient}
          onClick={() => onCommand("flatten")}
          title="Close the position, cancel orders, and pause the bot"
        >
          <SquareIcon className="size-3.5" />
          Flatten
        </Button>
      ) : null}
    </div>
  )
}
