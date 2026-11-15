import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  CheckIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  FlagIcon,
  Loader2Icon,
  RotateCcwIcon,
  ShieldAlertIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow, SelectedMenuSeparator } from "@/components/shared/mass-select"
import { PanelCard } from "@/components/shared/panel-card"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName, useIsMadeUp } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
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
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { REPORT_STATUS_FILTERS, ReportSortColumn } from "@/lib/pomodoro/admin-lists"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"
import { ShareRowMenu, UnshareDialog, shareLabel, useShareActions } from "@/components/pomodoro/admin-share-actions"
import { UploadThumbnail } from "@/components/pomodoro/admin-uploads-dashboard"
import { deletePomodoroUploads } from "@/lib/api/pomodoro/admin-uploads-tags"
import { sharedFileReportReasonLabel } from "@/lib/pomodoro/shared-media-reports"
import { groupReportReasonLabel } from "@/lib/pomodoro/group-reports"

type SortColumn = ReportSortColumn
type Decision = "pending" | "resolved" | "dismissed"

type ReportsSearch = {
  q?: string
  status?: (typeof REPORT_STATUS_FILTERS)[number]
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
  /** Reports by or about one person, from a count on a report. */
  person?: string
}

/** Hide and Unhide wait on the server too, under their own names. */
type PendingDecision = {
  rowId: string | null
  decision: Decision | "hide" | "unhide"
} | null

/** Where a press came from. A bulk press is a bulk one even over one row. */
type PressFrom = "row" | "bulk"

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "context", label: "What was reported", sortable: false, column: "main" },
  { key: "room", label: "Where", column: "meta", className: "hidden max-w-44 md:hidden @4xl:table-cell" },
  { key: "reporter", label: "Reported by", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "created", label: "Reported", column: "meta", className: "hidden md:hidden @6xl:table-cell" },
]

const STATUS_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { label: "Waiting", variant: "default" },
  resolved: { label: "Resolved", variant: "secondary" },
  dismissed: { label: "Dismissed", variant: "outline" },
}

/** The same three decisions in past tense, for the bulk line. */
const DONE_VERB: Record<Decision, string> = {
  pending: "reopened",
  resolved: "resolved",
  dismissed: "dismissed",
}

/**
 * Safety → Reports on the Flowfly dashboard: the moderation queue. A member
 * reports a message, a profile, a shared file or a group; here an admin
 * reads it and decides. A report opens on the right with the thing it is
 * about in full (Tyler's pick "Report shows the thing"), Resolve and
 * Dismiss (or Reopen) at the foot, and Warn, Suspend and Delete in its ⋮.
 *
 * The reported message is shown as it was written, including one the host
 * has already deleted: the body stays in `room_messages` for exactly this
 * reason, and the room itself only ever saw "Message removed by the host".
 */
