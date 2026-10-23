export const MIN_ADMIN_SIDEBAR_WIDTH = 144
export const MAX_ADMIN_SIDEBAR_WIDTH = 420
export const DEFAULT_ADMIN_SIDEBAR_WIDTH = 218

export function clampAdminSidebarWidth(width: number) {
  return Math.min(
    MAX_ADMIN_SIDEBAR_WIDTH,
    Math.max(MIN_ADMIN_SIDEBAR_WIDTH, Math.round(width))
  )
}
