// Draggable sidebar width, persisted per-workspace. The rail in ui/sidebar.tsx
// updates `--sidebar-width` live while dragging and commits the final px value;
// shell-layout saves it. Shared by the UI, the config schema, and the server so
// the clamp bounds stay in one place.
export const DEFAULT_SIDEBAR_WIDTH = 218
export const MIN_SIDEBAR_WIDTH = 144
export const MAX_SIDEBAR_WIDTH = 420

export function clampSidebarWidth(value: number) {
  return Math.min(
    MAX_SIDEBAR_WIDTH,
    Math.max(MIN_SIDEBAR_WIDTH, Math.round(value))
  )
}
