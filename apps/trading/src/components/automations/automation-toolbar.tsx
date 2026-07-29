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
  ViewSwitcher,
  type AutomationView,
} from "@/components/automations/automation-view-switcher"

export type { AutomationView }

export function AutomationToolbar({
  name,
  backtestDisabledReason,
  view,
  onViewChange,
  dirty,
  saving,
  onNameChange,
  onOpenSettings,
  onSave,
  onSaveRun,
  onOpenPalette,
  onOpenInspector,
}: {
  name: string
  backtestDisabledReason?: string
  /** Which editor surface is showing — the switcher renders it pressed. */
  view: AutomationView
  onViewChange: (view: AutomationView) => void
  dirty: boolean
  saving: boolean
  onNameChange: (name: string) => void
  onOpenSettings: () => void
  onSave: () => void
  /** Backtest results only: opens the name-and-save-this-run modal. */
  onSaveRun?: () => void
  onOpenPalette: () => void
  onOpenInspector: () => void
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

      {/* Centered view switcher: canvas ↔ backtest ↔ bot. Opening a view never
          requires a save — each mode's Run/Deploy button carries that gating
          with its own reason. */}
      <div className="absolute left-1/2 hidden -translate-x-1/2 xl:block">
        <ViewSwitcher
          segments={[
            {
              id: "canvas",
              label: "Canvas",
              active: view === "canvas",
              onSelect: () => onViewChange("canvas"),
            },
            {
              id: "backtest",
              label: "Backtest",
              active: view === "backtest",
              onSelect: () => onViewChange("backtest"),
              disabledReason: backtestDisabledReason,
            },
            {
              id: "bot",
              label: "Bot",
              active: view === "bot",
              onSelect: () => onViewChange("bot"),
            },
          ]}
        />
      </div>

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
          <DropdownMenuItem onSelect={() => onViewChange("bot")}>
            <BotIcon className="size-4" />
            Bot
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {onSaveRun ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={onSaveRun}
        >
          Save run
        </Button>
      ) : null}
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
