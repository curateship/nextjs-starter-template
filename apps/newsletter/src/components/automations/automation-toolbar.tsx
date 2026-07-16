import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  PanelLeftIcon,
  PanelRightIcon,
  PauseIcon,
  PlayIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AutomationStatus } from "@/lib/api/automations"

const STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
}

export function AutomationToolbar({
  name,
  status,
  runnable,
  dirty,
  saving,
  statusBusy,
  onNameChange,
  onSave,
  onToggleStatus,
  onOpenPalette,
  onOpenInspector,
}: {
  name: string
  status: AutomationStatus
  /** Compile passed, nothing dirty, nothing saving — safe to (de)activate. */
  runnable: boolean
  dirty: boolean
  saving: boolean
  statusBusy: boolean
  onNameChange: (name: string) => void
  onSave: () => void
  onToggleStatus: () => void
  onOpenPalette: () => void
  onOpenInspector: () => void
}) {
  const active = status === "active"
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

      <div className="max-w-44 min-w-0 flex-1 sm:max-w-56">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Automation name"
          className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
        />
      </div>
      <Badge
        variant={active ? "default" : status === "paused" ? "secondary" : "outline"}
        className="shrink-0"
      >
        {STATUS_LABELS[status]}
      </Badge>
      <div className="ml-auto" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={!runnable || statusBusy}
        title={
          runnable
            ? undefined
            : "Save a valid automation before changing its status."
        }
        onClick={onToggleStatus}
      >
        {active ? (
          <PauseIcon className="size-3.5" />
        ) : (
          <PlayIcon className="size-3.5" />
        )}
        {statusBusy
          ? active
            ? "Pausing…"
            : "Activating…"
          : active
            ? "Pause"
            : "Activate"}
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
