export {
  AdminBulkDeleteButton,
  AdminConfirmDialog,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSelectionBanner,
  AdminSortButton,
  formatRelativeDate,
} from "./components"
export { useAdminBulkSelection, useAdminSort } from "./hooks"
export type { AdminSortDirection } from "./hooks"

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
})

export function formatShortDate(value: string | Date | null | undefined, fallback = "-") {
  if (!value) return fallback
  return shortDateFormatter.format(new Date(value))
}
