import { PanelToggle } from "@/components/panel-toggles"

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
        side="left"
        collapsed={paletteCollapsed}
        label={paletteCollapsed ? "Show node palette" : "Hide node palette"}
        onClick={onTogglePalette}
      />
      <PanelToggle
        side="right"
        collapsed={inspectorCollapsed}
        label={inspectorCollapsed ? "Show inspector" : "Hide inspector"}
        onClick={onToggleInspector}
      />
    </>
  )
}
