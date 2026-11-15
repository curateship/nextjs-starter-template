import * as React from "react"
import { MailIcon, MailXIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { cancelPomodoroInvites, listPomodoroInvites, type AdminInviteRow } from "@/lib/api/pomodoro/admin-rooms"
import { formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { INVITE_STATUS_FILTERS, InviteSortColumn } from "@/lib/pomodoro/admin-lists"

type InvitesSearch = {
  q?: string
  status?: (typeof INVITE_STATUS_FILTERS)[number]
  sort?: InviteSortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<InviteSortColumn>[] = [
  { key: "email", label: "Invited", column: "main" },
  { key: "room", label: "Room", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "created", label: "Made", column: "meta", className: "hidden md:hidden @3xl:table-cell" },
]

const STATUS_WORDS: Record<string, string> = {
  queued: "Waiting to send",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
}

/**
 * Rooms → Invites on the Flowfly dashboard: every room invitation (admin
 * task 04), who it went to, for which room, and where it has got to. One
 * still waiting to go out can be cancelled, and its link then says it is no
 * longer valid. An invitation opens on the right with its room and host.
 * See `workspace/docs/rooms-admin.md`.
 */
export function AdminInvitesDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminInviteRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<InvitesSearch>()
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
  const load = React.useCallback(
    (pageSize: number) => listPomodoroInvites({ search: query, status, sort, direction, page, pageSize }),
    [direction, page, query, sort, status]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<InviteSortColumn>({ sort, direction }, (column) => (column === "created" ? "desc" : "asc"))
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const cancel = useAdminDelete({
    one: "invitation",
    many: "invitations",
    run: cancelPomodoroInvites,
    verb: "cancelled",
    keptReason: "already sent, failed or cancelled",
    selection,
    onDone: list.refresh,
  })
  const waiting = (ids: string[]) => ids.filter((id) => list.rows.find((row) => row.id === id)?.status === "queued")

  return (
    <AdminListTable
      noun="invitations"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "invitations", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "invite-search",
        label: "Search invitations",
        placeholder: "Search address, room or host",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      filter={{
        count: status !== "all" ? 1 : 0,
        onClear: () => setListSearch({ status: undefined, page: undefined }),
        children: (
          <FilterPick
            id="invites-status"
            label="Status"
            value={status === "all" ? undefined : status}
            any="All statuses"
            options={Object.entries(STATUS_WORDS)}
            onChange={(next) => setListSearch({ status: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) =>
        waiting(ids).length ? (
          <SelectedMenuRow
            className="text-destructive"
            onClick={() => {
              menu.close()
              cancel.ask(waiting(ids))
            }}
          >
            <MailXIcon className="size-4" />
            Cancel {waiting(ids).length} waiting
          </SelectedMenuRow>
        ) : (
          <p className="px-1.5 py-1 text-sm text-muted-foreground">Only an invitation waiting to send can be cancelled.</p>
        )
      }
      bulkBusy={cancel.deleting}
      rowIds={rowIds}
      record={{
        label: "Invitation",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Invitation" icon={<MailIcon aria-hidden />} line="No host has invited anyone yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<MailIcon aria-hidden />}
              title={row.email}
              line={row.roomName}
              hideLabel="Hide the invitation"
              facts={[
                ["Room", row.roomName],
                ["Host", <MemberName key="host" id={row.hostUserId} name={row.hostName} />],
                ["Room starts", row.roomStartsAt ? formatDateTime(row.roomStartsAt) : "Already open"],
                ["Made", formatDateTime(row.createdAt)],
                ...(row.failureReason ? ([["Why it failed", row.failureReason]] as [string, string][]) : []),
              ]}
              state={STATUS_WORDS[row.status] ?? row.status}
              footer={
                row.status === "queued" ? (
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => cancel.ask([row.id])}>
                    <MailXIcon />
                    Cancel
                  </Button>
                ) : null
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={cancel}
          title={`Cancel ${cancel.ids.length} ${plural(cancel.ids.length, "invitation", "invitations")}?`}
          description="They will not be sent. The room itself is not touched, and anybody already holding the link can still join while the room is open."
          confirmLabel={plural(cancel.ids.length, "Cancel invitation", "Cancel invitations")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={`the invitation to ${row.email}`}
          tickable={row.status === "queued"}
          onDelete={row.status === "queued" ? () => cancel.ask([row.id]) : undefined}
        >
          <MainCell name={row.email}>
            {row.failureReason ? <span className="min-w-0 truncate text-xs text-muted-foreground">{row.failureReason}</span> : null}
          </MainCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @lg:table-cell">
            <span className="block truncate">{row.roomName}</span>
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.status !== "queued"}>{STATUS_WORDS[row.status] ?? row.status}</Chip>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @3xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
