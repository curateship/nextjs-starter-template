import { useRouter } from "@tanstack/react-router"
import { MailIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getOutreachErrorMessage,
  loadOutreach,
  sendOutreach,
} from "@/lib/api/directory/outreach"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"

type Overview = Awaited<ReturnType<typeof loadOutreach>>

export function OutreachDashboard({ data }: { data: Overview }) {
  const router = useRouter()
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getOutreachErrorMessage)
  const rows = data.listings
  const eligibleIds = rows.filter((row) => row.status === "ready").map((row) => row.id)
  const selectedIds = [...selection.selected].filter((id) => eligibleIds.includes(id))

  return (
    <>
    <DashboardTable
      title="Claim outreach"
      icon={<MailIcon className="text-muted-foreground" />}
      count={rows.length}
      selectedCount={selectedIds.length}
      onClearSelection={selection.clear}
      controls={
        selectedIds.length ? (
          <DashboardToolbarButton
            type="button"
            disabled={busy}
            onClick={() => void run(async () => {
              const result = await sendOutreach(selectedIds)
              selection.clear()
              await router.invalidate()
              toast.success(
                `${result.sent.length} sent, ${result.skipped.length} skipped, ${result.failed.length} failed.`
              )
            })}
          >
            <MailIcon /> Send invitations ({selectedIds.length})
          </DashboardToolbarButton>
        ) : null
      }
      header={
        <TableHeader><TableRow>
          <TableHead column="select">
            <Checkbox
              checked={selection.selectAllState(eligibleIds)}
              disabled={eligibleIds.length === 0}
              onCheckedChange={() => selection.toggleVisible(eligibleIds)}
              aria-label="Select all listings ready for outreach"
            />
          </TableHead>
          <TableHead column="main">Listing</TableHead>
          <TableHead column="meta">Contact</TableHead>
          <TableHead column="meta">Status</TableHead>
          <TableHead column="meta">History</TableHead>
        </TableRow></TableHeader>
      }
      isEmpty={rows.length === 0}
      emptyText="No unclaimed published listing has a contact email on this site."
      emptyColSpan={5}
      footer={{ type: "summary", count: rows.length, label: "listings" }}
    >
      {rows.map((row) => {
        const eligible = row.status === "ready"
        const label = row.status === "opted_out"
          ? "Opted out"
          : row.sendStatus === "sent"
            ? "Already contacted"
            : row.status === "sent"
              ? "Already attempted"
              : "Ready"
        return (
          <TableRow key={row.id}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(row.id)}
                disabled={!eligible}
                onCheckedChange={() => selection.toggle(row.id)}
                aria-label={`Select ${row.title}`}
              />
            </TableCell>
            <TableCell column="main" className="font-medium">{row.title}</TableCell>
            <TableCell column="meta"><span className="block max-w-64 truncate">{row.email}</span></TableCell>
            <TableCell column="meta"><Badge variant={eligible ? "secondary" : "outline"}>{label}</Badge></TableCell>
            <TableCell column="meta">
              {row.sentAt ? (
                <><span>{formatDate(row.sentAt)}</span>{row.sendStatus === "failed" ? <span className="block max-w-64 truncate text-xs text-destructive" title={row.error}>Failed: {row.error}</span> : null}</>
              ) : "—"}
            </TableCell>
          </TableRow>
        )
      })}
    </DashboardTable>
    <DashboardTable
      title="Send history"
      icon={<MailIcon className="text-muted-foreground" />}
      count={data.history.length}
      header={
        <TableHeader><TableRow>
          <TableHead column="main">Listing</TableHead>
          <TableHead column="meta">Address</TableHead>
          <TableHead column="meta">Result</TableHead>
          <TableHead column="meta">Date</TableHead>
        </TableRow></TableHeader>
      }
      isEmpty={data.history.length === 0}
      emptyText="No claim invitation has been attempted on this site yet."
      emptyColSpan={4}
      footer={{ type: "summary", count: data.history.length, label: "attempts" }}
    >
      {data.history.map((item) => (
        <TableRow key={item.id}>
          <TableCell column="main" className="font-medium">{item.listingTitle}</TableCell>
          <TableCell column="meta"><span className="block max-w-64 truncate">{item.email}</span></TableCell>
          <TableCell column="meta">
            <Badge variant={item.status === "sent" ? "secondary" : "outline"}>{item.status}</Badge>
            {item.error ? <span className="block max-w-64 truncate text-xs text-destructive" title={item.error}>{item.error}</span> : null}
          </TableCell>
          <TableCell column="meta">{formatDate(item.createdAt)}</TableCell>
        </TableRow>
      ))}
    </DashboardTable>
    </>
  )
}