export function AdminReportsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminReportRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<ReportsSearch>()
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
  // from (null for a press over ticked rows).
  const [pending, setPending] = React.useState<PendingDecision>(null)
  const selection = useSelection()

  const load = React.useCallback(
    (pageSize: number) => listPomodoroReports({ search: query, status, sort, direction, page, pageSize, person }),
    [direction, page, person, query, sort, status]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "created" ? "desc" : "asc"))
  const { refresh } = list
  // Warn and Suspend for the person a report is about (admin task 05).
  const safety = useSafetyActions()
  const showPerson = (id: string) => setListSearch({ person: id, q: undefined, page: undefined })
  const personName = person
    ? (list.rows.find((row) => row.subjectUserId === person)?.subjectName ??
      list.rows.find((row) => row.reporterUserId === person)?.reporterName ??
      null)
    : null

  const { clear: clearSelection } = selection

  /**
   * One request, whether it came from a row or over ticked rows. A row keeps
   * the plain sentence it always had; ticked rows report how many moved and
   * how many did not, then drop the ticks.
   */
  const decide = React.useCallback(
    async (reportIds: string[], decision: Decision, from: PressFrom) => {
      const bulk = from === "bulk"
      setPending({ rowId: bulk ? null : reportIds[0], decision })
      try {
        const { reviewed, skipped } = await reviewPomodoroReports(reportIds, decision)
        if (bulk) {
          const line = describeBulkResult({
            done: reviewed.length,
            kept: skipped.length,
            one: "report",
            many: "reports",
            verb: DONE_VERB[decision],
          })
          if (!reviewed.length) showErrorToast(line)
          clearSelection()
        } else if (!reviewed.length) {
          // Another admin decided it first, or the report is gone. The
          // refresh still runs, so the row becomes whatever is now true.
          showErrorToast(getPomodoroAdminErrorMessage(new Error("REPORT_UNCHANGED")))
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

  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  // Hiding means nothing for a message report, so it is offered only over profiles.
  const profileIds = (ids: string[]) => list.rows.filter((row) => row.kind === "profile" && ids.includes(row.id)).map((row) => row.id)

  /**
   * Hide or restore the profiles behind the ticked reports. Hiding is about
   * the profile rather than the report, so it leaves the report's own
   * standing alone.
   */
  const hide = React.useCallback(
    async (reportIds: string[], hidden: boolean) => {
      setPending({ rowId: null, decision: hidden ? "hide" : "unhide" })
      try {
        const { changed, skipped } = await hidePomodoroProfiles(reportIds, hidden)
        const line = describeBulkResult({
          done: changed.length,
          kept: skipped.length,
          one: "profile",
          many: "profiles",
          verb: hidden ? "hidden" : "restored",
          keptReason: hidden ? "already hidden" : "already showing",
        })
        if (!changed.length) showErrorToast(line)
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

  // A shared file's report can take the file off sharing, or delete it
  // (task 05, part 2), with the same window and delete Member uploads uses.
  const shareActions = useShareActions({ onDone: refresh })
  const fileDel = useAdminDelete({
    one: "file",
    many: "files",
    run: deletePomodoroUploads,
    keptReason: "already gone, or kept by the site",
    selection,
    onDone: refresh,
  })
  const del = useAdminDelete({
    one: "report",
    many: "reports",
    run: deletePomodoroReports,
    keptReason: "already gone",
    selection,
    onDone: refresh,
  })
  // One running action holds every other button on the list until it ends.
  const busy = pending !== null || del.deleting || fileDel.deleting || shareActions.busy

  return (
    <AdminListTable
      noun="reports"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "reports", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "report-search",
        label: "Search reports",
        placeholder: "Search reason, room or reporter",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={person ? { name: personName, onClear: () => setListSearch({ person: undefined, page: undefined }) } : undefined}
      filter={{
        count: status !== "all" ? 1 : 0,
        onClear: () => setListSearch({ status: undefined, page: undefined }),
        children: (
          <FilterPick
            id="reports-status"
            label="Status"
            value={status === "all" ? undefined : status}
            any="All statuses"
            options={[
              ["pending", "Waiting"],
              ["resolved", "Resolved"],
              ["dismissed", "Dismissed"],
            ]}
            onChange={(next) => setListSearch({ status: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) => {
        const run = (work: () => void) => () => {
          menu.close()
          work()
        }
        return (
          <>
            <SelectedMenuRow onClick={run(() => void decide(ids, "resolved", "bulk"))}>
              <CheckIcon className="size-4" />
              Resolve
            </SelectedMenuRow>
            <SelectedMenuRow onClick={run(() => void decide(ids, "dismissed", "bulk"))}>
              <XIcon className="size-4" />
              Dismiss
            </SelectedMenuRow>
            <SelectedMenuRow onClick={run(() => void decide(ids, "pending", "bulk"))}>
              <RotateCcwIcon className="size-4" />
              Reopen
            </SelectedMenuRow>
            {/* Hiding is the one power an admin has over a profile, and it
                means nothing for a message report. */}
            {profileIds(ids).length ? (
              <>
                <SelectedMenuRow onClick={run(() => void hide(profileIds(ids), true))}>
                  <EyeOffIcon className="size-4" />
                  Hide {profileIds(ids).length} {plural(profileIds(ids).length, "profile", "profiles")}
                </SelectedMenuRow>
                <SelectedMenuRow onClick={run(() => void hide(profileIds(ids), false))}>
                  <EyeIcon className="size-4" />
                  Unhide {profileIds(ids).length} {plural(profileIds(ids).length, "profile", "profiles")}
                </SelectedMenuRow>
              </>
            ) : null}
            <SelectedMenuSeparator />
            <SelectedMenuRow className="text-destructive" onClick={run(() => del.ask(ids))}>
              <Trash2Icon className="size-4" />
              Delete
            </SelectedMenuRow>
          </>
        )
      }}
      bulkBusy={busy}
      rowIds={rowIds}
      record={{
        label: "Report",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Report" icon={<FlagIcon aria-hidden />} line="Nobody has reported anything." />
          const subject = row.subjectUserId ? { id: row.subjectUserId, name: row.subjectName ?? "this person" } : null
          return (
            <DetailRecord
              key={row.id}
              icon={<FlagIcon aria-hidden />}
              title={reportSubject(row)}
              line={`${row.reporterName ?? "Signed-out reader"} · ${formatDateTime(row.createdAt)}`}
              hideLabel="Hide the report"
              actions={
                <>
                  {row.mediaId && row.fileName ? (
                    <ShareRowMenu
                      row={{
                        mediaId: row.mediaId,
                        name: row.fileName,
                        share: row.fileShare ?? "off",
                        featured: row.fileFeatured,
                        handle: row.reportedHandle,
                      }}
                      actions={shareActions}
                      onDeleteFile={() => fileDel.ask([row.mediaId!])}
                      busy={busy}
                    />
                  ) : null}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Report menu">
                        <EllipsisVerticalIcon className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      {subject ? (
                        <>
                          <DropdownMenuItem onSelect={() => safety.warn(subject)}>
                            <TriangleAlertIcon />
                            Warn {subject.name}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => safety.suspend(subject)}>
                            <ShieldAlertIcon />
                            Suspend {subject.name}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {row.kind === "profile" ? (
                        <DropdownMenuItem onSelect={() => void hide([row.id], !row.reportedHiddenAt)}>
                          {row.reportedHiddenAt ? <EyeIcon /> : <EyeOffIcon />}
                          {row.reportedHiddenAt ? "Show the profile" : "Hide the profile"}
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => del.ask([row.id])}>
                        <Trash2Icon />
                        Delete report
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
              facts={[
                ["Where", reportSubject(row)],
                [
                  "Reported by",
                  <MemberName
                    key="reporter"
                    id={row.reporterUserId}
                    name={row.reporterName ?? "Signed-out reader"}
                    title={row.reporterEmail ?? "No account"}
                  />,
                ],
                ["Reported", formatDateTime(row.createdAt)],
                ...(row.reviewerName && row.reviewedAt
                  ? ([["Decided by", `${row.reviewerName} · ${formatDateTime(row.reviewedAt)}`]] as [string, string][])
                  : []),
              ]}
              state={STATUS_LOOK[row.status]?.label ?? row.status}
              footer={
                row.status === "pending" ? (
                  <>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void decide([row.id], "dismissed", "row")}>
                      {pending?.rowId === row.id && pending.decision === "dismissed" ? <Loader2Icon className="animate-spin" /> : <XIcon />}
                      Dismiss
                    </Button>
                    <Button type="button" disabled={busy} onClick={() => void decide([row.id], "resolved", "row")}>
                      {pending?.rowId === row.id && pending.decision === "resolved" ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                      Resolve
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void decide([row.id], "pending", "row")}>
                    {pending?.rowId === row.id && pending.decision === "pending" ? <Loader2Icon className="animate-spin" /> : <RotateCcwIcon />}
                    Reopen
                  </Button>
                )
              }
            >
              <PanelCard storageId="pomodoro-flowfly-report-thing" icon={<FlagIcon />} title="What was reported">
                <div className="grid gap-2 text-sm [&_.truncate]:whitespace-normal [&_[class*=max-w-]]:max-w-none">
                  <p className="font-medium">{reportReason(row)}</p>
                  <ReportedMessage row={row} />
                  <ReportPeople row={row} onShow={showPerson} onWarn={safety.warn} onSuspend={safety.suspend} />
                </div>
              </PanelCard>
            </DetailRecord>
          )
        },
      }}
      windows={
        <>
          <AdminDeleteConfirm
            del={del}
            title={`Delete ${del.ids.length} ${plural(del.ids.length, "report", "reports")}?`}
            description="The reports are removed from the queue for good. Nobody is told, unlike Resolve and Dismiss, which thank the person who reported. The message or profile they were about is not touched. This cannot be undone."
            confirmLabel={plural(del.ids.length, "Delete report", "Delete reports")}
          />
          <AdminDeleteConfirm
            del={fileDel}
            title="Delete this file?"
            description="The file is removed from storage and leaves its owner's uploads. Anybody using it falls back to the default background or to silence. The owner is not told. This cannot be undone."
            confirmLabel="Delete file"
          />
          <UnshareDialog actions={shareActions} />
          {safety.dialogs}
        </>
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={`the report about ${reportSubject(row)}`}
          onDelete={() => del.ask([row.id])}
          buttons={
            row.status === "pending"
              ? [
                  { label: `Resolve the report about ${reportSubject(row)}`, icon: <CheckIcon className="size-4" />, onPress: () => void decide([row.id], "resolved", "row") },
                  { label: `Dismiss the report about ${reportSubject(row)}`, icon: <XIcon className="size-4" />, onPress: () => void decide([row.id], "dismissed", "row") },
                ]
              : [{ label: `Reopen the report about ${reportSubject(row)}`, icon: <RotateCcwIcon className="size-4" />, onPress: () => void decide([row.id], "pending", "row") }]
          }
        >
          <MainCell name={reportReason(row)}>
            {row.kind === "profile" && row.reportedHiddenAt ? <Chip muted>Hidden</Chip> : null}
          </MainCell>
          <TableCell column="meta" className="hidden max-w-44 md:hidden @4xl:table-cell">
            <span className="block truncate">{reportSubject(row)}</span>
          </TableCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @5xl:table-cell">
            {/* A profile report can come from a reader with no account at all. */}
            <MemberName
              id={row.reporterUserId}
              name={row.reporterName ?? "Signed-out reader"}
              title={row.reporterEmail ?? "No account"}
              className="max-w-full font-normal"
            />
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.status !== "pending"}>{STATUS_LOOK[row.status]?.label ?? row.status}</Chip>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @6xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
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
/**
 * What one report is about, in something an operator can scan.
 *
 * A message report is about a room; a profile report is about a person, named
 * by their handle so it matches the address an operator would open to look.
 */
function reportSubject(row: AdminReportRow) {
  if (row.kind === "shared_file")
    return row.fileName ? `Shared file: ${row.fileName}` : "A shared file"
  if (row.kind === "copyright")
    return row.fileName
      ? `Copyright: ${row.fileName}`
      : "Copyright, outside"
  if (row.kind === "profile") {
    return row.reportedHandle
      ? `/u/${row.reportedHandle}`
      : (row.reportedName ?? "A profile")
  }
  if (row.kind === "group")
    return row.groupName ? `Group: ${row.groupName}` : "A deleted group"
  return row.roomName ?? "A room"
}

/** A shared file's reason in words, and a copyright claim by what it is. */
function reportReason(row: AdminReportRow) {
  if (row.kind === "shared_file") return sharedFileReportReasonLabel(row.reason)
  if (row.kind === "copyright") return "Copyright claim from outside, answered by email"
  if (row.kind === "group") return groupReportReasonLabel(row.reason)
  return row.reason
}

function ReportedMessage({ row }: { row: AdminReportRow }) {
  // A report on a made-up member's line paused that account the moment it was
  // made (live activity task 05, Part 5). Reviewing does not unpause it.
  const madeUp = useIsMadeUp(row.subjectUserId)
  if (row.kind === "shared_file" || row.kind === "copyright")
    return <ReportedFile row={row} />
  if (row.kind === "group") return <ReportedGroup row={row} />
  if (!row.messageBody) {
    return (
      <span className="block text-xs text-muted-foreground">
        The reported message is no longer on record.
      </span>
    )
  }

  const quoted = (
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
  if (!madeUp) return quoted
  return (
    <>
      {quoted}
      <span className="block text-xs text-muted-foreground">
        Made-up account. The report paused it; unpause it on{" "}
        <Link to="/admin/flowfly" search={flowflyLink("madeup", { tab: "paused", part: "members" })} className="underline underline-offset-4">
          the watch page
        </Link>
        .
      </span>
    </>
  )
}

/**
 * The shared file a report is about, with a small preview, and for a
 * copyright claim from outside who sent it, how to reply, and what they say
 * it copies (task 05, parts 2 and 6).
 */
function ReportedFile({ row }: { row: AdminReportRow }) {
  return (
    <span className="mt-1 flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      {row.mediaId && row.fileName ? (
        <span className="flex min-w-0 items-center gap-2">
          <UploadThumbnail kind={row.fileKind} url={row.fileUrl} />
          <span className="min-w-0">
            <span className="block max-w-64 truncate" title={row.fileName}>
              {row.fileName}
            </span>
            <span className="block">
              {shareLabel(row.fileShare ?? "off", row.fileFeatured) ?? "Not shared"}
              {row.subjectName ? (
                <>
                  {" · by "}
                  <MemberName
                    id={row.subjectUserId}
                    name={row.subjectName}
                    className="inline font-normal"
                  />
                </>
              ) : null}
            </span>
          </span>
        </span>
      ) : (
        <span className="block">
          {row.kind === "copyright"
            ? "The address does not point at a shared file."
            : "The reported file is no longer on record."}
        </span>
      )}
      {row.kind === "copyright" ? (
        <>
          <span className="block max-w-80 truncate">
            From {row.contactName} ·{" "}
            <a
              href={`mailto:${row.contactEmail ?? ""}`}
              className="underline-offset-4 hover:underline"
            >
              {row.contactEmail}
            </a>
          </span>
          <span className="block max-w-80 truncate" title={row.details ?? undefined}>
            {row.details}
          </span>
        </>
      ) : null}
    </span>
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

/**
 * A group report (groups task 01, part 24): the line under the group's name,
 * its public page when it has one, and the way to it in Groups, where an
 * admin deletes a group.
 */
function ReportedGroup({ row }: { row: AdminReportRow }) {
  if (!row.groupId) return null
  return (
    <span className="block max-w-80 text-xs text-muted-foreground">
      {row.groupDescription ? (
        <span className="block truncate" title={row.groupDescription}>
          &quot;{row.groupDescription}&quot;
        </span>
      ) : (
        <span className="block">No line under the name.</span>
      )}
      <span className="flex flex-wrap gap-x-3">
        {row.groupHandle ? <span>/team/{row.groupHandle}</span> : null}
        <Link
          to="/admin/flowfly"
          search={flowflyLink("groups", { open: row.groupId })}
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Open in Groups
        </Link>
      </span>
    </span>
  )
}
