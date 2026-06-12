// Shared list-dashboard formatting: the dashboards all render the same date
// style, compact engagement counts, page sizes, and platform labels.

export const pageSizeOptions = [10, 20, 50]

export const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

// Compact engagement count with an em-dash fallback for missing stats.
export function formatCount(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : compactFormatter.format(value)
}

export const PLATFORM_LABELS = {
  tiktok: "TikTok",
  instagram: "Instagram",
} as const
