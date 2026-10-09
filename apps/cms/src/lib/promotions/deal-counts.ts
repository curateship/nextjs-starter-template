import { plural } from "@/lib/format/plural"

/**
 * An owner's line under a deal on My listings: "300 views · 45 tapped Show
 * code". A deal with no Show code button says its views alone. Each number is
 * people, counted once a day each, so one person reloading the page all
 * afternoon is one view.
 */
export function dealCountsText(counts: {
  views: number
  codeTaps: number | null
}): string {
  const views = `${counts.views.toLocaleString("en-US")} ${plural(counts.views, "view")}`
  if (counts.codeTaps === null) return views
  return `${views} · ${counts.codeTaps.toLocaleString("en-US")} tapped Show code`
}
