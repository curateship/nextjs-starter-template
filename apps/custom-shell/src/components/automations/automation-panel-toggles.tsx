import { PanelLeftIcon, PanelRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The two "hide/show side panel" buttons shared by the activity-log header and
 * the collapsed-log bar. Kept in one place so the icons and labels can't drift.
 * Plain panel glyphs (per the design mock) — the pressed state and label carry
 * the open/closed meaning, not an icon swap.
 */
export function AutomationPanelToggles({
  paletteCollapsed,
  inspectorCollapsed,
  onTogglePalette,
  onToggleInspector,
}: {
  paletteCollapsed: boolean
  inspectorCollapsed: boolean
  onTogglePalette: () => void
  onToggleInspector: () => void
}) {
  return (
    <>
      <PanelToggle
        collapsed={paletteCollapsed}
        label={paletteCollapsed ? "Show node palette" : "Hide node palette"}
        Icon={PanelLeftIcon}
        onClick={onTogglePalette}
      />
      <PanelToggle
        collapsed={inspectorCollapsed}
        label={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
        Icon={PanelRightIcon}
        onClick={onToggleInspector}
      />
    </>
  )
}

function PanelToggle({
  collapsed,
  label,
  Icon,
  onClick,
}: {
  collapsed: boolean
  label: string
  Icon: typeof PanelLeftIcon
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      aria-pressed={collapsed}
      title={label}
      onClick={onClick}
    >
      <Icon className="size-4" />
    </Button>
  )
}
