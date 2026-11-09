import * as React from "react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader } from "@/components/crm/crm-row"
import { CrmTable, CrmTableRow, Dot, OpenBar } from "@/components/crm/crm-table"
import { SystemEmailRecord } from "@/components/crm/system-email-record"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { SystemEmailListItem } from "@/lib/api/email/system-emails"
import type { BroadcastBlockDefaults } from "@/lib/broadcasts/blocks"
import type { CrmSearch } from "@/lib/crm/crm-search"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { RECENT_SEND_DAYS, SYSTEM_EMAIL_META, type SystemEmailKind } from "@/lib/system-emails/kinds"

/** The columns; the list keeps the app's own order, so none of them sorts. */
type Column = "name" | "when" | "sent"

/**
 * The CRM's System emails section (Tyler, 9 Nov 2026: "for CRM dashboard.
 * Bring the systems email to its own dashboard"). Until then they were a tab
 * of the CRM settings ⋮ that opened one in the Broadcasts section's right
 * panel.
 *
 * - **Middle:** every email the app sends for itself, in the app's own order
 *   (`SYSTEM_EMAIL_KINDS`), in the CRM's one header and table shape: its
 *   name, when it goes out right after it, and how many went in the last
 *   30 days (failures after them). No Words column and no cog at the end
 *   ("remove the "Words" col and remove the action col"). The ⋮ has Search.
 * - **Right:** the one open, its editor (`SystemEmailRecord`), as it was. With
 *   no `?open=` it is the first row.
 */
export function CrmSystemEmailsTab({
  emails,
  blockDefaults,
  search,
  heading,
  headingEnd,
  frame,
}: {
  emails: SystemEmailListItem[]
  blockDefaults: BroadcastBlockDefaults
  search: CrmSearch
  heading: React.ReactNode
  headingEnd: React.ReactNode
  frame: CrmFrame
}) {
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const q = search.q ?? ""
  const query = q.trim().toLowerCase()
  const shown = emails.filter((email) => {
    if (!query) return true
    const meta = SYSTEM_EMAIL_META[email.kind]
    return [meta.name, meta.whenSent, email.subject].some((text) => text.toLowerCase().includes(query))
  })
  const ids = shown.map((email) => email.kind)
  const asked = ids.find((kind) => kind === search.open)
  const openKind: SystemEmailKind | undefined = asked ?? ids[0]

  const columns: TableHeaderColumn<Column>[] = [
    // The name only as wide as the longest, and When it goes out taking
    // the room after it, so the two sit together (Tyler, 9 Nov 2026: "the
    // goes out col can sit close to the title").
    // The main column's own width (all the room, at least 20rem) is undone.
    { key: "name", label: "Email", sortable: false, column: "main", className: "!w-auto !min-w-0 whitespace-nowrap" },
    { key: "when", label: "Goes out", sortable: false, column: "preview", className: "hidden w-full md:hidden @3xl:table-cell" },
    { key: "sent", label: `Sent, ${RECENT_SEND_DAYS} days`, sortable: false, column: "meta" },
  ]

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        menuLabel="More for system emails"
        search={{
          name: "system-email-search",
          label: "Search system emails",
          placeholder: "Search system emails",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={null}
      />
        <CrmTable<Column>
          columns={columns}
          sort={"name" as Column}
          direction="asc"
          onSort={() => {}}
          select={null}
          // A row only opens, so no cog at the end ("remove the action col").
          actions={false}
          empty={
            shown.length > 0 ? null : (
              <span className="grid justify-items-center gap-2">
                {`No system email matches "${q.trim()}".`}
                <Button type="button" variant="outline" size="sm" onClick={() => setListSearch({ q: undefined })}>
                  Clear search
                </Button>
              </span>
            )
          }
        >
          {shown.map((email) => {
            const meta = SYSTEM_EMAIL_META[email.kind]
            return (
              <CrmTableRow
                key={email.kind}
                open={email.kind === openKind}
                label={meta.name}
                tick={null}
                onOpen={() => setOpen(email.kind)}
              >
                <TableCell column="main" className="!min-w-0 whitespace-nowrap">
                  <span className="flex min-w-0 items-center gap-2">
                    <OpenBar />
                    {/* Amber when some failed to go in the last 30 days. */}
                    {email.recentFailed > 0 ? (
                      <Dot className="bg-amber-500" label={`${email.recentFailed} failed to send`} />
                    ) : null}
                    <span data-row-name="" className="truncate font-medium">
                      {meta.name}
                    </span>
                  </span>
                </TableCell>
                <TableCell column="preview" className="hidden w-full max-w-0 md:hidden @3xl:table-cell">
                  <span className="block truncate text-muted-foreground">{meta.whenSent}</span>
                </TableCell>
                <TableCell column="mutedMeta">
                  <span className="whitespace-nowrap tabular-nums">
                    {email.recentSent.toLocaleString()}
                    {email.recentFailed > 0 ? `, ${email.recentFailed.toLocaleString()} failed` : ""}
                  </span>
                </TableCell>
              </CrmTableRow>
            )
          })}
        </CrmTable>
    </div>
  )

  return frame({
    ids,
    showMiddleFor: "system",
    showRightFor: search.open,
    middle,
    right: {
      label: "Email",
      showLabel: "Show the email",
      content: openKind ? (
        <SystemEmailRecord key={openKind} kind={openKind} blockDefaults={blockDefaults} />
      ) : null,
    },
  })
}
