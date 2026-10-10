import { UserIcon } from "lucide-react"

import { LeadDetails } from "@/components/crm/lead-details"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { EmptyRow } from "@/components/shared/feed-card"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LeadBundle } from "@/lib/api/crm/leads"

/**
 * The right panel: who this conversation is with, and where they are up to.
 *
 * One column, no tabs. It held four at first — the lead, their whole history,
 * notes and to-dos, and saved replies — and Tyler called that badly thought
 * out on 3 Oct 2026. He was right: three of the four were things you would go
 * looking for once a month, parked permanently beside the thing you look at
 * every time, and each one hid the others behind a click.
 *
 * What is left is what the panel is for: who they are, what stage they are at,
 * what the work is worth, and when to chase them.
 */
export function LeadPanel({
  bundle,
  loading,
  onChanged,
}: {
  bundle: LeadBundle | null
  loading: boolean
  /** Reloads this panel, and the inbox with it when a stage or date moved. */
  onChanged: () => void
}) {
  if (!bundle) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
        <DashboardCardTitleHeader
          icon={<UserIcon className="size-4" />}
          title="Lead"
        />
        <div className="grid min-h-0 flex-1 place-items-center">
          {loading ? (
            <LoadingRow label="Reading…" />
          ) : (
            <EmptyRow>Open a conversation to see who it is with.</EmptyRow>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<UserIcon className="size-4" />}
        title={bundle.lead.name?.trim() || bundle.lead.email}
        meta={bundle.lead.company ?? undefined}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          <LeadDetails lead={bundle.lead} onChanged={onChanged} />
        </div>
      </ScrollArea>
    </div>
  )
}
