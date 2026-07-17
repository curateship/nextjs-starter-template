import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * The two "hide/show side panel" buttons shared by the activity-log header and
 * the collapsed-log bar. Kept in one place so the icons and labels can't drift.
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
        OpenIcon={PanelLeftOpenIcon}
        CloseIcon={PanelLeftCloseIcon}
        onClick={onTogglePalette}
      />
      <PanelToggle
        collapsed={inspectorCollapsed}
        label={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
        OpenIcon={PanelRightOpenIcon}
        CloseIcon={PanelRightCloseIcon}
        onClick={onToggleInspector}
      />
    </>
  )
}

function PanelToggle({
  collapsed,
  label,
  OpenIcon,
  CloseIcon,
  onClick,
}: {
  collapsed: boolean
  label: string
  OpenIcon: typeof PanelLeftOpenIcon
  CloseIcon: typeof PanelLeftCloseIcon
  onClick: () => void
}) {
  const Icon = collapsed ? OpenIcon : CloseIcon
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
