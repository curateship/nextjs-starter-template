import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { MailIcon, MailXIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import {
  AdminListTable,
  AdminSelectCell,
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
  cancelPomodoroInvites,
  listPomodoroInvites,
  type AdminInviteRow,
} from "@/lib/api/pomodoro/admin-rooms"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { InviteSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-invites")

const COLUMNS: TableHeaderColumn<InviteSortColumn>[] = [
  { key: "email", label: "Invited", column: "main" },
  { key: "room", label: "Room", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden 2xl:table-cell" },
]

const STATUS_LOOK: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  queued: { label: "Waiting to send", variant: "default" },
  sent: { label: "Sent", variant: "secondary" },
  failed: { label: "Failed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "outline" },
}

/**
 * Every room invitation (admin task 04): who it went to, for which room, and
 * where it has got to. One still waiting to go out can be cancelled, and its
 * link then says it is no longer valid. See `workspace/docs/rooms-admin.md`.
 */
export function AdminInvitesDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminInviteRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const sort: InviteSortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const selection = useSelection()
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroInvites({ search: query, status, sort, direction, page, pageSize }),
    [direction, page, query, sort, status]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<InviteSortColumn>({ sort, direction }, (column) =>
    column === "created" ? "desc" : "asc"
  )
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const waitingIds = rowIds.filter(
    (id) =>
      selection.selected.has(id) &&
      list.rows.find((row) => row.id === id)?.status === "queued"
  )
  const cancel = useAdminDelete({
    one: "invitation",
    many: "invitations",
    run: cancelPomodoroInvites,
    verb: "cancelled",
    keptReason: "already sent, failed or cancelled",
    selection,
    onDone: list.refresh,
  })

  return (
    <>
      <AdminListTable
        title="Room invites"
        icon={<MailIcon />}
        noun="invitations"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "invitations", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton
              del={cancel}
              ids={waitingIds}
              label="Cancel"
              icon={<MailXIcon className="size-4" />}
            />
            <DashboardToolbarSearch
              name="invite-search"
              aria-label="Search invitations"
              placeholder="Search address, room or host…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={status}
              onValueChange={(value) =>
                setListSearch({ status: value === "all" ? undefined : value, page: undefined })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Waiting to send</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select the invitation to ${row.email}`} />
            <TableCell column="main">
              <span className="block max-w-96 truncate" title={row.email}>
                {row.email}
              </span>
              {row.failureReason ? (
                <span className="block max-w-96 truncate text-xs text-muted-foreground">
                  {row.failureReason}
                </span>
              ) : null}
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <span className="block truncate" title={row.roomName}>
                {row.roomName}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                <MemberName id={row.hostUserId} name={row.hostName} className="inline font-normal" />
                {row.roomStartsAt ? ` · ${formatDateTime(row.roomStartsAt)}` : ""}
              </span>
            </TableCell>
            <TableCell column="meta">
              <Badge variant={STATUS_LOOK[row.status]?.variant ?? "outline"}>
                {STATUS_LOOK[row.status]?.label ?? row.status}
              </Badge>
            </TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              {row.status === "queued" ? (
                <AdminRowDeleteButton
                  del={cancel}
                  id={row.id}
                  label={`Cancel the invitation to ${row.email}`}
                  icon={<MailXIcon className="size-4" />}
                />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={cancel}
        title={`Cancel ${cancel.ids.length} ${plural(cancel.ids.length, "invitation", "invitations")}?`}
        description="They will not be sent. The room itself is not touched, and anybody already holding the link can still join while the room is open."
        confirmLabel={plural(cancel.ids.length, "Cancel invitation", "Cancel invitations")}
      />
    </>
  )
}
