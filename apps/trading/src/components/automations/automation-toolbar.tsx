import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  BotIcon,
  FlaskConicalIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
  WorkflowIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type AutomationView = "canvas" | "backtest"

/**
 * Pill switcher between the node canvas and the backtest chart. The active
 * segment fills dark; a disabled reason (e.g. order-book strategies with no
 * historical replay) locks the Backtest segment behind a tooltip.
 */
function ViewSwitcher({
  view,
  onViewChange,
  backtestDisabledReason,
}: {
  view: AutomationView
  onViewChange: (view: AutomationView) => void
  backtestDisabledReason?: string
}) {
  const segment = (
    id: AutomationView,
    label: string,
    Icon: typeof WorkflowIcon,
    disabledReason?: string
  ) => {
    const active = view === id
    const button = (
      <button
        type="button"
        disabled={Boolean(disabledReason)}
        aria-pressed={active}
        onClick={() => onViewChange(id)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          active
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className="size-3.5" />
        {label}
      </button>
    )
    if (!disabledReason) return button
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
      {segment("canvas", "Canvas", WorkflowIcon)}
      {segment("backtest", "Backtest", FlaskConicalIcon, backtestDisabledReason)}
    </div>
  )
}

/**
 * Disabled buttons swallow pointer events, so the tooltip trigger wraps them
 * in a focusable span. Rendered only while a reason exists; enabled buttons
 * stay unwrapped.
 */
function DisabledReasonTooltip({
  reason,
  children,
}: {
  reason: string | undefined
  children: React.ReactNode
}) {
  if (!reason) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="hidden rounded-md xl:inline-flex">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  )
}

export function AutomationToolbar({
  name,
  runnable,
  backtestDisabledReason,
  runnableDisabledReason,
  view,
  onViewChange,
  dirty,
  saving,
  onNameChange,
  onOpenSettings,
  onSave,
  onOpenPalette,
  onOpenInspector,
  onCreateBot,
}: {
  name: string
  runnable: boolean
  backtestDisabledReason?: string
  runnableDisabledReason?: string
  /** Which editor surface is showing — the switcher renders it pressed. */
  view: AutomationView
  onViewChange: (view: AutomationView) => void
  dirty: boolean
  saving: boolean
  onNameChange: (name: string) => void
  onOpenSettings: () => void
  onSave: () => void
  onOpenPalette: () => void
  onOpenInspector: () => void
  onCreateBot?: () => void
}) {
  return (
    <div className="relative flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
      <Button asChild variant="ghost" size="icon-xs">
        <Link to="/automations" aria-label="Back to Automations">
          <ArrowLeftIcon className="size-4" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="xl:hidden"
        aria-label="Open node palette"
        onClick={onOpenPalette}
      >
        <PanelLeftIcon className="size-4" />
      </Button>

      <div className="min-w-0 max-w-44 flex-1 sm:max-w-56">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Automation name"
          className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="ml-auto" />

      {/* Centered view switcher: canvas ↔ backtest. Opening a view never
          requires a save — the backtest panel's Run button carries that
          gating with its own reason. */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 xl:block">
        <ViewSwitcher
          view={view}
          onViewChange={onViewChange}
          backtestDisabledReason={backtestDisabledReason}
        />
      </div>

      <DisabledReasonTooltip reason={runnableDisabledReason}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden h-8 xl:inline-flex"
          disabled={!runnable}
          onClick={onCreateBot}
        >
          <BotIcon className="size-3.5" />
          Create Bot
        </Button>
      </DisabledReasonTooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="xl:hidden"
            aria-label="Automation actions"
          >
            <MoreHorizontalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => onViewChange("canvas")}>
            <WorkflowIcon className="size-4" />
            Canvas
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={Boolean(backtestDisabledReason)}
            onSelect={() => onViewChange("backtest")}
            title={backtestDisabledReason}
          >
            <FlaskConicalIcon className="size-4" />
            Backtest
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!runnable}
            onSelect={onCreateBot}
            title={runnableDisabledReason}
          >
            <BotIcon className="size-4" />
            Create Bot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        onClick={onOpenSettings}
      >
        <SettingsIcon className="size-3.5" />
        Settings
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-8"
        disabled={saving || !dirty}
        onClick={onSave}
      >
        {saving ? "Saving…" : dirty ? "Save" : "Saved"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="xl:hidden"
        aria-label="Open automation settings"
        onClick={onOpenInspector}
      >
        <PanelRightIcon className="size-4" />
      </Button>
    </div>
  )
}
