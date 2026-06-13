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

// Two-letter initials for an avatar fallback when no picture is available.
export function creatorInitials(creator: {
  display_name: string | null
  username: string
}) {
  const source = creator.display_name?.trim() || creator.username
  // Skip decorative words like the "|" in "Mikee | Toronto Foodie".
  const words = source.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word[0]))
  const letters =
    words.length >= 2 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)
  return letters.toUpperCase()
}

export const PLATFORM_LABELS = {
  tiktok: "TikTok",
  instagram: "Instagram",
} as const
