import { Link } from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  CheckIcon,
  PanelLeftIcon,
  PanelRightIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SaveStatus } from "@/pages/dashboard/sticky-header/sticky-header"

/**
 * The editor's top bar: back link, name, and the auto-save status. There is no
 * Save button — edits save themselves on the shell's 700ms debounce, the same
 * contract as the settings pages. Activate/pause controls arrive with the
 * engine task; until flows can run there is nothing to switch on.
 */
export function AutomationToolbar({
  name,
  saveStatus,
  onNameChange,
  onOpenPalette,
  onOpenInspector,
}: {
  name: string
  saveStatus: SaveStatus
  onNameChange: (name: string) => void
  onOpenPalette: () => void
  onOpenInspector: () => void
}) {
  return (
    <div
      // A full-width flat subheader bar (the trading editor's pattern), not a
      // floating card. Negative margins pull it through the page gutter so it
      // sits flush under the sticky header and spans edge to edge.
      className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-3"
      style={{
        marginTop: "calc(var(--shell-gutter, 0.75rem) * -1)",
        marginLeft: "calc(var(--shell-gutter, 0.75rem) * -1)",
        marginRight: "calc(var(--shell-gutter, 0.75rem) * -1)",
      }}
    >

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

      <div className="max-w-44 min-w-0 flex-1 sm:max-w-56">
        <Input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          aria-label="Automation name"
          aria-invalid={saveStatus === "blocked" || undefined}
          className="h-7 border-0 bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="ml-auto" />
      <SaveStatusText status={saveStatus} />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="xl:hidden"
        aria-label="Open automation inspector"
        onClick={onOpenInspector}
      >
        <PanelRightIcon className="size-4" />
      </Button>
    </div>
  )
}

// Mirrors the shared header's SaveStatusIndicator wording so auto-save reads
// the same here as on the settings pages. "blocked" is the honest state for an
// edit that cannot be saved (an empty name) — never silence, never a spinner.
function SaveStatusText({ status }: { status: SaveStatus }) {
  if (status === "saving") {
    return <span className="text-sm text-muted-foreground">Saving…</span>
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckIcon className="size-4" />
        Saved
      </span>
    )
  }
  if (status === "blocked") {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-sm text-destructive"
      >
        <TriangleAlertIcon className="size-4" />
        Not saved — name the automation
      </span>
    )
  }
  return null
}
