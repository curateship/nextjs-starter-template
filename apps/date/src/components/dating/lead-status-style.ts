import type { LeadGroup, LeadListItem, LeadStatus } from "@/lib/dating/leads"
import { formatClockTime } from "@/lib/format/format-time"

/**
 * How Tyler's mock of 20 Oct 2026 colours a lead's status
 * (`workspace/docs/assets/pasted-image-1792550342758871000.png`): green while
 * chatting, blue once matched, black for a date and for waiting on you, grey
 * for new, and faded for passed, liked and over.
 */
export const LEAD_DOT: Record<LeadGroup, string> = {
  waiting: "bg-foreground",
  new: "bg-muted-foreground",
  liked: "bg-muted-foreground/40",
  passed: "bg-muted-foreground/40",
  matched: "bg-blue-500",
  chatting: "bg-emerald-500",
  date: "bg-foreground",
  over: "bg-muted-foreground/40",
}

export const LEAD_PILL: Record<LeadStatus, string> = {
  new: "bg-muted text-foreground",
  liked: "text-muted-foreground",
  passed: "text-muted-foreground",
  matched: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  chatting: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  date: "bg-foreground text-background",
  over: "text-muted-foreground",
}

/** What the lead needs from the member, as the mock's "Needs" column has it, or null. */
export function needsWords(lead: LeadListItem): { words: string; urgent: boolean } | null {
  if (lead.waiting === "draft") return { words: "Review draft", urgent: false }
  if (lead.waiting === "flag") return { words: "Reply yourself", urgent: true }
  if (lead.waiting === "question") return { words: "Answer the AI", urgent: true }
  if (lead.status === "date" && lead.dateAt) {
    // "Date Tue 7:00 PM", short enough for the column; the right panel has the full day.
    const at = new Date(lead.dateAt)
    return { words: `Date ${at.toLocaleDateString("en-GB", { weekday: "short" })} ${formatClockTime(at)}`, urgent: false }
  }
  if (lead.status === "date") return { words: "Set the time", urgent: false }
  return null
}
