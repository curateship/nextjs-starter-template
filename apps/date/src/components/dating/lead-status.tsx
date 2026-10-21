import { LEAD_STATUS_WORDS, type LeadListItem, type LeadStatus } from "@/lib/dating/leads"
import { cn } from "@/lib/utils"

import { LEAD_DOT, LEAD_PILL, needsWords } from "./lead-status-style"

/** A status as a small pill with its dot. */
export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap", LEAD_PILL[status])}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", status === "date" ? "bg-background" : LEAD_DOT[status])} />
      {LEAD_STATUS_WORDS[status]}
    </span>
  )
}

export function NeedsBadge({ lead }: { lead: LeadListItem }) {
  const needs = needsWords(lead)
  if (!needs) return <span className="text-muted-foreground">-</span>
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        needs.urgent ? "border-destructive/40 text-destructive" : "bg-background"
      )}
    >
      {needs.words}
    </span>
  )
}
