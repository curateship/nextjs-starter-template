import { InboxIcon, SendIcon } from "lucide-react"

import { CrmTable, CrmTableRow, Dot, DOT, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, FooterState, RecordFrame } from "@/components/crm/record-frame"
import { TableCell } from "@/components/ui/table"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { formatDateTime } from "@/lib/format/format-time"

/**
 * The Inbox's Outbox pill (Tyler, 7 Nov 2026: "an 'Outbox' pill under Inbox,
 * local only, read like conversations"). The mail this server would have sent
 * while it runs on a laptop: sign-in links, system emails, test newsletters.
 * None of it was really sent, and it empties when the server restarts. A live
 * server keeps none, so the pill is not drawn there.
 */
export function OutboxTable({
  emails,
  openId,
  onOpen,
}: {
  emails: DevOutboxItem[]
  openId: string | null
  onOpen: (emailId: string) => void
}) {
  return (
    <CrmTable
      columns={[
        { key: "to", label: "To", sortable: false, column: "main", className: "min-w-40" },
        { key: "subject", label: "Subject", sortable: false, column: "preview", className: "min-w-56" },
        { key: "when", label: "When", sortable: false, column: "meta" },
      ]}
      sort="when"
      direction="desc"
      onSort={() => undefined}
      empty={emails.length ? null : "Nothing has been sent from this server since it started."}
    >
      {emails.map((email) => (
        <CrmTableRow key={email.id} open={email.id === openId} label={email.subject} onOpen={() => onOpen(email.id)}>
          <MainCell name={email.toEmail} lead={<Dot className={DOT.quiet} />} />
          <TableCell column="preview" className="max-w-96 min-w-56">
            <span className="block truncate text-muted-foreground">{email.subject}</span>
          </TableCell>
          <TableCell column="mutedMeta">{formatInboxTime(email.created_at)}</TableCell>
        </CrmTableRow>
      ))}
    </CrmTable>
  )
}

/** The right panel under the Outbox pill: one email, as it would have arrived. */
export function OutboxEmailPanel({ email }: { email: DevOutboxItem | null }) {
  if (!email) {
    return (
      <EmptyRecord
        title="Email"
        icon={<InboxIcon aria-hidden />}
        line="Click an email to read it here."
        hideLabel="Hide the email"
      />
    )
  }
  return (
    <RecordFrame
      avatar={<SendIcon aria-hidden />}
      title={email.subject}
      line={`To ${email.toEmail}`}
      hideLabel="Hide the email"
      body={
        // Sandboxed with nothing allowed: the app wrote this mail, but it
        // carries whatever a member typed into it.
        <iframe
          title={`Email: ${email.subject}`}
          srcDoc={email.html}
          sandbox=""
          className="h-[70vh] w-full rounded-lg bg-white ring-1 ring-border"
        />
      }
      footer={
        <FooterState>
          <span className="text-muted-foreground">
            {formatDateTime(email.created_at)}, not really sent
          </span>
        </FooterState>
      }
    />
  )
}
