import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import {
  CheckIcon,
  FlagIcon,
  Loader2Icon,
  RotateCcwIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, useAdminList } from "@/components/pomodoro/admin-list"
import {
  getPomodoroAdminErrorMessage,
  listPomodoroReports,
  reviewPomodoroReport,
  type AdminReportRow,
} from "@/lib/api/pomodoro/admin"
import { formatDateTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { ReportSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-reports")

type SortColumn = ReportSortColumn
type Decision = "pending" | "resolved" | "dismissed"

// "Reported" hides below xl and the room is capped: with both at full width
// the row actions were pushed off the right-hand edge of a 1280px screen.
const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "room", label: "Room", column: "meta", className: "max-w-44" },
  {
    key: "context",
    label: "What was reported",
    sortable: false,
    column: "main",
  },
  { key: "reporter", label: "Reported by", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  {
    key: "created",
    label: "Reported",
    column: "meta",
    className: "hidden xl:table-cell",
  },
]

const STATUS_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { label: "Waiting", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
  dismissed: { label: "Dismissed", variant: "outline" },
}

const DONE_TEXT: Record<Decision, string> = {
  pending: "Report reopened.",
  resolved: "Report resolved.",
  dismissed: "Report dismissed.",
}

/**
 * The moderation queue. A member reports somebody's message inside a focus
 * room; this is where an operator reads it in context and decides.
 *
 * The reported message is shown as it was written, including one the host has
 * already deleted: the body stays in `room_messages` for exactly this reason,
 * and the room itself only ever saw "Message removed by the host".
 */
export function AdminReportsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminReportRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroReports({
        search: query,
        status,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, query, sort, status]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" ? "desc" : "asc"
  )
  const { refresh } = list

  const decide = React.useCallback(
    async (reportId: string, decision: Decision) => {
      setBusyId(reportId)
      try {
        await reviewPomodoroReport(reportId, decision)
        toast.success(DONE_TEXT[decision])
        await refresh()
      } catch (error) {
        showErrorToast(getPomodoroAdminErrorMessage(error))
      } finally {
        setBusyId(null)
      }
    },
    [refresh]
  )

  return (
    <AdminListTable
      title="Room reports"
      icon={<FlagIcon />}
      noun="reports"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      trailing={<TableHead column="meta">Actions</TableHead>}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
          <DashboardToolbarSearch
            name="report-search"
            aria-label="Search reports"
            placeholder="Search reason, room or reporter…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={status}
            onValueChange={(value) =>
              setListSearch({
                status: value === "all" ? undefined : value,
                page: undefined,
              })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Waiting</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {list.rows.map((row) => {
        const busy = busyId === row.id
        return (
          <TableRow key={row.id}>
            <TableCell column="meta" className="max-w-44">
              <span className="block truncate" title={row.roomName}>
                {row.roomName}
              </span>
            </TableCell>
            <TableCell column="main">
              <div className="min-w-0">
                <span className="block max-w-80 truncate" title={row.reason}>
                  {row.reason}
                </span>
                <ReportedMessage row={row} />
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <span className="block truncate" title={row.reporterEmail}>
                {row.reporterName}
              </span>
            </TableCell>
            <TableCell column="meta">
              <div className="min-w-0">
                <Badge variant={STATUS_LOOK[row.status]?.variant ?? "outline"}>
                  {STATUS_LOOK[row.status]?.label ?? row.status}
                </Badge>
                {/* Who signed it off. A reopened report has no reviewer, which
                    is the point: the last decision no longer stands. */}
                {row.reviewerName && row.reviewedAt ? (
                  <span
                    className="mt-1 block max-w-40 truncate text-xs text-muted-foreground"
                    title={`${row.reviewerName} on ${formatDateTime(row.reviewedAt)}`}
                  >
                    {row.reviewerName} · {formatDateTime(row.reviewedAt)}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : row.status === "pending" ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void decide(row.id, "resolved")}
                    title="Resolve this report"
                    aria-label={`Resolve the report about ${row.roomName}`}
                  >
                    <CheckIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void decide(row.id, "dismissed")}
                    title="Dismiss this report"
                    aria-label={`Dismiss the report about ${row.roomName}`}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void decide(row.id, "pending")}
                  title="Reopen this report"
                  aria-label={`Reopen the report about ${row.roomName}`}
                >
                  <RotateCcwIcon className="size-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        )
      })}
    </AdminListTable>
  )
}

/**
 * The message the report is about, under the reason.
 *
 * Three cases, and each says which it is rather than showing an empty line: a
 * message still standing, one the host deleted, and one whose row is gone
 * because the room was deleted.
 */
function ReportedMessage({ row }: { row: AdminReportRow }) {
  if (!row.messageBody) {
    return (
      <span className="block text-xs text-muted-foreground">
        The reported message is no longer on record.
      </span>
    )
  }

  return (
    <span
      className="block max-w-80 truncate text-xs text-muted-foreground"
      title={row.messageBody}
    >
      &quot;{row.messageBody}&quot; from{" "}
      {row.messageAuthorName ?? "an account that is gone"}
      {row.messageDeletedAt ? ", deleted by the host" : ""}
    </span>
  )
}
