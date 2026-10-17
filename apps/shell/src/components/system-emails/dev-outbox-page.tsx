import * as React from "react"
import { EyeIcon, InboxIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import { formatDateTime } from "@/lib/format/format-time"
import { useTableSort } from "@/lib/hooks/use-table-sort"

type SortColumn = "subject" | "recipient" | "created"

const DEV_OUTBOX_COLUMNS: SortableColumn<SortColumn>[] = [
  { key: "subject", label: "Subject", column: "main" },
  {
    key: "recipient",
    label: "Recipient",
    column: "meta",
    className: "hidden sm:table-cell",
  },
  { key: "created", label: "Produced", column: "meta" },
]

export function DevOutboxPage({ emails }: { emails: DevOutboxItem[] }) {
  const [preview, setPreview] = React.useState<DevOutboxItem | null>(null)
  const { sort, direction, toggleSort } = useTableSort<SortColumn>(
    "created",
    "desc",
    (column) => (column === "created" ? "desc" : "asc"),
  )

  const rows = React.useMemo(() => {
    const factor = direction === "asc" ? 1 : -1
    return [...emails].sort((left, right) => {
      if (sort === "subject") {
        return factor * left.subject.localeCompare(right.subject)
      }
      if (sort === "recipient") {
        return factor * left.toEmail.localeCompare(right.toEmail)
      }
      return factor * left.created_at.localeCompare(right.created_at)
    })
  }, [direction, emails, sort])

  return (
    <>
      <DashboardTable
        title="Dev outbox"
        icon={<InboxIcon />}
        count={emails.length}
        footer={{
          type: "summary",
          count: emails.length,
          label: "recent emails kept until this server restarts",
        }}
        header={
          <SortableTableHeader
            columns={DEV_OUTBOX_COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={emails.length === 0}
        emptyText="Emails produced during development will appear here."
        emptyColSpan={4}
      >
        {rows.map((email) => (
          <TableRow
            key={email.id}
            className="group"
            rowAction={() => setPreview(email)}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left font-medium underline-offset-2 group-hover:underline"
                title={email.subject}
                onClick={() => setPreview(email)}
              >
                {email.subject}
              </button>
              <span className="mt-0.5 block max-w-96 truncate text-sm text-muted-foreground sm:hidden">
                {email.toEmail}
              </span>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden sm:table-cell">
              <span className="block max-w-72 truncate" title={email.toEmail}>
                {email.toEmail}
              </span>
            </TableCell>
            <TableCell column="mutedMeta">
              {formatDateTime(email.created_at)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Preview ${email.subject}`}
                onClick={() => setPreview(email)}
              >
                <EyeIcon aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent variant="admin" className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{preview?.subject}</DialogTitle>
            <DialogDescription>To {preview?.toEmail}</DialogDescription>
          </DialogHeader>
          <DialogBody className="bg-muted/40">
            {preview ? (
              <iframe
                title={`Email preview: ${preview.subject}`}
                srcDoc={preview.html}
                sandbox=""
                className="h-[60vh] w-full rounded-lg bg-white ring-1 ring-border"
              />
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setPreview(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
