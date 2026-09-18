import { useRouter } from "@tanstack/react-router"
import { FlagIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import { ListingReportDialog } from "@/components/directory/listing-report-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type ListingReportsPage } from "@/lib/api/directory/reports"
import {
  LISTING_REPORT_REASON_LABELS,
  LISTING_REPORT_STATUSES,
  LISTING_REPORT_STATUS_LABELS,
  type ListingReportStatus,
} from "@/lib/directory/report-reasons"
import { formatDate } from "@/lib/format/format-time"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"

/**
 * Problems visitors reported, waiting for somebody to fix them.
 *
 * **The screen opens on the ones still waiting**, not on everything ever
 * reported, because the only question an admin has here is what is left to do.
 * Choosing All in the filter is what asks for the history.
 *
 * **No selection column**, deliberately, in the same way the claims queue has
 * none. Marking thirty reports fixed in one press means marking thirty pages
 * fixed without opening any of them, which is the opposite of what the queue
 * is for.
 */
export function ReportsDashboard({
  data,
  search,
}: {
  data: ListingReportsPage
  search: { status?: ListingReportStatus | "all"; q?: string; open?: string }
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  // The typed text stays in the box and the address catches up once typing
  // pauses, so a shared link and a refresh both keep the search.
  const [searchText, setSearchText] = useSearchBoxText(
    search.q ?? "",
    (value) => setListSearch({ q: value, page: undefined })
  )

  const openReport = search.open
    ? (data.reports.find((row) => row.id === search.open) ?? null)
    : null

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))
  const filter = search.status ?? "open"

  return (
    <>
      <DashboardTable
        title="Reported problems"
        icon={<FlagIcon className="text-muted-foreground" />}
        count={data.total}
        controls={
          <>
            {/* How many are left, said on the screen rather than in a
                notification list — the shell's list of notice kinds is a shell
                file an app may not add to, so this is where the count lives. */}
            {data.waiting && filter !== "open" ? (
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() =>
                  setListSearch({ status: undefined, page: undefined })
                }
              >
                {data.waiting === 1 ? "1 is waiting" : `${data.waiting} waiting`}
              </button>
            ) : null}
            <DashboardToolbarSearch
              name="report-search"
              aria-label="Search reports by listing or note"
              placeholder="Search listing or note…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={filter}
              onValueChange={(value) =>
                setListSearch({
                  // "Waiting" is the default, so it is absent from the address
                  // rather than written into it.
                  status: value === "open" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className="w-fit" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTING_REPORT_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LISTING_REPORT_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        header={
          // `TableHeader` rather than a bare row: a `<tr>` straight inside a
          // `<table>` is invalid, and the browser silently adds the `<tbody>`
          // the markup is missing — a different tree from the server's, so the
          // whole page fails to hydrate.
          <TableHeader>
            <TableRow>
              <TableHead column="main">Listing</TableHead>
              <TableHead column="meta">Problem</TableHead>
              <TableHead column="meta" className="hidden md:table-cell">
                Status
              </TableHead>
              <TableHead column="meta">Reported</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={data.reports.length === 0}
        emptyText={
          // A search that found nothing is not an empty screen, and saying so
          // stops it claiming nobody has ever reported anything.
          search.q
            ? `Nothing matches “${search.q}”. Clear the search to see everything.`
            : filter === "open"
              ? "Nothing is waiting. Problems visitors report appear here."
              : "Nothing with that status."
        }
        emptyColSpan={5}
        footer={{
          type: "pagination",
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages,
          onPageChange: (page) =>
            setListSearch({ page: page > 1 ? page : undefined }),
          onPageSizeChange: (size) => setListSearch({ size, page: undefined }),
        }}
      >
        {data.reports.map((report) => (
          <TableRow
            key={report.id}
            className="group"
            rowAction={() => setListSearch({ open: report.id })}
          >
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => setListSearch({ open: report.id })}
                title={report.listingTitle}
              >
                {report.listingTitle}
              </button>
              {/* Capped, because a note is up to a thousand characters and a
                  row that grows to fit one pushes every other row off screen.
                  The window has the whole thing. */}
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={report.note}
              >
                {report.note || "No note"}
              </span>
            </TableCell>
            <TableCell column="meta">
              <span className="text-xs">
                {LISTING_REPORT_REASON_LABELS[report.reason]}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {report.status === "open" ? (
                <Badge>{LISTING_REPORT_STATUS_LABELS.open}</Badge>
              ) : (
                <Badge variant="outline">
                  {LISTING_REPORT_STATUS_LABELS[report.status]}
                </Badge>
              )}
            </TableCell>
            <TableCell column="meta">{formatDate(report.createdAt)}</TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Open the report about ${report.listingTitle}`}
                onClick={() => setListSearch({ open: report.id })}
              >
                <SettingsIcon className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <ListingReportDialog
        open={Boolean(openReport)}
        report={openReport}
        onClose={() => setListSearch({ open: undefined })}
        onClosed={async (decision) => {
          // **Refetched before the window is closed, and awaited.** Closing the
          // window is a navigation — it drops `?open=` from the address — and a
          // refetch fired alongside that navigation is superseded by it. The
          // row then sits there saying Waiting until somebody reloads, which is
          // exactly what this screen must not do.
          await router.invalidate()
          setListSearch({ open: undefined })
          toast.success(
            decision === "fixed"
              ? "Marked fixed. The count drops by one."
              : "Dismissed. Nothing on the listing changed."
          )
        }}
      />
    </>
  )
}
