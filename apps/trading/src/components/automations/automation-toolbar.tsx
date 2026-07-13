import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  BotIcon,
  FlaskConicalIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SettingsIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"

export function AutomationToolbar({
  name,
  runnable,
  dirty,
  saving,
  onNameChange,
  onOpenSettings,
  onSave,
  onOpenPalette,
  onOpenInspector,
  onCreateBot,
  onBacktest,
}: {
  name: string
  runnable: boolean
  dirty: boolean
  saving: boolean
  onNameChange: (name: string) => void
  onOpenSettings: () => void
  onSave: () => void
  onOpenPalette: () => void
  onOpenInspector: () => void
  onCreateBot?: () => void
  onBacktest?: () => void
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden h-8 xl:inline-flex"
        disabled={!runnable}
        onClick={onBacktest}
      >
        <FlaskConicalIcon className="size-3.5" />
        Backtest
      </Button>
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
          <DropdownMenuItem disabled={!runnable} onSelect={onBacktest}>
            <FlaskConicalIcon className="size-4" />
            Backtest
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!runnable} onSelect={onCreateBot}>
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
