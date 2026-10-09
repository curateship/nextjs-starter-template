import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
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
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminSelectCell,
  AdminListTable,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import {
  deletePomodoroReports,
  getPomodoroAdminErrorMessage,
  listPomodoroReports,
  hidePomodoroProfiles,
  reviewPomodoroReports,
  type AdminReportRow,
} from "@/lib/api/pomodoro/admin"
import { useSafetyActions } from "@/components/pomodoro/admin-safety-dialogs"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
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

/** The press the screen is waiting on, or null when nothing is in flight. */
type PendingDecision = { rowId: string | null; decision: Decision } | null

/** Where a press came from. A toolbar press is a bulk one even over one row. */
type PressFrom = "row" | "toolbar"

// "Reported" hides below 2xl, the room is capped and the reviewer line is
// short. With the bin added on 8 Oct 2026 the row actions ran 216px past the
// right-hand edge of a 1280px screen, measured.
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
    className: "hidden 2xl:table-cell",
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

/** The same three decisions in past tense, for the bulk line. */
const DONE_VERB: Record<Decision, string> = {
  pending: "reopened",
  resolved: "resolved",
  dismissed: "dismissed",
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
  const person = search.person
  const status = search.status ?? "all"
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  // The press waiting on the server: which decision, and which row it came
  // from. `rowId` is null for a toolbar press over a ticked selection. Held as
  // one value so a row can tell which of its own buttons should be spinning.
  const [pending, setPending] = React.useState<PendingDecision>(null)
  const selection = useSelection()

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
        person,
      }),
    [direction, page, person, query, sort, status]
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
  // Warn and Suspend for the person a report is about (admin task 05).
  const safety = useSafetyActions()
  const showPerson = (id: string) => setListSearch({ person: id, q: undefined, page: undefined })
  const personName = person
    ? (list.rows.find((row) => row.subjectUserId === person)?.subjectName ??
      list.rows.find((row) => row.reporterUserId === person)?.reporterName ??
      "one person")
    : null

  const { clear: clearSelection } = selection

  /**
   * One request, whether it came from a row or from the toolbar over a ticked
   * selection. A row keeps the plain sentence it always had. The toolbar reports
   * how many moved and how many did not, because a report already at that
   * standing is left alone, and it then drops the ticks.
   *
   * Which of the two it is comes from `from`, never from the count. A toolbar
   * press over a single ticked row is still a toolbar press: counting rows left
   * that tick on screen, offering to resolve a report that had just been
   * resolved.
   */
  const decide = React.useCallback(
    async (reportIds: string[], decision: Decision, from: PressFrom) => {
      const bulk = from === "toolbar"
      setPending({ rowId: bulk ? null : reportIds[0], decision })
      try {
        const { reviewed, skipped } = await reviewPomodoroReports(
          reportIds,
          decision
        )
        if (bulk) {
          toast.success(
            describeBulkResult({
              done: reviewed.length,
              kept: skipped.length,
              one: "report",
              many: "reports",
              verb: DONE_VERB[decision],
            })
          )
          clearSelection()
        } else if (reviewed.length) {
          toast.success(DONE_TEXT[decision])
        } else {
          // The row did not move: another operator decided it first, or the
          // report is gone. Said as a failure, but the refresh still runs, so
          // the row on screen becomes whatever is now true.
          showErrorToast(
            getPomodoroAdminErrorMessage(new Error("REPORT_UNCHANGED"))
          )
        }
        await refresh()
      } catch (error) {
        showErrorToast(getPomodoroAdminErrorMessage(error))
      } finally {
        setPending(null)
      }
    },
    [clearSelection, refresh]
  )

  // The ticked rows on this page, in the order they are drawn.
  const rowIds = React.useMemo(
    () => list.rows.map((row) => row.id),
    [list.rows]
  )
  const selectedIds = React.useMemo(
    () => rowIds.filter((id) => selection.selected.has(id)),
    [rowIds, selection.selected]
  )
  // Hiding means nothing for a message report, so the buttons appear only
  // when the ticked rows actually include a profile.
  const selectedProfileIds = React.useMemo(
    () =>
      list.rows
        .filter(
          (row) => row.kind === "profile" && selection.selected.has(row.id)
        )
        .map((row) => row.id),
    [list.rows, selection.selected]
  )

  /**
   * Hide or restore the profiles behind the ticked reports.
   *
   * Hiding is about the profile rather than the report, so it leaves the
   * report's own standing alone: an operator still resolves or dismisses it
   * afterwards, exactly as they would a message.
   */
  const hide = React.useCallback(
    async (reportIds: string[], hidden: boolean) => {
      setPending({ rowId: null, decision: "resolved" })
      try {
        const { changed, skipped } = await hidePomodoroProfiles(
          reportIds,
          hidden
        )
        toast.success(
          describeBulkResult({
            done: changed.length,
            kept: skipped.length,
            one: "profile",
            many: "profiles",
            verb: hidden ? "hidden" : "restored",
          })
        )
        clearSelection()
        await refresh()
      } catch (error) {
        showErrorToast(getPomodoroAdminErrorMessage(error))
      } finally {
        setPending(null)
      }
    },
    [clearSelection, refresh]
  )

  const del = useAdminDelete({
    one: "report",
    many: "reports",
    run: deletePomodoroReports,
    keptReason: "already gone",
    selection,
    onDone: refresh,
  })

  return (
    <>
      <AdminListTable
        title="Room reports"
        icon={<FlagIcon />}
        noun="reports"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "reports", rowIds, state: selection }}
        filters={
          person ? (
            <p className="flex items-center gap-2 text-sm">
              Reports by or about {personName}.
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                onClick={() => setListSearch({ person: undefined, page: undefined })}
              >
                Show everyone
              </Button>
            </p>
          ) : undefined
        }
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            {/* Multi-row actions come before the search box, the order every
                dashboard toolbar uses. They appear only with rows ticked, so the
                toolbar is never a line of dead buttons. */}
            {selectedIds.length ? (
              <>
                <BulkDecisionButton
                  decision="resolved"
                  icon={<CheckIcon className="size-4" />}
                  label="Resolve"
                  count={selectedIds.length}
                  pending={pending}
                  onClick={() => void decide(selectedIds, "resolved", "toolbar")}
                />
                <BulkDecisionButton
                  decision="dismissed"
                  icon={<XIcon className="size-4" />}
                  label="Dismiss"
                  count={selectedIds.length}
                  pending={pending}
                  onClick={() => void decide(selectedIds, "dismissed", "toolbar")}
                />
                <BulkDecisionButton
                  decision="pending"
                  icon={<RotateCcwIcon className="size-4" />}
                  label="Reopen"
                  count={selectedIds.length}
                  pending={pending}
                  onClick={() => void decide(selectedIds, "pending", "toolbar")}
                />
                {/* Hiding is the one power an operator has over a profile, and
                    it means nothing for a message report. */}
                {selectedProfileIds.length ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(pending)}
                      onClick={() => void hide(selectedProfileIds, true)}
                    >
                      <EyeOffIcon className="size-4" aria-hidden="true" />
                      Hide {selectedProfileIds.length}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(pending)}
                      onClick={() => void hide(selectedProfileIds, false)}
                    >
                      <EyeIcon className="size-4" aria-hidden="true" />
                      Unhide
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
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
        {list.rows.map((row) => (
          <TableRow key={row.id}>
            <AdminSelectCell
              selection={selection}
              id={row.id}
              label={`Select the report about ${reportSubject(row)}`}
            />
            <TableCell column="meta" className="max-w-44">
              {/* A message report names its room; a profile report names the
                  address an operator would open. */}
              <span className="block truncate" title={reportSubject(row)}>
                {reportSubject(row)}
              </span>
              {row.kind === "profile" && row.reportedHiddenAt ? (
                <span className="block text-xs text-muted-foreground">
                  hidden
                </span>
              ) : null}
            </TableCell>
            <TableCell column="main">
              <div className="min-w-0">
                <span className="block max-w-80 truncate" title={row.reason}>
                  {row.reason}
                </span>
                <ReportedMessage row={row} />
                <ReportPeople
                  row={row}
                  onShow={showPerson}
                  onWarn={safety.warn}
                  onSuspend={safety.suspend}
                />
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              {/* A profile report can come from a reader with no account at
                  all, which is the point of it being open. */}
              <MemberName
                id={row.reporterUserId}
                name={row.reporterName ?? "Signed-out reader"}
                title={row.reporterEmail ?? "No account"}
                className="max-w-full font-normal"
              />
              {row.reporterUserId && row.reporterPastReports ? (
                <button
                  type="button"
                  className="block truncate text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => showPerson(row.reporterUserId!)}
                >
                  {row.reporterPastDismissed} of {row.reporterPastReports} past{" "}
                  {plural(row.reporterPastReports, "report", "reports")} dismissed
                </button>
              ) : null}
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
                    className="mt-1 block max-w-32 truncate text-xs text-muted-foreground"
                    title={`${row.reviewerName} on ${formatDateTime(row.reviewedAt)}`}
                  >
                    {row.reviewerName} · {formatDateTime(row.reviewedAt)}
                  </span>
                ) : null}
              </div>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              {row.status === "pending" ? (
                <>
                  <RowDecisionButton
                    decision="resolved"
                    icon={<CheckIcon className="size-4" />}
                    label={`Resolve the report about ${reportSubject(row)}`}
                    rowId={row.id}
                    pending={pending}
                    onClick={() => void decide([row.id], "resolved", "row")}
                  />
                  <RowDecisionButton
                    decision="dismissed"
                    icon={<XIcon className="size-4" />}
                    label={`Dismiss the report about ${reportSubject(row)}`}
                    rowId={row.id}
                    pending={pending}
                    onClick={() => void decide([row.id], "dismissed", "row")}
                  />
                </>
              ) : (
                <RowDecisionButton
                  decision="pending"
                  icon={<RotateCcwIcon className="size-4" />}
                  label={`Reopen the report about ${reportSubject(row)}`}
                  rowId={row.id}
                  pending={pending}
                  onClick={() => void decide([row.id], "pending", "row")}
                />
              )}
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete the report about ${reportSubject(row)}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "report", "reports")}?`}
        description="The reports are removed from the queue for good. Nobody is told, unlike Resolve and Dismiss, which thank the person who reported. The message or profile they were about is not touched. This cannot be undone."
        confirmLabel={plural(del.ids.length, "Delete report", "Delete reports")}
      />
      {safety.dialogs}
    </>
  )
}

/**
 * The message the report is about, under the reason.
 *
 * Three cases, and each says which it is rather than showing an empty line: a
 * message still standing, one the host deleted, and one whose row is gone
 * because the room was deleted.
 */
/**
 * What one report is about, in something an operator can scan.
 *
 * A message report is about a room; a profile report is about a person, named
 * by their handle so it matches the address an operator would open to look.
 */
function reportSubject(row: AdminReportRow) {
  if (row.kind === "profile") {
    return row.reportedHandle
      ? `/u/${row.reportedHandle}`
      : (row.reportedName ?? "A profile")
  }
  return row.roomName ?? "A room"
}

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
      <MemberName
        id={row.subjectUserId}
        name={row.messageAuthorName ?? "an account that is gone"}
        className="inline font-normal"
      />
      {row.messageDeletedAt
        ? row.messageRemovedBy === "admin"
          ? ", removed by an admin"
          : ", deleted by the host"
        : ""}
    </span>
  )
}

/**
 * One decision button in a row.
 *
 * The button stays where it is while the server answers: it is disabled and its
 * own icon becomes the spinner, so the cell keeps its exact width and the row
 * never jumps. Swapping the pair for a bare spinner collapsed the cell to 16px
 * and moved every row below it.
 *
 * No tooltip: these repeat on every row, and the rulebook exempts repeated row
 * controls. The accessible name names the room, so a screen reader running down
 * the column hears which report each button belongs to.
 */
function RowDecisionButton({
  decision,
  icon,
  label,
  rowId,
  pending,
  onClick,
}: {
  decision: Decision
  icon: React.ReactNode
  label: string
  rowId: string
  pending: PendingDecision
  onClick: () => void
}) {
  const spinning = pending?.rowId === rowId && pending.decision === decision

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={pending !== null}
      onClick={onClick}
      aria-label={label}
    >
      {spinning ? <Loader2Icon className="size-4 animate-spin" /> : icon}
    </Button>
  )
}

/** The same decision, over every ticked row, from the toolbar. */
function BulkDecisionButton({
  decision,
  icon,
  label,
  count,
  pending,
  onClick,
}: {
  decision: Decision
  icon: React.ReactNode
  label: string
  count: number
  pending: PendingDecision
  onClick: () => void
}) {
  const spinning = pending?.rowId === null && pending?.decision === decision

  return (
    <DashboardToolbarButton
      type="button"
      variant={decision === "resolved" ? "default" : "outline"}
      disabled={pending !== null}
      onClick={onClick}
    >
      {spinning ? <Loader2Icon className="size-4 animate-spin" /> : icon}
      {label} ({count})
    </DashboardToolbarButton>
  )
}

/**
 * Under a report: how often its subject was reported before, which opens the
 * reports by or about them, and Warn and Suspend for that person (admin task
 * 05). Text buttons, so the row's actions keep their measured width.
 */
function ReportPeople({
  row,
  onShow,
  onWarn,
  onSuspend,
}: {
  row: AdminReportRow
  onShow: (id: string) => void
  onWarn: (person: { id: string; name: string }) => void
  onSuspend: (person: { id: string; name: string }) => void
}) {
  if (!row.subjectUserId) return null
  const person = { id: row.subjectUserId, name: row.subjectName ?? "this person" }
  const linkClass = "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
  return (
    <span className="flex flex-wrap items-center gap-x-3">
      {row.subjectPriorReports ? (
        <button type="button" className={linkClass} onClick={() => onShow(person.id)}>
          {person.name} was reported {row.subjectPriorReports}{" "}
          {plural(row.subjectPriorReports, "time", "times")} before
        </button>
      ) : null}
      <button type="button" className={linkClass} onClick={() => onWarn(person)}>
        Warn
      </button>
      <button type="button" className={linkClass} onClick={() => onSuspend(person)}>
        Suspend
      </button>
    </span>
  )
}
