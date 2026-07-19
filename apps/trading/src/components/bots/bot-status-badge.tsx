import { Loader2Icon } from "lucide-react"

import { botBadgeState } from "@/components/bots/bot-status"
import { Badge } from "@/components/ui/badge"
import type { BotListItem } from "@/lib/api/bots"

/** Status pill for a bot run — spinner + honest label while a command lands. */
export function BotStatusBadge({
  bot,
}: {
  bot: Pick<
    BotListItem,
    "status" | "desired_state" | "updated_at" | "status_reason"
  >
}) {
  const view = botBadgeState(bot, Date.now())
  const variant = view.transient
    ? "outline"
    : view.status === "running"
      ? "default"
      : view.status === "error" || view.status === "killed"
        ? "destructive"
        : view.status === "paused" || view.status === "starting"
          ? "outline"
          : "secondary"
  return (
    <Badge variant={variant} title={bot.status_reason ?? undefined}>
      {view.transient ? <Loader2Icon className="size-3 animate-spin" /> : null}
      {view.label}
    </Badge>
  )
}
