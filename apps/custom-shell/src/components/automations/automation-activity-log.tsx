import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

import { AutomationPanelToggles } from "./automation-panel-toggles"
import type { AutomationLogEntry } from "./automation-log"

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

export function AutomationActivityLog({
  entries,
  collapsed,
  onToggleCollapse,
  showPanelToggles = false,
  paletteCollapsed = false,
  inspectorCollapsed = false,
  onTogglePalette,
  onToggleInspector,
}: {
  entries: AutomationLogEntry[]
  /** The panel is squeezed down to just this header (BOTTOM_COLLAPSED_HEIGHT). */
  collapsed: boolean
  onToggleCollapse: () => void
  showPanelToggles?: boolean
  paletteCollapsed?: boolean
  inspectorCollapsed?: boolean
  onTogglePalette?: () => void
  onToggleInspector?: () => void
}) {
  const ToggleIcon = collapsed ? ChevronsUpIcon : ChevronsDownIcon
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Same 44px header height as the palette's tab row. The panel collapses
          to exactly this row, so it always keeps the reopen controls. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Activity log
        </h2>
        <span className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {showPanelToggles && onTogglePalette && onToggleInspector ? (
            <AutomationPanelToggles
              paletteCollapsed={paletteCollapsed}
              inspectorCollapsed={inspectorCollapsed}
              onTogglePalette={onTogglePalette}
              onToggleInspector={onToggleInspector}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={
              collapsed ? "Expand activity log" : "Collapse activity log"
            }
            onClick={onToggleCollapse}
          >
            <ToggleIcon className="size-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div role="log" aria-live="polite" className="grid gap-2 p-4 text-xs">
          {entries.length === 0 ? (
            <p className="text-muted-foreground">
              Canvas changes will appear here. Saving is automatic, so it isn't
              logged.
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 rounded-md border bg-muted/20 px-3 py-2"
              >
                <time
                  dateTime={new Date(entry.time).toISOString()}
                  className="shrink-0 font-mono text-muted-foreground"
                >
                  {timeFormatter.format(entry.time)}
                </time>
                <span>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
