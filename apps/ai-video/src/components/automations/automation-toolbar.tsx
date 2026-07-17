import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  Loader2Icon,
  PanelLeftIcon,
  PanelRightIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export function AutomationToolbar({
  name,
  enabled,
  dirty,
  saving,
  runnable,
  runDisabledReason,
  runActive,
  canceling,
  onNameChange,
  onEnabledChange,
  onSave,
  onRun,
  onCancelRun,
  onOpenPalette,
  onOpenInspector,
}: {
  name: string
  enabled: boolean
  dirty: boolean
  saving: boolean
  runnable: boolean
  runDisabledReason?: string
  runActive: boolean
  canceling: boolean
  onNameChange: (name: string) => void
  onEnabledChange: (enabled: boolean) => void
  onSave: () => void
  onRun: () => void
  onCancelRun: () => void
  onOpenPalette: () => void
  onOpenInspector: () => void
}) {
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3">
      <Button asChild variant="ghost" size="icon-xs">
        <Link to="/admin/automations" aria-label="Back to Automations">
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

      <div className="hidden items-center gap-2 sm:flex">
        <Switch
          id="automation-enabled"
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label="Enable scheduled and creator triggers"
        />
        <Label
          htmlFor="automation-enabled"
          className="text-xs text-muted-foreground"
        >
          Enabled
        </Label>
      </div>

      {runActive ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={canceling}
          onClick={onCancelRun}
        >
          {canceling ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SquareIcon className="size-3.5" />
          )}
          Cancel run
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={!runnable}
          title={runDisabledReason}
          aria-label={
            runDisabledReason ? `Run unavailable: ${runDisabledReason}` : "Run"
          }
          onClick={onRun}
        >
          <PlayIcon className="size-3.5" />
          Run
        </Button>
      )}

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
        aria-label="Open inspector"
        onClick={onOpenInspector}
      >
        <PanelRightIcon className="size-4" />
      </Button>
    </div>
  )
}
