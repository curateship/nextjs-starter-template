import { LEAD_GROUP_WORDS, LEAD_SORT_WORDS, defaultLeadDirection, type LeadView } from "@/lib/dating/leads"

/** The Dating dashboard's kind in the shell's saved views. Its screen key is `dating:`, naming no record. */
export const DATING_SAVED_VIEW_KIND = "dating"

const TAB_WORDS = { matches: "Matches", dates: "Dates" } as const

/** `Matches · "hiking" · Waiting on you · Swiped by the AI · 80 or more · Sort: Score`, what a view shows. */
export function describeLeadView(view: LeadView): string {
  const parts: string[] = []
  if (view.tab) parts.push(TAB_WORDS[view.tab])
  if (view.q) parts.push(`"${view.q}"`)
  if (view.group) parts.push(LEAD_GROUP_WORDS[view.group])
  if (view.by) parts.push(view.by === "ai" ? "Swiped by the AI" : "Swiped by you")
  if (view.score) parts.push(`${view.score} or more`)
  if (view.over) parts.push("Over shown")
  if (view.real) parts.push("No samples")
  if (view.sort || view.direction) {
    const sort = view.sort ?? "changed"
    const flipped = view.direction && view.direction !== defaultLeadDirection(sort)
    parts.push(`Sort: ${LEAD_SORT_WORDS[sort]}${flipped ? ", reversed" : ""}`)
  }
  return parts.join(" · ") || "Every lead"
}
