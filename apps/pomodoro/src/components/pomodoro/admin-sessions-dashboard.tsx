import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon, TimerIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  deletePomodoroSessions,
  listPomodoroSessions,
  type AdminSessionRow,
} from "@/lib/api/pomodoro/admin"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { SESSION_MODE_FILTERS, SESSION_STATUS_FILTERS, SessionSortColumn } from "@/lib/pomodoro/admin-lists"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"

type SortColumn = SessionSortColumn

type SessionsSearch = {
  q?: string
  mode?: (typeof SESSION_MODE_FILTERS)[number]
  status?: (typeof SESSION_STATUS_FILTERS)[number]
  user?: string
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "person", label: "Member", column: "main" },
  { key: "mode", label: "Kind", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "length", label: "Ran for", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "started", label: "Started", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
]

const MODE_LABELS: Record<string, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

const STATUS_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  running: { label: "Running", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Finished", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
}

/**
 * Tasks → Sessions on the Flowfly dashboard: every timer run, newest first.
 * Narrowed to one member from their record or Focus, the chip names them
 * with an × to show everyone again. A run opens on the right with its task,
 * room and times (Tyler's pick "Task and session records"). Its note never
 * shows: a session note is private to the person who wrote it
 * (`workspace/docs/session-notes.md`).
 */
export function AdminSessionsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminSessionRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<SessionsSearch>()
  const setListSearch = useListSearchNavigate()
  const navigate = useNavigate()
  const query = search.q ?? ""
  const mode = search.mode ?? "all"
  const status = search.status ?? "all"
  const userId = search.user ?? null
  const sort: SortColumn = search.sort ?? "started"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )

  const selection = useSelection()

  const load = React.useCallback(
    (pageSize: number) => listPomodoroSessions({ search: query, mode, status, userId, sort, direction, page, pageSize }),
    [direction, mode, page, query, sort, status, userId]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "person" ? "asc" : "desc"))
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])

  // Whose sessions these are, taken off the first row rather than fetched: the
  // filter is an account id, and every row it can return belongs to them.
  const filteredMemberName = userId ? (list.rows[0]?.userName ?? null) : null

  const del = useAdminDelete({
    one: "session",
    many: "sessions",
    run: deletePomodoroSessions,
    keptReason: "still running, or already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))
  // Focus leads here, and this leads on to what the member was working
  // through, which closes the loop the three lists make.
  const showTasks = (userId: string) => void navigate({ to: "/admin/flowfly", search: flowflyLink("tasks", { user: userId }) })
  const kind = (row: AdminSessionRow) => MODE_LABELS[row.mode] ?? row.mode

  return (
    <AdminListTable
      noun="sessions"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "sessions", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "session-search",
        label: "Search sessions",
        placeholder: "Search name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredMemberName, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
      filter={{
        count: (mode !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0),
        onClear: () => setListSearch({ mode: undefined, status: undefined, page: undefined }),
        children: (
          <>
            <FilterPick
              id="sessions-kind"
              label="Kind"
              value={mode === "all" ? undefined : mode}
              any="Focus and breaks"
              options={[
                ["focus", "Focus"],
                ["short", "Short breaks"],
                ["long", "Long breaks"],
              ]}
              onChange={(next) => setListSearch({ mode: next, page: undefined })}
            />
            <FilterPick
              id="sessions-status"
              label="Status"
              value={status === "all" ? undefined : status}
              any="All statuses"
              options={[
                ["running", "Running"],
                ["paused", "Paused"],
                ["completed", "Finished"],
                ["cancelled", "Cancelled"],
              ]}
              onChange={(next) => setListSearch({ status: next, page: undefined })}
            />
          </>
        ),
      }}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            del.ask(ids)
          }}
        >
          <Trash2Icon className="size-4" />
          Delete
        </SelectedMenuRow>
      )}
      bulkBusy={del.deleting}
      rowIds={rowIds}
      record={{
        label: "Session",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Session" icon={<TimerIcon aria-hidden />} line="No timer has run yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<TimerIcon aria-hidden />}
              title={`${kind(row)}, ${formatDuration(row.accumulatedSeconds * 1000, { zero: "0m" })}`}
              line={`${row.userName} · ${formatDateTime(row.createdAt)}`}
              hideLabel="Hide the session"
              facts={[
                ["Member", <MemberName key="member" id={row.userId} name={row.userName} title={row.userEmail} />],
                ["Task", row.taskTitle ?? "None"],
                ["Room", row.roomName ?? "None"],
                ["Kind", kind(row)],
                ["Ran for", formatDuration(row.accumulatedSeconds * 1000, { zero: "0m" })],
                ["Planned", formatDuration(row.plannedSeconds * 1000)],
                ["Started", formatDateTime(row.createdAt)],
              ]}
              state={STATUS_LOOK[row.status]?.label ?? row.status}
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => showTasks(row.userId)}>
                    <ListChecksIcon />
                    Their tasks
                  </Button>
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={del}
          title={`Delete ${del.ids.length} ${plural(del.ids.length, "session", "sessions")}?`}
          description={describeSessionDeletion(asked)}
          confirmLabel={plural(del.ids.length, "Delete session", "Delete sessions")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={`the ${kind(row)} run by ${row.userName}`}
          onDelete={() => del.ask([row.id])}
          buttons={[{ label: `Tasks for ${row.userName}`, icon: <ListChecksIcon className="size-4" />, onPress: () => showTasks(row.userId) }]}
        >
          <MainCell name={row.userName}>
            {/* What the run was for, when there was something. */}
            {row.taskTitle || row.roomName ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {[row.taskTitle, row.roomName && `in ${row.roomName}`].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </MainCell>
          <TableCell column="meta" className="hidden md:hidden @2xl:table-cell">
            {kind(row)}
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.status !== "running"}>{STATUS_LOOK[row.status]?.label ?? row.status}</Chip>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            {formatDuration(row.accumulatedSeconds * 1000, { zero: "-" })}
            <span className="text-muted-foreground"> of {formatDuration(row.plannedSeconds * 1000)}</span>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @5xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/**
 * What the delete takes out of people's history, worked out from the rows on
 * screen: only a finished focus ever counted towards anyone's totals.
 */
function describeSessionDeletion(rows: AdminSessionRow[]) {
  const counted = rows.filter(
    (row) => row.mode === "focus" && row.status === "completed"
  )
  const live = rows.filter(
    (row) => row.status === "running" || row.status === "paused"
  )
  const people = [...new Set(counted.map((row) => row.userName))]
  const seconds = counted.reduce((sum, row) => sum + row.accumulatedSeconds, 0)
  const whose =
    people.length === 1 ? `${people[0]}'s` : `${people.length} people's`
  const lines = [
    counted.length
      ? `${formatDuration(seconds * 1000)} of finished focus comes off ${whose} history, and their streak and leaderboard figures drop to match. Badges already earned stay.`
      : "None of these counted towards anyone's focus totals, so no figures change.",
  ]
  if (live.length)
    lines.push(
      `${live.length} ${plural(live.length, "timer is", "timers are")} still running and will be left alone.`
    )
  lines.push("This cannot be undone.")
  return lines.join(" ")
}
