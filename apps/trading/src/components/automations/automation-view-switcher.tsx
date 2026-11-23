import type { LucideIcon } from "lucide-react"
import { BotIcon, FlaskConicalIcon, WorkflowIcon } from "lucide-react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * The three surfaces of an automation. Canvas + Backtest are modes of the
 * editor; Bot is the live dashboard. The pill switcher is shared so the editor
 * and the bot page present the same tabs — each wires the segment behavior
 * (switch a mode in place, or navigate to the other route).
 */
export type AutomationView = "canvas" | "backtest" | "bot"

export const VIEW_ICON: Record<AutomationView, LucideIcon> = {
  canvas: WorkflowIcon,
  backtest: FlaskConicalIcon,
  bot: BotIcon,
}

export type ViewSegment = {
  id: AutomationView
  label: string
  active: boolean
  onSelect: () => void
  /** When set, the segment is locked and shows this reason in a tooltip. */
  disabledReason?: string
}

/** Rounded pill of view segments; the active one fills dark. */
export function ViewSwitcher({ segments }: { segments: ViewSegment[] }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {segments.map((segment) => {
        const Icon = VIEW_ICON[segment.id]
        const button = (
          <button
            type="button"
            disabled={Boolean(segment.disabledReason)}
            aria-pressed={segment.active}
            onClick={segment.onSelect}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              segment.active
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {segment.label}
          </button>
        )
        if (!segment.disabledReason) {
          return <span key={segment.id}>{button}</span>
        }
        return (
          <Tooltip key={segment.id}>
            <TooltipTrigger asChild>
              <span tabIndex={0}>{button}</span>
            </TooltipTrigger>
            <TooltipContent side="bottom">{segment.disabledReason}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
